import {
  createNotificationWorker,
  createAuditWorker,
  createEmailWorker
} from '../../../packages/queue/src/index';

console.log('[Worker] Starting all workers...');

// Start all workers
const notificationWorker = createNotificationWorker();
const auditWorker = createAuditWorker();
const emailWorker = createEmailWorker();

console.log('[Worker] All workers running, waiting for jobs...');

// Graceful shutdown
// Docker sends SIGTERM when container stops
process.on('SIGTERM', async () => {
  console.log('[Worker] Shutting down gracefully...');
  await notificationWorker.close();
  await auditWorker.close();
  await emailWorker.close();
  console.log('[Worker] All workers closed');
  process.exit(0);
});

// Handle Ctrl+C locally
process.on('SIGINT', async () => {
  console.log('[Worker] Shutting down gracefully...');
  await notificationWorker.close();
  await auditWorker.close();
  await emailWorker.close();
  process.exit(0);
});