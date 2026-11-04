import { Message, StoredFile, Types, User, getWorkspaceRole, hydrateMessages } from '@repo/database';
import { enqueueAudit, publishEvent } from '@repo/queue';
import type { ClientMessage, MessageDTO } from '@repo/shared-types';
import type { Client } from '../types.js';
import { broadcastToChannel } from '../registry.js';
import { logger } from '../env.js';
import { matchMentions } from '../mentions.js';
import { requireChannel, sendError, type ChannelContext } from './common.js';

type Payload<T extends ClientMessage['type']> = Extract<ClientMessage, { type: T }>['payload'];

async function resolveMentionedUserIds(content: string, ctx: ChannelContext, authorId: string): Promise<string[]> {
  if (!content.includes('@')) return [];
  const users = await User.find({ _id: { $in: ctx.memberIds } }).select('name').lean();
  return matchMentions(content, users.map((u) => ({ id: String(u._id), name: u.name })), authorId);
}

/** Only the uploader's own, not-yet-attached files in *this* channel may be attached. */
async function validateAttachments(ws: Client, channelId: string, ids: string[]): Promise<Types.ObjectId[] | null> {
  if (ids.length === 0) return [];
  if (!ids.every((i) => Types.ObjectId.isValid(i))) {
    sendError(ws, 'Invalid attachment');
    return null;
  }
  const files = await StoredFile.find({ _id: { $in: ids }, uploaderId: ws.userId, channelId }).select('_id').lean();
  if (files.length !== new Set(ids).size) {
    sendError(ws, 'Attachment not found');
    return null;
  }
  const taken = await Message.exists({ attachmentIds: { $in: files.map((f) => f._id) } });
  if (taken) {
    sendError(ws, 'Attachment already used');
    return null;
  }
  return files.map((f) => f._id);
}

async function createAndPublish(ws: Client, ctx: ChannelContext, opts: { content: string; tempId?: string; parentMessageId?: string; attachmentIds?: string[] }): Promise<void> {
  const channelId = String(ctx.channel._id);
  const attachmentIds = await validateAttachments(ws, channelId, opts.attachmentIds ?? []);
  if (!attachmentIds) return;

  const mentionedUserIds = await resolveMentionedUserIds(opts.content, ctx, ws.userId);

  // Persist FIRST: the id/timestamp the clients see are the stored ones, and a failed
  // write is reported to the sender instead of leaving a ghost message on everyone's screen.
  const doc = await Message.create({
    channelId,
    authorId: ws.userId,
    authorName: ws.username,
    content: opts.content,
    parentMessageId: opts.parentMessageId ?? null,
    attachmentIds,
    mentionedUserIds,
    deliveredTo: [],
    readBy: [],
  });

  const [dto] = await hydrateMessages([doc.toObject()]);
  const outgoing: MessageDTO = { ...dto, tempId: opts.tempId };

  // Real-time fan-out to every subscriber on every WS instance.
  await broadcastToChannel(channelId, opts.parentMessageId ? 'THREAD_REPLY' : 'NEW_MESSAGE', outgoing);

  // Event-driven side effects: the worker (notifications, audit, activity, analytics) subscribes — we don't call it.
  void publishEvent({
    type: 'message-created',
    messageId: dto.id,
    channelId,
    channelName: ctx.channel.name,
    workspaceId: ctx.channel.workspaceId ? String(ctx.channel.workspaceId) : null,
    isDM: ctx.channel.kind === 'dm',
    parentMessageId: opts.parentMessageId ?? null,
    authorId: ws.userId,
    authorName: ws.username,
    content: opts.content,
    mentionedUserIds,
    recipientIds: ctx.memberIds.filter((m) => m !== ws.userId),
    ts: Date.now(),
  });
}

// SEND_MESSAGE
export async function handleSendMessage(ws: Client, p: Payload<'SEND_MESSAGE'>): Promise<void> {
  const attachmentIds = p.attachmentIds ?? [];
  if (!p.content && attachmentIds.length === 0) return sendError(ws, 'Message cannot be empty');

  const ctx = await requireChannel(ws, p.channelId, { writable: true });
  if (!ctx) return;
  await createAndPublish(ws, ctx, { content: p.content, tempId: p.tempId, attachmentIds });
}

// SEND_THREAD_REPLY
export async function handleThreadReply(ws: Client, p: Payload<'SEND_THREAD_REPLY'>): Promise<void> {
  const ctx = await requireChannel(ws, p.channelId, { writable: true });
  if (!ctx) return;

  if (!Types.ObjectId.isValid(p.parentMessageId)) return sendError(ws, 'Parent message not found', 'NOT_FOUND');
  const parent = await Message.findOne({ _id: p.parentMessageId, channelId: p.channelId, isDeleted: false }).select('parentMessageId').lean();
  if (!parent) return sendError(ws, 'Parent message not found', 'NOT_FOUND');
  if (parent.parentMessageId) return sendError(ws, "Can't reply to a reply — threads are one level deep");

  await createAndPublish(ws, ctx, { content: p.content, tempId: p.tempId, parentMessageId: p.parentMessageId });
}

// EDIT_MESSAGE — author only
export async function handleEditMessage(ws: Client, p: Payload<'EDIT_MESSAGE'>): Promise<void> {
  const ctx = await requireChannel(ws, p.channelId, { writable: true });
  if (!ctx) return;
  if (!Types.ObjectId.isValid(p.messageId)) return sendError(ws, 'Message not found', 'NOT_FOUND');

  const updated = await Message.findOneAndUpdate(
    { _id: p.messageId, channelId: p.channelId, authorId: ws.userId, isDeleted: false },
    { content: p.newContent, isEdited: true },
    { new: true },
  ).lean();
  if (!updated) return sendError(ws, 'You can only edit your own messages', 'FORBIDDEN');

  await broadcastToChannel(p.channelId, 'MESSAGE_EDITED', {
    messageId: p.messageId,
    channelId: p.channelId,
    newContent: updated.content,
    editedAt: updated.updatedAt.toISOString(),
  });
  void enqueueAudit('message_edited', ws.userId, { channelId: p.channelId, messageId: p.messageId });
}

// DELETE_MESSAGE — soft delete; author, or a workspace admin moderating
export async function handleDeleteMessage(ws: Client, p: Payload<'DELETE_MESSAGE'>): Promise<void> {
  const ctx = await requireChannel(ws, p.channelId);
  if (!ctx) return;
  if (!Types.ObjectId.isValid(p.messageId)) return sendError(ws, 'Message not found', 'NOT_FOUND');

  const message = await Message.findOne({ _id: p.messageId, channelId: p.channelId, isDeleted: false }).select('authorId').lean();
  if (!message) return sendError(ws, 'Message not found', 'NOT_FOUND');

  const isAuthor = String(message.authorId) === ws.userId;
  const isAdmin = !isAuthor && ctx.channel.workspaceId ? (await getWorkspaceRole(String(ctx.channel.workspaceId), ws.userId)) === 'admin' : false;
  if (!isAuthor && !isAdmin) return sendError(ws, 'You can only delete your own messages', 'FORBIDDEN');

  // Scrub content (not just flag) so deleted text doesn't linger in the database.
  await Message.updateOne({ _id: p.messageId }, { isDeleted: true, content: '', attachmentIds: [], reactions: [] });
  await broadcastToChannel(p.channelId, 'MESSAGE_DELETED', { messageId: p.messageId, channelId: p.channelId });
  void enqueueAudit('message_deleted', ws.userId, { channelId: p.channelId, messageId: p.messageId, moderated: isAdmin });
  logger.debug('message deleted', { messageId: p.messageId, by: ws.userId });
}
