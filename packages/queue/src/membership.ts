import { Types } from '@repo/database';
import { Channel, loadChannel, resolveChannelMemberIds, isValidId } from '@repo/database';
import { getRedis } from './redis.js';

// ─── Channel membership cache ─────────────────────────────────────────────────
// `channel:<id>:members` is a Redis SET of userIds allowed to see the channel.
// The WS server checks it on every JOIN/SEND, so it must be cheap. The API
// invalidates it whenever membership changes.

const TTL_SECONDS = 300;
const key = (channelId: string) => `channel:${channelId}:members`;
const EMPTY_MARKER = '__none__'; // a SET can't be empty, so cache "no members" explicitly

export async function getChannelMembers(channelId: string): Promise<string[] | null> {
  if (!isValidId(channelId)) return null;
  const redis = getRedis();
  try {
    const cached = await redis.smembers(key(channelId));
    if (cached.length) return cached.filter((m) => m !== EMPTY_MARKER);
  } catch {
    /* fall through to DB */
  }

  const channel = await loadChannel(channelId);
  if (!channel) return null;
  const members = await resolveChannelMemberIds(channel);
  try {
    await redis.multi().del(key(channelId)).sadd(key(channelId), ...(members.length ? members : [EMPTY_MARKER])).expire(key(channelId), TTL_SECONDS).exec();
  } catch {
    /* cache is best-effort */
  }
  return members;
}

export async function isChannelMember(channelId: string, userId: string): Promise<boolean> {
  const members = await getChannelMembers(channelId);
  return !!members && members.includes(userId);
}

export async function invalidateChannelMembers(...channelIds: string[]): Promise<void> {
  if (channelIds.length === 0) return;
  try {
    await getRedis().del(...channelIds.map(key));
  } catch (err) {
    console.error('[membership] failed to invalidate cache:', (err as Error).message);
  }
}

/** Workspace membership changed → every public channel's member set is stale. */
export async function invalidateWorkspaceChannels(workspaceId: string): Promise<void> {
  const ids = await Channel.find({ workspaceId: new Types.ObjectId(workspaceId), kind: 'public' }).distinct('_id');
  await invalidateChannelMembers(...ids.map(String));
}
