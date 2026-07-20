import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { redisClient } from '../config/redis.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_prod';

export interface AuthRequest extends Request {
  user?: { userId: string; email: string };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const isBlacklisted = await redisClient.get(`blacklist:${token}`);
    if (isBlacklisted) {
      res.status(401).json({ success: false, message: 'Token has been revoked. Please login again.' });
      return;
    }
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}
