import { Message, Types } from '@repo/database';
import { enqueueNotification, type EventSubscriber } from '@repo/queue';
import type { MessageCreatedEvent } from '@repo/shared-types';
import { claim } from './claim.js';

const preview = (s: string) => (s.length > 80 ? `${s.slice(0, 77)}…` : s);

/**
 * Pure decision function: who gets which notification for a message.
 *  - @mentioned users           → "mention"
 *  - the other side of a DM     → "message"
 *  - author of a replied-to msg → "message"  (thread reply)
 * A user gets at most one notification per message; mention wins.
 */
export function planNotifications(e: MessageCreatedEvent, parentAuthorId?: string | null): Array<{ userId: string; type: 'mention' | 'message'; message: string }> {
  const plan = new Map<string, { userId: string; type: 'mention' | 'message'; message: string }>();
  const where = e.isDM ? 'you' : `#${e.channelName}`;

  for (const userId of e.mentionedUserIds) {
    if (userId === e.authorId || !e.recipientIds.includes(userId)) continue;
    plan.set(userId, { userId, type: 'mention', message: `${e.authorName} mentioned you in ${where}: ${preview(e.content)}` });
  }
  if (e.isDM) {
    for (const userId of e.recipientIds) {
      if (!plan.has(userId)) plan.set(userId, { userId, type: 'message', message: `${e.authorName}: ${preview(e.content)}` });
    }
  }
  if (parentAuthorId && parentAuthorId !== e.authorId && e.recipientIds.includes(parentAuthorId) && !plan.has(parentAuthorId)) {
    plan.set(parentAuthorId, { userId: parentAuthorId, type: 'message', message: `${e.authorName} replied to your message in ${where}: ${preview(e.content)}` });
  }
  return [...plan.values()];
}

// Notification Service — reacts to `message-created`; doesn't get called by the message path.
export function registerNotificationService(events: EventSubscriber): void {
  events.on('message-created', async (e) => {
    if (!(await claim('notification', e.messageId))) return;

    let parentAuthorId: string | null = null;
    if (e.parentMessageId && Types.ObjectId.isValid(e.parentMessageId)) {
      const parent = await Message.findById(e.parentMessageId).select('authorId').lean();
      parentAuthorId = parent ? String(parent.authorId) : null;
    }

    for (const n of planNotifications(e, parentAuthorId)) {
      await enqueueNotification(
        'message_notification',
        { userId: n.userId, type: n.type, message: n.message, channelId: e.channelId, workspaceId: e.workspaceId ?? undefined, senderId: e.authorId, senderName: e.authorName },
        `n-${e.messageId}-${n.userId}`, // idempotent: replays can't double-notify
      );
    }
  });
}
