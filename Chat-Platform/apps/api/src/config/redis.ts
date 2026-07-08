import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const redisClient = new Redis(REDIS_URL);

redisClient.on('error', (err) => console.error('[Redis Error]', err));
redisClient.on('connect', () => console.log('[Redis] Connected'));
