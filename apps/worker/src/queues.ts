import { Worker, type Job, type Processor } from 'bullmq';
import { QUEUE_NAMES, createRedis, type AuditJobData, type EmailJobData, type NotificationJobData } from '@repo/queue';
import { logger } from './env.js';
import { processAudit } from './processors/audit.js';
import { processEmail } from './processors/email.js';
import { processNotification } from './processors/notification.js';

function makeWorker<T>(name: string, handler: (data: T) => Promise<void>, concurrency: number): Worker<T> {
  // Workers need their own blocking connection (BullMQ duplicates it per worker).
  const processor: Processor<T> = async (job: Job<T>) => handler(job.data);
  const worker = new Worker<T>(name, processor, { connection: createRedis({ name: `worker-${name}`, forBullMQ: true }), concurrency });

  worker.on('completed', (job) => logger.debug(`[${name}] job ${job.id} completed`));
  worker.on('failed', (job, err) =>
    logger.error(`[${name}] job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts})`, { err: err.message }),
  );
  worker.on('error', (err) => logger.error(`[${name}] worker error`, { err: err.message }));
  return worker;
}

export function startWorkers() {
  return [
    makeWorker<NotificationJobData>(QUEUE_NAMES.notifications, processNotification, 10),
    makeWorker<AuditJobData>(QUEUE_NAMES.audit, processAudit, 10),
    makeWorker<EmailJobData>(QUEUE_NAMES.email, processEmail, 3),
  ];
}
