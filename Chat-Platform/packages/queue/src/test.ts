// packages/queue/src/test.ts
import { notificationQueue, auditQueue, emailQueue } from './queues';
import {
  createNotificationWorker,
  createAuditWorker,
  createEmailWorker
} from './workers';

async function test() {
  // start workers
  const nWorker = createNotificationWorker();
  const aWorker = createAuditWorker();
  const eWorker = createEmailWorker();

  // push test jobs
  await notificationQueue.add('test', {
    userId: 'user123',
    message: 'Test notification',
    type: 'message'
  });

  await auditQueue.add('test', {
    userId: 'user123',
    action: 'message_sent',
    metadata: { channelId: 'ch456' }
  });

  await emailQueue.add('test', {
    to: 'test@example.com',
    subject: 'Test Email',
    body: 'Hello from queue'
  });

  console.log('All test jobs pushed');

  // wait then exit
  setTimeout(async () => {
    await nWorker.close();
    await aWorker.close();
    await eWorker.close();
    process.exit(0);
  }, 3000);
}

test();