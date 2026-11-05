import { TYPING_TIMEOUT_MS, type ClientMessage } from '@repo/shared-types';
import type { Client } from '../types.js';
import { broadcastToChannel, isSubscribed } from '../registry.js';

// Module 6 — typing indicators. Ephemeral: never touches the database.
// The socket must already be subscribed to the channel (which implies the access
// check passed), so this hot path needs no I/O besides the Redis publish.

type Payload<T extends ClientMessage['type']> = Extract<ClientMessage, { type: T }>['payload'];

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const timerKey = (ws: Client, channelId: string) => `${ws.socketId}:${channelId}`;

function publish(ws: Client, channelId: string, isTyping: boolean): void {
  void broadcastToChannel(channelId, 'TYPING_UPDATE', { channelId, userId: ws.userId, username: ws.username, isTyping }, ws.userId);
}

export function handleTypingStart(ws: Client, { channelId }: Payload<'TYPING_START'>): void {
  if (!isSubscribed(ws, channelId)) return;
  const key = timerKey(ws, channelId);

  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  else publish(ws, channelId, true); // only announce on the false→true edge; repeats just extend the timer

  // Auto-timeout: no TYPING_START for 3s ⇒ stopped typing.
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      publish(ws, channelId, false);
    }, TYPING_TIMEOUT_MS),
  );
}

export function handleTypingStop(ws: Client, { channelId }: Payload<'TYPING_STOP'>): void {
  const key = timerKey(ws, channelId);
  const existing = timers.get(key);
  if (!existing) return;
  clearTimeout(existing);
  timers.delete(key);
  publish(ws, channelId, false);
}

/** Disconnecting mid-sentence must not leave "X is typing…" stuck on other screens. */
export function clearTypingFor(ws: Client): void {
  for (const channelId of ws.channels) handleTypingStop(ws, { channelId });
}
