import Redis from 'ioredis';

export const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
};

// Only needed if want raw redis access
export const redisClient = new Redis(connection);

redisClient.on('error', (err) => console.error('[Queue Redis Error]', err));
redisClient.on('connect', () => console.log('[Queue Redis] Connected'));