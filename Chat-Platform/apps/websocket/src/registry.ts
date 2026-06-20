import type { AuthenticatedWebSocket } from './types.js';

// ─── Connection Registry ──────────────────────────────────────────────────────
// This module is the single source of truth for all live WebSocket connections.
// It lives in-memory on this WS server instance.
//
// TWO maps we maintain:
//   1. connections  → userId  → the actual WebSocket object
//   2. channelSubs  → channelId → Set of WebSocket objects subscribed to it
//
// When Redis Pub/Sub is added (Sprint 6), messages will flow through Redis
// instead of this map, enabling multi-instance scaling.
// ─────────────────────────────────────────────────────────────────────────────

// Maps userId → their authenticated WebSocket connection
const connections = new Map<string, AuthenticatedWebSocket>();

// Maps channelId → set of WebSocket clients subscribed to that channel
// This is the "rooms" system we build manually (ws has no built-in rooms)
const channelSubscribers = new Map<string, Set<AuthenticatedWebSocket>>();

// ─── Connection management ────────────────────────────────────────────────────

export function registerConnection(ws: AuthenticatedWebSocket): void {
  connections.set(ws.userId, ws);
  console.log(`[Registry] User connected: ${ws.username} (${ws.userId}). Total: ${connections.size}`);
}

export function removeConnection(ws: AuthenticatedWebSocket): void {
  connections.delete(ws.userId);

  // Also remove them from ALL channel subscriptions they were in
  for (const [channelId, subscribers] of channelSubscribers.entries()) {
    subscribers.delete(ws);
    // Clean up empty channel sets
    if (subscribers.size === 0) {
      channelSubscribers.delete(channelId);
    }
  }

  console.log(`[Registry] User disconnected: ${ws.username}. Total: ${connections.size}`);
}

// ─── Channel subscription management ─────────────────────────────────────────

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

// ─── Broadcasting ─────────────────────────────────────────────────────────────

// Broadcast to everyone subscribed to a specific channel
// excludeSelf: true when we don't want to echo back to the sender
export function broadcastToChannel(
  channelId: string,
  message: string,
  excludeWs?: AuthenticatedWebSocket
): void {
  const subscribers = channelSubscribers.get(channelId);
  if (!subscribers) return;

  for (const client of subscribers) {
    if (client === excludeWs) continue; // skip sender if requested
    if (client.readyState === 1) { // 1 = WebSocket.OPEN
      client.send(message);
    }
  }
}

// Broadcast to every single connected client (used for presence updates)
export function broadcastToAll(message: string, excludeWs?: AuthenticatedWebSocket): void {
  for (const [, client] of connections) {
    if (client === excludeWs) continue;
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

// Send a message to one specific user
export function sendToUser(userId: string, message: string): void {
  const client = connections.get(userId);
  if (client && client.readyState === 1) {
    client.send(message);
  }
}

// Get all currently live connections (used by heartbeat)
export function getAllConnections(): Map<string, AuthenticatedWebSocket> {
  return connections;
}

// ─── DM helper ────────────────────────────────────────────────────────────────
// We treat a 1:1 DM conversation as just another "channel" internally, but
// with a deterministic ID so both users always land in the same room
// regardless of who initiates: sorted userIds joined by '_'.
// e.g. dmKey('u2', 'u1') === dmKey('u1', 'u2') === 'dm_u1_u2'
export function dmKey(userIdA: string, userIdB: string): string {
  return `dm_${[userIdA, userIdB].sort().join('_')}`;
}