import { fetchChannelHistory, getUserWorkspaceIds, listAccessibleChannelIds } from '@repo/database';
import type { ClientMessage } from '@repo/shared-types';
import type { Client } from '../types.js';
import { send, subscribe, unsubscribe } from '../registry.js';
import { requireChannel } from './common.js';

type Payload<T extends ClientMessage['type']> = Extract<ClientMessage, { type: T }>['payload'];

/**
 * Connection lifecycle step: "Subscribe to Channels".
 * Re-run whenever the user's workspace/channel membership changes (see CHANNEL_UPDATED handling).
 */
export async function refreshScope(ws: Client): Promise<void> {
  const [workspaceIds, channelIds] = await Promise.all([getUserWorkspaceIds(ws.userId), listAccessibleChannelIds(ws.userId)]);
  ws.workspaceIds = new Set(workspaceIds);
  const wanted = new Set(channelIds);
  for (const id of [...ws.channels]) if (!wanted.has(id)) unsubscribe(ws, id);
  for (const id of wanted) subscribe(ws, id);
}

// JOIN_CHANNEL — (re)verifies access, subscribes, and returns the latest page of history.
export async function handleJoinChannel(ws: Client, { channelId }: Payload<'JOIN_CHANNEL'>): Promise<void> {
  const ctx = await requireChannel(ws, channelId);
  if (!ctx) return;

  subscribe(ws, channelId);
  send(ws, 'CHANNEL_JOINED', { channelId });

  const page = await fetchChannelHistory(channelId);
  send(ws, 'MESSAGE_HISTORY', { channelId, ...page });
}

export function handleLeaveChannel(ws: Client, { channelId }: Payload<'LEAVE_CHANNEL'>): void {
  // Leaving the *view* — we keep the subscription so unread/notification flow still works.
  // Kept as an explicit protocol message for clients that want to stop receiving a channel.
  unsubscribe(ws, channelId);
}

// LOAD_MORE_MESSAGES — infinite scroll. `before` is the id (or ISO time) of the oldest message the client has.
export async function handleLoadMore(ws: Client, { channelId, before }: Payload<'LOAD_MORE_MESSAGES'>): Promise<void> {
  const ctx = await requireChannel(ws, channelId);
  if (!ctx) return;
  const page = await fetchChannelHistory(channelId, { before });
  send(ws, 'MORE_MESSAGES_LOADED', { channelId, ...page });
}
