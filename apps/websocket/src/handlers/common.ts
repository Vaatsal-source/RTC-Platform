import { loadChannel, type IChannel } from '@repo/database';
import { getChannelMembers } from '@repo/queue';
import type { Client } from '../types.js';
import { send } from '../registry.js';

export function sendError(ws: Client, message: string, code = 'BAD_REQUEST'): void {
  send(ws, 'ERROR', { message, code });
}

export interface ChannelContext {
  channel: IChannel;
  memberIds: string[];
}

/**
 * Loads the channel and verifies the socket's user may use it.
 * Membership is read from the Redis cache (`channel:<id>:members`) — the hot path —
 * and falls back to Mongo on a miss. Sends an error and returns null on failure.
 */
export async function requireChannel(ws: Client, channelId: string, opts: { writable?: boolean } = {}): Promise<ChannelContext | null> {
  const channel = await loadChannel(channelId);
  if (!channel) {
    sendError(ws, 'Channel not found', 'NOT_FOUND');
    return null;
  }
  const memberIds = await getChannelMembers(channelId);
  if (!memberIds || !memberIds.includes(ws.userId)) {
    sendError(ws, 'Channel not found', 'NOT_FOUND'); // don't reveal private channels exist
    return null;
  }
  if (opts.writable && channel.isArchived) {
    sendError(ws, 'This channel is archived and read-only', 'ARCHIVED');
    return null;
  }
  return { channel, memberIds };
}
