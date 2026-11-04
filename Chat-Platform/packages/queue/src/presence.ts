import { getRedis } from './redis.js';

// ─── Online presence (Module 5) ───────────────────────────────────────────────
//   online:<userId>          = "true"   (TTL, refreshed by heartbeat)
//   presence:sockets:<userId> = SET of "<instanceId>:<socketId>"
//
// A user can have several tabs/devices connected to several WS instances, so
// "online" means "at least one live socket anywhere". TTLs make a crashed
// instance's entries expire on their own instead of leaving ghosts online.

export const PRESENCE_TTL_SECONDS = 90;
const onlineKey = (userId: string) => `online:${userId}`;
const socketsKey = (userId: string) => `presence:sockets:${userId}`;

/** Returns true when this connection flipped the user from offline → online. */
export async function addSocket(userId: string, socketRef: string): Promise<boolean> {
  const redis = getRedis();
  const wasOnline = (await redis.exists(onlineKey(userId))) === 1;
  await redis
    .multi()
    .sadd(socketsKey(userId), socketRef)
    .expire(socketsKey(userId), PRESENCE_TTL_SECONDS)
    .set(onlineKey(userId), 'true', 'EX', PRESENCE_TTL_SECONDS)
    .exec();
  return !wasOnline;
}

/** Returns true when this was the user's last socket (online → offline). */
export async function removeSocket(userId: string, socketRef: string): Promise<boolean> {
  const redis = getRedis();
  await redis.srem(socketsKey(userId), socketRef);
  const remaining = await redis.scard(socketsKey(userId));
  if (remaining > 0) return false;
  await redis.del(onlineKey(userId), socketsKey(userId));
  return true;
}

/** Called from the heartbeat for every live socket on this instance. */
export async function refreshPresence(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const pipe = getRedis().pipeline();
  for (const id of userIds) {
    pipe.expire(socketsKey(id), PRESENCE_TTL_SECONDS);
    pipe.set(onlineKey(id), 'true', 'EX', PRESENCE_TTL_SECONDS);
  }
  await pipe.exec();
}

export async function isOnline(userId: string): Promise<boolean> {
  return (await getRedis().exists(onlineKey(userId))) === 1;
}

export async function filterOnline(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const values = await getRedis().mget(...userIds.map(onlineKey));
  return userIds.filter((_, i) => values[i] === 'true');
}
