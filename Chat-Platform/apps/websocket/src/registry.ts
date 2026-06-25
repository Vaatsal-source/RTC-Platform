import type { AuthenticatedWebSocket } from './types.js';
import { publisher } from './redis.js';

const connections = new Map<string, AuthenticatedWebSocket>();
const channelSubscribers = new Map<string, Set<AuthenticatedWebSocket>>();

export function registerConnection(ws: AuthenticatedWebSocket): void {
  connections.set(ws.userId, ws);
  console.log(`[Registry] User connected: ${ws.username} (${ws.userId}). Total: ${connections.size}`);
}

export function removeConnection(ws: AuthenticatedWebSocket): void {
  connections.delete(ws.userId);
  for (const [channelId, subscribers] of channelSubscribers.entries()) {
    subscribers.delete(ws);
    if (subscribers.size === 0) {
      channelSubscribers.delete(channelId);
    }
  }
  console.log(`[Registry] User disconnected: ${ws.username}. Total: ${connections.size}`);
}

export function subscribeToChannel(ws: AuthenticatedWebSocket, channelId: string): void {
  if (!channelSubscribers.has(channelId)) {
    channelSubscribers.set(channelId, new Set());
  }
  channelSubscribers.get(channelId)!.add(ws);
  console.log(`[Registry] ${ws.username} joined channel ${channelId}. Members: ${channelSubscribers.get(channelId)!.size}`);
}

export function unsubscribeFromChannel(ws: AuthenticatedWebSocket, channelId: string): void {
  const subscribers = channelSubscribers.get(channelId);
  if (!subscribers) return;
  subscribers.delete(ws);
  if (subscribers.size === 0) {
    channelSubscribers.delete(channelId);
  }
  console.log(`[Registry] ${ws.username} left channel ${channelId}`);
}

export function broadcastToChannel(
  channelId: string,
  message: string,
  excludeWs?: AuthenticatedWebSocket
): void {
  const envelope = JSON.stringify({
    target: 'channel',
    channelId,
    message,
    excludeUserId: excludeWs?.userId ?? null,
  });
  publisher.publish('ws:broadcast', envelope);
}

export function broadcastToAll(message: string, excludeWs?: AuthenticatedWebSocket): void {
  const envelope = JSON.stringify({
    target: 'all',
    message,
    excludeUserId: excludeWs?.userId ?? null,
  });
  publisher.publish('ws:broadcast', envelope);
}

export function sendToUser(userId: string, message: string): void {
  const client = connections.get(userId);
  if (client && client.readyState === 1) {
    client.send(message);
  }
}

export function getAllConnections(): Map<string, AuthenticatedWebSocket> {
  return connections;
}

export function getChannelSubscribers(): Map<string, Set<AuthenticatedWebSocket>> {
  return channelSubscribers;
}

export function dmKey(userIdA: string, userIdB: string): string {
  return `dm_${[userIdA, userIdB].sort().join('_')}`;
}
