import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Two separate instances — ioredis requires this.
// A connection in subscriber mode can ONLY subscribe, not publish.
export const publisher = new Redis(REDIS_URL);
export const subscriber = new Redis(REDIS_URL);

publisher.on('error', (err) => console.error('[Redis Publisher Error]', err));
subscriber.on('error', (err) => console.error('[Redis Subscriber Error]', err));
