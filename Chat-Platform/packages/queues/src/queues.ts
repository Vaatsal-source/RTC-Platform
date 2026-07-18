import { Queue } from 'bullmq';
import { connection } from './redis';
import { NotificationJobData, AuditJobData, EmailJobData } from './types';

// ─── Notification Queue ───────────────────────────

export const notificationQueue = new Queue<NotificationJobData>(
  'notifications',
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,        // 1s, 2s, 4s between retries
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    }
  }
);

// ─── Audit Queue ─────────────────────────────────

export const auditQueue = new Queue<AuditJobData>(
  'audit',
  {
    connection,
    defaultJobOptions: {
      attempts: 5,          // audit is important, retry more
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 200,
      removeOnFail: 1000,
    }
  }
);

// ─── Email Queue ──────────────────────────────────

export const emailQueue = new Queue<EmailJobData>(
  'email',
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'fixed',
        delay: 5000,        // wait 5s between email retries
      },
      removeOnComplete: 50,
      removeOnFail: 200,
    }
  }
);