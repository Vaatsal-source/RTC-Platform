import { Notification, User } from '@repo/database';
import { enqueueEmail, isOnline, publishEvent, type NotificationJobData } from '@repo/queue';
import { config, logger } from '../env.js';

// Notification Queue:  Message → Queue → Worker → Notification
// Persists the notification, then announces `notification-created` on the bus so the
// WS tier pushes it to the recipient in real time (on whichever instance they're on).
export async function processNotification(data: NotificationJobData): Promise<void> {
  const { userId, message, type, channelId, workspaceId, senderId, senderName } = data;

  const doc = await Notification.create({ userId, kind: type, message, channelId, workspaceId, senderId });

  await publishEvent({
    type: 'notification-created',
    notificationId: String(doc._id),
    userId,
    kind: type,
    message,
    channelId,
    workspaceId,
    senderId,
    senderName,
    createdAt: doc.createdAt.toISOString(),
    ts: Date.now(),
  });

  // Email Queue:  Event → Queue → Worker → Email. Only worth an email if they're not here to see it.
  if (type === 'mention' && !(await isOnline(userId))) {
    const user = await User.findById(userId).select('name email').lean();
    if (user) {
      await enqueueEmail('mention_email', {
        to: user.email,
        subject: 'You were mentioned on SyncGrid',
        body: `Hi ${user.name}, ${message}. Open ${config.APP_URL} to reply.`,
        userId,
      });
    }
  }
  logger.debug('notification created', { userId, type });
}
