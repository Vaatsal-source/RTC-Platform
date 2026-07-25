import { Worker, Job } from 'bullmq';
import { connection } from './redis';
import { NotificationJobData, AuditJobData, EmailJobData } from './types';

// ─── Notification Worker ──────────────────────────

export function createNotificationWorker() {
  const worker = new Worker<NotificationJobData>(
    'notifications',
    async (job: Job<NotificationJobData>) => {
      const { userId, message, type, channelId, senderId } = job.data;

      console.log(`[Notification Worker] Processing job ${job.id}`);
      console.log(`Type: ${type} | User: ${userId} | Message: ${message}`);

      // TODO Sprint 7: replace with real logic
      // await Notification.create({ userId, message, type });
    },
    { connection }
  );

  // ─── Events ────────────────────────────────────

  worker.on('completed', (job) => {
    console.log(`[Notification Worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Notification Worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[Notification Worker] Worker error:', err);
  });

  return worker;
}

// ─── Audit Worker ─────────────────────────────────

export function createAuditWorker() {
  const worker = new Worker<AuditJobData>(
    'audit',
    async (job: Job<AuditJobData>) => {
      const { userId, action, metadata, timestamp } = job.data;

      console.log(`[Audit Worker] Processing job ${job.id}`);
      console.log(`User: ${userId} | Action: ${action}`);
      console.log('Metadata:', metadata);

      // TODO Sprint 7: replace with real logic
      // await AuditLog.create({ userId, action, metadata, timestamp });
    },
    { connection }
  );

  worker.on('completed', (job) => {
    console.log(`[Audit Worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Audit Worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[Audit Worker] Worker error:', err);
  });

  return worker;
}

// ─── Email Worker ─────────────────────────────────

export function createEmailWorker() {
  const worker = new Worker<EmailJobData>(
    'email',
    async (job: Job<EmailJobData>) => {
      const { to, subject, body, userId } = job.data;

      console.log(`[Email Worker] Processing job ${job.id}`);
      console.log(`To: ${to} | Subject: ${subject}`);

      // TODO Sprint 7: replace with real logic
      // await sendEmail({ to, subject, body });
    },
    { connection }
  );

  worker.on('completed', (job) => {
    console.log(`[Email Worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Email Worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[Email Worker] Worker error:', err);
  });

  return worker;
}