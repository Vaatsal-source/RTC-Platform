// src/index.ts
export { notificationQueue, auditQueue, emailQueue } from './queues';
export {
  createNotificationWorker,
  createAuditWorker,
  createEmailWorker
} from './workers';
export type {
  NotificationJobData,
  AuditJobData,
  EmailJobData
} from './types';