import { Redis } from 'ioredis';

export const redisUrl = (): string => process.env.REDIS_URL || 'redis://127.0.0.1:6379';

/** New standalone connection. Callers own its lifecycle. */
export function createRedis(opts: { name?: string; forBullMQ?: boolean; subscriber?: boolean } = {}): Redis {
  const client = new Redis(redisUrl(), {
    // BullMQ requires `null`; regular clients should fail commands fast when Redis is down.
    maxRetriesPerRequest: opts.forBullMQ ? null : 3,
    // A connection in subscriber mode may only issue (P)SUBSCRIBE-family commands, so skip the
    // INFO ready-check and CLIENT SETNAME handshakes that would otherwise race with subscribe().
    ...(opts.subscriber ? { enableReadyCheck: false } : { connectionName: opts.name }),
  });
  client.on('error', (err) => console.error(`[Redis${opts.name ? `:${opts.name}` : ''}]`, err.message));
  return client;
}

let shared: Redis | null = null;

/** Process-wide general purpose client (cache, presence, publish). */
export function getRedis(): Redis {
  if (!shared) shared = createRedis({ name: 'shared' });
  return shared;
}

let bull: Redis | null = null;
export function getBullConnection(): Redis {
  if (!bull) bull = createRedis({ name: 'bullmq', forBullMQ: true });
  return bull;
}
