import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getRedis, isSessionRevoked } from '@repo/queue';
import { config } from '../lib/env.js';
import { unauthorized } from '../lib/errors.js';

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
}

/** Authenticated user for handlers behind requireAuth. */
export function authed(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized('No token provided');
  const token = header.slice(7);

  let decoded: AuthUser & { iat?: number };
  try {
    decoded = jwt.verify(token, config.JWT_SECRET) as AuthUser & { iat?: number };
  } catch {
    throw unauthorized('Invalid or expired token');
  }

  // Logout blacklists the token until it would have expired anyway.
  if (await getRedis().exists(`blacklist:${token}`)) throw unauthorized('Token has been revoked. Please login again.');

  // Password reset invalidates access tokens issued before it.
  if (await isSessionRevoked(decoded.userId, decoded.iat)) throw unauthorized('Session expired. Please login again.');

  req.user = { userId: decoded.userId, email: decoded.email, name: decoded.name };
  next();
}
