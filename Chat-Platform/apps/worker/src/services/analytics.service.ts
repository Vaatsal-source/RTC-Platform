import client from 'prom-client';
import { getRedis, type EventSubscriber } from '@repo/queue';
import { claim } from './claim.js';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'worker_' });

const eventsTotal = new client.Counter({ name: 'worker_events_total', help: 'Domain events seen', labelNames: ['type'] as const, registers: [registry] });

const day = () => new Date().toISOString().slice(0, 10);

// Analytics Service — cheap rollups in Redis (messages per channel per day, active posters).
// Reads are `HGETALL analytics:messages:<date>` / `SCARD analytics:posters:<date>`.
export function registerAnalyticsService(events: EventSubscriber): void {
  events.on('message-created', async (e) => {
    eventsTotal.inc({ type: e.type });
    if (!(await claim('analytics', e.messageId))) return;
    const redis = getRedis();
    const d = day();
    await redis
      .multi()
      .hincrby(`analytics:messages:${d}`, e.channelId, 1)
      .expire(`analytics:messages:${d}`, 60 * 60 * 24 * 30)
      .sadd(`analytics:posters:${d}`, e.authorId)
      .expire(`analytics:posters:${d}`, 60 * 60 * 24 * 30)
      .exec();
  });

  for (const type of ['presence-updated', 'notification-created', 'channel-created', 'user-joined', 'file-uploaded'] as const) {
    events.on(type, () => eventsTotal.inc({ type }));
  }
}
