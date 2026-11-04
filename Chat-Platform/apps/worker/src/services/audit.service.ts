import { enqueueAudit, type EventSubscriber } from '@repo/queue';
import { claim } from './claim.js';

// Audit Service — turns domain events into audit jobs. (Direct API actions enqueue their own
// audit entries; message traffic goes through the WS tier, so it's captured here instead.)
export function registerAuditService(events: EventSubscriber): void {
  events.on('message-created', async (e) => {
    if (!(await claim('audit', e.messageId))) return;
    await enqueueAudit(e.parentMessageId ? 'thread_reply_sent' : 'message_sent', e.authorId, {
      channelId: e.channelId,
      messageId: e.messageId,
      contentLength: e.content.length,
      isDM: e.isDM,
    });
  });
}
