import { Activity } from '@repo/database';
import type { EventSubscriber } from '@repo/queue';
import { claim } from './claim.js';

// Activity Service (Module 12) — message sent, user joined, channel created, file uploaded.
export function registerActivityService(events: EventSubscriber): void {
  events.on('message-created', async (e) => {
    // Thread replies and DMs are noise in a workspace feed (and DMs aren't workspace-scoped).
    if (!e.workspaceId || e.isDM || e.parentMessageId) return;
    if (!(await claim('activity', e.messageId))) return;
    await Activity.create({
      kind: 'message_sent',
      workspaceId: e.workspaceId,
      actorId: e.authorId,
      actorName: e.authorName,
      channelId: e.channelId,
      summary: `${e.authorName} sent a message in #${e.channelName}`,
    });
  });

  events.on('user-joined', async (e) => {
    if (!(await claim('activity', `join-${e.workspaceId}-${e.userId}-${e.ts}`))) return;
    await Activity.create({ kind: 'user_joined', workspaceId: e.workspaceId, actorId: e.userId, actorName: e.userName, summary: `${e.userName} joined the workspace` });
  });

  events.on('channel-created', async (e) => {
    if (!(await claim('activity', `chan-${e.channelId}`))) return;
    await Activity.create({
      kind: 'channel_created',
      workspaceId: e.workspaceId,
      actorId: e.actorId,
      actorName: e.actorName,
      channelId: e.channelId,
      summary: `${e.actorName} created #${e.name}`,
    });
  });

  events.on('file-uploaded', async (e) => {
    if (!e.workspaceId) return;
    if (!(await claim('activity', `file-${e.fileId}`))) return;
    await Activity.create({
      kind: 'file_uploaded',
      workspaceId: e.workspaceId,
      actorId: e.uploaderId,
      actorName: e.uploaderName,
      channelId: e.channelId,
      summary: `${e.uploaderName} uploaded ${e.fileName}`,
    });
  });
}
