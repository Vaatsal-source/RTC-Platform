import type { Request, Response, NextFunction } from 'express';
import { redisClient } from '../config/redis.js';

const TTL = 60; // 60 seconds
const MAX_CACHE_SIZE = 100 * 1024; // 100KB max

export function cacheMiddleware(keyFn: (req: Request) => string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = keyFn(req);

    try {
      const cached = await redisClient.get(key);
      if (cached) {
        console.log(`[Cache HIT] ${key}`);
        res.json(JSON.parse(cached));
        return;
      }
      console.log(`[Cache MISS] ${key}`);
    } catch (err) {
      console.error('[Cache] Redis error, skipping cache:', err);
    }

    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      const serialized = JSON.stringify(body);
      if (serialized.length <= MAX_CACHE_SIZE) {
        redisClient.setex(key, TTL, serialized).catch(console.error);
      } else {
        console.warn(`[Cache SKIP] ${key} — response too large (${(serialized.length / 1024).toFixed(1)}KB)`);
      }
      return originalJson(body);
    };

    next();
  };
}
