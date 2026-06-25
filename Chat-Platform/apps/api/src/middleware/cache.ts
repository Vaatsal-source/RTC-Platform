import type { Request, Response, NextFunction } from 'express';
import { redisClient } from '../config/redis.js';

const TTL = 60;

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
      redisClient.setex(key, TTL, JSON.stringify(body)).catch(console.error);
      return originalJson(body);
    };

    next();
  };
}
