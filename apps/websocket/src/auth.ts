import jwt from 'jsonwebtoken';
import { getRedis, isSessionRevoked } from '@repo/queue';
import { config } from './env.js';

export interface AuthedUser {
  userId: string;
  username: string;
  email: string;
}

/** Verifies the same JWT the REST API issues. Returns null for anything invalid/revoked. */
export async function verifyToken(token: string | null | undefined): Promise<AuthedUser | null> {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as { userId?: string; name?: string; email?: string; iat?: number };
    if (!decoded.userId) return null;
    if (await getRedis().exists(`blacklist:${token}`)) return null; // logged out
    if (await isSessionRevoked(decoded.userId, decoded.iat)) return null; // password reset
    return { userId: decoded.userId, username: decoded.name ?? 'User', email: decoded.email ?? '' };
  } catch {
    return null;
  }
}
