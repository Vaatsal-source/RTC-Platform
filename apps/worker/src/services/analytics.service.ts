import client from 'prom-client';
import { getRedis, type EventSubscriber } from '@repo/queue';
import { claim } from './claim.js';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'worker_' });

const eventsTotal = new client.Counter({ name: 'worker_events_total', help: 'Domain events seen', labelNames: ['type'] as const, registers: [registry] });

const TTL = 60 * 60 * 24 * 30;
const day = () => new Date().toISOString().slice(0, 10);

// Analytics Service — cheap per-workspace rollups in Redis (messages per channel per day, distinct posters).
// Read by GET /api/workspaces/:id/analytics (admins), shown in Workspace settings → Insights.
export function registerAnalyticsService(events: EventSubscriber): void {
  events.on('message-created', async (e) => {
    eventsTotal.inc({ type: e.type });
    if (!e.workspaceId || e.parentMessageId) return; // DMs aren't workspace-scoped; replies would double count
    if (!(await claim('analytics', e.messageId))) return;
    const redis = getRedis();
    const d = day();
    const msgKey = `analytics:ws:${e.workspaceId}:messages:${d}`;
    const posterKey = `analytics:ws:${e.workspaceId}:posters:${d}`;
    await redis
      .multi()
      .hincrby(msgKey, e.channelId, 1)
      .expire(msgKey, TTL)
      .sadd(posterKey, e.authorId)
      .expire(posterKey, TTL)
      .exec();
  });

  for (const type of ['presence-updated', 'notification-created', 'channel-created', 'user-joined', 'file-uploaded'] as const) {
    events.on(type, () => eventsTotal.inc({ type }));
  }
}
