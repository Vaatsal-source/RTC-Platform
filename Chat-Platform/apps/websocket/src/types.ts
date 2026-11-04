import type { WebSocket } from 'ws';

// The raw `ws` socket plus the per-connection state we attach after the JWT check.
export interface Client extends WebSocket {
  socketId: string;
  userId: string;
  username: string;
  isAlive: boolean; // heartbeat flag
  workspaceIds: Set<string>; // workspaces the user belongs to (presence fan-out scope)
  channels: Set<string>; // channels this socket is subscribed to
  tokens: number; // rate-limit bucket
  tokensRefilledAt: number;
}
