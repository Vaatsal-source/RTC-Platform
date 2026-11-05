import { Queue, type JobsOptions } from 'bullmq';
import { getBullConnection } from './redis.js';
import { QUEUE_NAMES, type AuditJobData, type EmailJobData, type NotificationJobData } from './types.js';

// Queues are created lazily so merely importing this package never opens a
// Redis connection (important for tests and for apps that only need events).

const retry = (attempts: number, type: 'exponential' | 'fixed', delay: number, keep: [number, number]): JobsOptions => ({
  attempts,
  backoff: { type, delay },
  removeOnComplete: keep[0],
  removeOnFail: keep[1],
});

let notificationQueue: Queue<NotificationJobData> | null = null;
let auditQueue: Queue<AuditJobData> | null = null;
let emailQueue: Queue<EmailJobData> | null = null;

export function getNotificationQueue(): Queue<NotificationJobData> {
  return (notificationQueue ??= new Queue<NotificationJobData>(QUEUE_NAMES.notifications, {
    connection: getBullConnection(),
    defaultJobOptions: retry(3, 'exponential', 1000, [100, 500]),
  }));
}

export function getAuditQueue(): Queue<AuditJobData> {
  return (auditQueue ??= new Queue<AuditJobData>(QUEUE_NAMES.audit, {
    connection: getBullConnection(),
    defaultJobOptions: retry(5, 'exponential', 2000, [200, 1000]),
  }));
}

export function getEmailQueue(): Queue<EmailJobData> {
  return (emailQueue ??= new Queue<EmailJobData>(QUEUE_NAMES.email, {
    connection: getBullConnection(),
    defaultJobOptions: retry(3, 'fixed', 5000, [50, 200]),
  }));
}

export async function closeQueues(): Promise<void> {
  await Promise.all([notificationQueue?.close(), auditQueue?.close(), emailQueue?.close()]);
  notificationQueue = auditQueue = emailQueue = null;
}

// ─── Fire-and-forget producers ────────────────────────────────────────────────
// Producing a job must never fail the user's request: we log and move on.

type Logf = (msg: string, err: unknown) => void;
let onError: Logf = (msg, err) => console.error(msg, err);
export function setQueueErrorLogger(fn: Logf): void {
  onError = fn;
}

export async function enqueueAudit(action: string, userId: string, metadata: Record<string, unknown> = {}): Promise<void> {
  try {
    await getAuditQueue().add(action, { userId, action, metadata, timestamp: Date.now() });
  } catch (err) {
    onError(`[queue] failed to enqueue audit job ${action}`, err);
  }
}

export async function enqueueEmail(jobName: string, data: EmailJobData): Promise<void> {
  try {
    await getEmailQueue().add(jobName, data);
  } catch (err) {
    onError(`[queue] failed to enqueue email job ${jobName}`, err);
  }
}

export async function enqueueNotification(jobName: string, data: NotificationJobData, jobId?: string): Promise<void> {
  try {
    await getNotificationQueue().add(jobName, data, jobId ? { jobId } : undefined);
  } catch (err) {
    onError(`[queue] failed to enqueue notification job ${jobName}`, err);
  }
}
