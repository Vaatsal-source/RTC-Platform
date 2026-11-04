import { createHash, randomBytes } from 'node:crypto';
import { getRedis } from './redis.js';

// ─── Opaque, single-use tokens (refresh / password reset / email verification) ─
// Only a SHA-256 of the token is stored, so a Redis dump can't be replayed.
//
//   refresh:<sha>   → userId   (rotated on every use)
//   pwreset:<sha>   → userId   (1 h)
//   verify:<sha>    → userId   (24 h)
//   user-refresh:<userId> = set of refresh hashes, so "log out everywhere" can revoke them all
//   session-valid-after:<userId> = unix seconds; access JWTs issued before it are rejected

export type TokenKind = 'refresh' | 'pwreset' | 'verify';

const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const key = (kind: TokenKind, token: string) => `${kind}:${sha(token)}`;

export const newOpaqueToken = (): string => randomBytes(32).toString('base64url');

export async function storeToken(kind: TokenKind, token: string, userId: string, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  const m = redis.multi().set(key(kind, token), userId, 'EX', ttlSeconds);
  if (kind === 'refresh') m.sadd(`user-refresh:${userId}`, sha(token)).expire(`user-refresh:${userId}`, ttlSeconds);
  await m.exec();
}

/** Atomically reads AND deletes the token, so it can be used exactly once. Returns the userId or null. */
export async function consumeToken(kind: TokenKind, token: string): Promise<string | null> {
  if (!token || token.length > 200) return null;
  const redis = getRedis();
  const userId = await redis.getdel(key(kind, token));
  if (userId && kind === 'refresh') await redis.srem(`user-refresh:${userId}`, sha(token));
  return userId;
}

/** Invalidate every refresh token of a user (password reset, "log out everywhere"). */
export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  const redis = getRedis();
  const hashes = await redis.smembers(`user-refresh:${userId}`);
  if (hashes.length) await redis.del(...hashes.map((h) => `refresh:${h}`));
  await redis.del(`user-refresh:${userId}`);
}

export async function invalidateSessionsBefore(userId: string, ttlSeconds = 60 * 60 * 24 * 31): Promise<void> {
  await getRedis().set(`session-valid-after:${userId}`, String(Math.floor(Date.now() / 1000)), 'EX', ttlSeconds);
}

/** True if this access token (identified by its `iat`) predates a forced logout for the user. */
export async function isSessionRevoked(userId: string, issuedAt: number | undefined): Promise<boolean> {
  const after = await getRedis().get(`session-valid-after:${userId}`);
  return !!after && (issuedAt ?? 0) < Number(after);
}
