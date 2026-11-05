import type { BroadcastEnvelope, ServerMessageType } from '@repo/shared-types';
import { publishBroadcast } from '@repo/queue';
import type { Client } from './types.js';

// ═══════════════════════════════════════════════════════════════════════════
// Connection registry — owned by THIS process only.
//
//   connections:        userId   → sockets   (a user may have several tabs)
//   channelSubscribers: channelId → sockets  (the manual "rooms" `ws` lacks)
//
// Cross-instance delivery goes through Redis: callers never write to another
// instance's sockets directly, they publish a BroadcastEnvelope and every
// instance (including this one) calls deliver() for the sockets it owns.
// ═══════════════════════════════════════════════════════════════════════════

const OPEN = 1;

const connections = new Map<string, Set<Client>>();
const channelSubscribers = new Map<string, Set<Client>>();

export const stats = () => ({
  users: connections.size,
  sockets: [...connections.values()].reduce((n, s) => n + s.size, 0),
  channels: channelSubscribers.size,
});

export function registerConnection(ws: Client): void {
  let set = connections.get(ws.userId);
  if (!set) connections.set(ws.userId, (set = new Set()));
  set.add(ws);
}

export function removeConnection(ws: Client): void {
  const set = connections.get(ws.userId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) connections.delete(ws.userId);
  }
  for (const channelId of [...ws.channels]) unsubscribe(ws, channelId);
}

export function subscribe(ws: Client, channelId: string): void {
  let set = channelSubscribers.get(channelId);
  if (!set) channelSubscribers.set(channelId, (set = new Set()));
  set.add(ws);
  ws.channels.add(channelId);
}

export function unsubscribe(ws: Client, channelId: string): void {
  const set = channelSubscribers.get(channelId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) channelSubscribers.delete(channelId);
  }
  ws.channels.delete(channelId);
}

export function dropChannel(channelId: string): void {
  for (const ws of channelSubscribers.get(channelId) ?? []) ws.channels.delete(channelId);
  channelSubscribers.delete(channelId);
}

export const isSubscribed = (ws: Client, channelId: string): boolean => ws.channels.has(channelId);
export const socketsOf = (userId: string): Set<Client> => connections.get(userId) ?? new Set();
export const allSockets = (): Iterable<Client> => [...connections.values()].flatMap((s) => [...s]);

export function send(ws: Client, type: ServerMessageType, payload: unknown): void {
  if (ws.readyState === OPEN) ws.send(JSON.stringify({ type, payload }));
}

// ─── Publishing (goes through Redis so every WS instance sees it) ────────────
export const broadcastToChannel = (channelId: string, type: ServerMessageType, payload: unknown, excludeUserId?: string) =>
  publishBroadcast({ kind: 'channel', channelId }, type, payload, excludeUserId);

export const sendToUser = (userId: string, type: ServerMessageType, payload: unknown) =>
  publishBroadcast({ kind: 'user', userId }, type, payload);

// ─── Local delivery of an envelope received from Redis ───────────────────────
/** Returns the sockets this instance should write the envelope to. */
export function resolveLocalTargets(env: BroadcastEnvelope): Client[] {
  const { target, excludeUserId } = env;
  let candidates: Iterable<Client>;
  switch (target.kind) {
    case 'channel':
      candidates = channelSubscribers.get(target.channelId) ?? [];
      break;
    case 'user':
      candidates = connections.get(target.userId) ?? [];
      break;
    case 'workspaces': {
      const wanted = new Set(target.workspaceIds);
      candidates = [...allSockets()].filter((ws) => [...ws.workspaceIds].some((w) => wanted.has(w)));
      break;
    }
  }
  const out: Client[] = [];
  for (const ws of candidates) {
    if (excludeUserId && ws.userId === excludeUserId) continue;
    out.push(ws);
  }
  return out;
}

export function deliver(env: BroadcastEnvelope): Client[] {
  const targets = resolveLocalTargets(env);
  for (const ws of targets) if (ws.readyState === OPEN) ws.send(env.frame);
  return targets;
}
