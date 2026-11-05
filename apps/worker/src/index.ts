import { createServer } from 'node:http';
import client from 'prom-client';
import { connectDB, disconnectDB } from '@repo/database';
import { closeQueues, createEventSubscriber, getAuditQueue, getEmailQueue, getNotificationQueue, getRedis, setQueueErrorLogger } from '@repo/queue';
import { config, logger } from './env.js';
import { startWorkers } from './queues.js';
import { registerNotificationService } from './services/notification.service.js';
import { registerAuditService } from './services/audit.service.js';
import { registerActivityService } from './services/activity.service.js';
import { registerAnalyticsService, registry } from './services/analytics.service.js';

// Queue health (backlog is the number to alert on) — computed on each scrape.
new client.Gauge({
  name: 'queue_jobs',
  help: 'BullMQ jobs by queue and state',
  labelNames: ['queue', 'state'] as const,
  registers: [registry],
  async collect() {
    for (const [name, q] of [['notifications', getNotificationQueue()], ['audit', getAuditQueue()], ['email', getEmailQueue()]] as const) {
      const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
      for (const [state, n] of Object.entries(counts)) this.set({ queue: name, state }, n);
    }
  },
});

async function main() {
  setQueueErrorLogger((msg, err) => logger.error(msg, { err: (err as Error)?.message }));
  await connectDB(config.MONGO_URI);
  logger.info('MongoDB connected');

  // 1) Queue consumers: durable, retried jobs (notifications, audit log, email).
  const workers = startWorkers();

  // 2) Event consumers: Redis Pub/Sub → services. Producers (api, ws) never call these directly.
  const events = createEventSubscriber('worker');
  registerNotificationService(events);
  registerAuditService(events);
  registerActivityService(events);
  registerAnalyticsService(events);
  await events.start();

  const http = createServer(async (req, res) => {
    if (req.url === '/metrics') res.writeHead(200, { 'Content-Type': registry.contentType }).end(await registry.metrics());
    else if (req.url === '/health') res.writeHead(200).end('ok');
    else res.writeHead(404).end();
  }).listen(config.WORKER_METRICS_PORT);

  logger.info(`Worker running: ${workers.length} queue workers + event services (metrics :${config.WORKER_METRICS_PORT})`);

  // Docker sends SIGTERM on stop; Ctrl+C locally sends SIGINT. Finish in-flight jobs, then exit.
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info(`${signal} received, draining…`);
    http.close();
    await events.close();
    await Promise.all(workers.map((w) => w.close()));
    await closeQueues();
    await disconnectDB();
    getRedis().disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Worker failed to start', { err: err?.stack ?? err });
  process.exit(1);
});
