import { randomUUID } from 'crypto';
import { Message } from 'database';
import type { AuthenticatedWebSocket } from './types.js';
import type {
  JoinChannelPayload,
  LeaveChannelPayload,
  SendMessagePayload,
  TypingPayload,
  NewMessagePayload,
  TypingUpdatePayload,
  EditMessagePayload,
  DeleteMessagePayload,
  MessageEditedPayload,
  MessageDeletedPayload,
  AddReactionPayload,
  RemoveReactionPayload,
  ReactionUpdatePayload,
  SendThreadReplyPayload,
  ThreadReplyPayload,
  MarkDeliveredPayload,
  MarkReadPayload,
  ReceiptUpdatePayload,
  SendDMPayload,
  JoinDMPayload,
  NewDMPayload,
  NotificationPayload,
  LoadMoreMessagesPayload,
} from './types.js';
import {
  subscribeToChannel,
  unsubscribeFromChannel,
  broadcastToChannel,
  sendToUser,
  dmKey,
} from './registry.js';

// ─── Helper: build a JSON string to send over the wire ───────────────────────
function buildMessage<T>(type: string, payload: T): string {
  return JSON.stringify({ type, payload });
}

// ─── Helper: send an error back to the client who triggered it ───────────────
function sendError(ws: AuthenticatedWebSocket, message: string): void {
  ws.send(buildMessage('ERROR', { message }));
}

// ─── In-memory message ownership tracking ─────────────────────────────────────
// TEMPORARY until MongoDB is wired in (Sprint 3/4). We need this so EDIT/DELETE
// can check "did this user actually send this message" before allowing it.
// Key: messageId → { authorId, channelId }
const messageOwners = new Map<string, { authorId: string; channelId: string }>();
// Key: `${userId}:${channelId}` → timeout handle
// When TYPING_START arrives we reset the timer. After 3s of silence, we
// auto-broadcast a TYPING_STOP so the UI clears the "X is typing..." indicator.
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ─── Handler: JOIN_CHANNEL ────────────────────────────────────────────────────
// Client sends this when they navigate into a channel.
// We add them to the channel's subscriber set so they receive future messages,
// and send back the last 50 messages so the UI isn't empty (Module 4 —
// Message History). Full infinite-scroll pagination would extend this with
// a `before` cursor param — left as a follow-up since it needs a REST
// endpoint too, not just this initial WS push.
export async function handleJoinChannel(
  ws: AuthenticatedWebSocket,
  payload: JoinChannelPayload
): Promise<void> {
  const { channelId } = payload;

  if (!channelId) {
    sendError(ws, 'JOIN_CHANNEL requires a channelId');
    return;
  }

  subscribeToChannel(ws, channelId);

  // Confirm back to the joining client
  ws.send(buildMessage('CONNECTED', {
    message: `Joined channel ${channelId}`,
    channelId,
  }));

  // Fetch recent history and send it only to the joining client (not broadcast)
  try {
    const recentMessages = await Message.find({ channelId, isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Reverse so oldest-first (natural reading order) when rendered
    const history = recentMessages.reverse().map((m) => ({
      id: String(m._id),
      channelId: m.channelId,
      content: m.content,
      timestamp: m.createdAt.toISOString(),
      user: { id: m.authorId, name: m.authorName },
      reactions: m.reactions,
      isEdited: m.isEdited,
      parentMessageId: m.parentMessageId ?? undefined,
    }));

    ws.send(buildMessage('MESSAGE_HISTORY', { channelId, messages: history }));
  } catch (err) {
    console.error(`[DB] Failed to fetch history for ${channelId}:`, (err as Error).message);
    // Non-fatal — client just won't see history, real-time still works
  }
}

// ─── Handler: LOAD_MORE_MESSAGES ──────────────────────────────────────────────
// Module 4 — Infinite Scroll. Client calls this when the user scrolls to the
// top of the message list. We fetch the next 50 messages older than the
// `before` cursor (the timestamp of the oldest message currently rendered).
export async function handleLoadMoreMessages(
  ws: AuthenticatedWebSocket,
  payload: LoadMoreMessagesPayload
): Promise<void> {
  const { channelId, before } = payload;

  if (!channelId || !before) {
    sendError(ws, 'LOAD_MORE_MESSAGES requires channelId and before');
    return;
  }

  try {
    const olderMessages = await Message.find({
      channelId,
      isDeleted: false,
      createdAt: { $lt: new Date(before) },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const hasMore = olderMessages.length === 50; // if we got a full page, there might be more

    const history = olderMessages.reverse().map((m) => ({
      id: String(m._id),
      channelId: m.channelId,
      content: m.content,
      timestamp: m.createdAt.toISOString(),
      user: { id: m.authorId, name: m.authorName },
      reactions: m.reactions,
      isEdited: m.isEdited,
      parentMessageId: m.parentMessageId ?? undefined,
    }));

    ws.send(buildMessage('MORE_MESSAGES_LOADED', { channelId, messages: history, hasMore }));
  } catch (err) {
    console.error(`[DB] Failed to load more messages for ${channelId}:`, (err as Error).message);
    sendError(ws, 'Failed to load more messages');
  }
}

// ─── Handler: LEAVE_CHANNEL ───────────────────────────────────────────────────
export function handleLeaveChannel(
  ws: AuthenticatedWebSocket,
  payload: LeaveChannelPayload
): void {
  const { channelId } = payload;

  if (!channelId) {
    sendError(ws, 'LEAVE_CHANNEL requires a channelId');
    return;
  }

  unsubscribeFromChannel(ws, channelId);
}

// ─── Handler: SEND_MESSAGE ────────────────────────────────────────────────────
// This is the core feature. Steps:
//   1. Validate the payload
//   2. Build the message object (assign a real server-side ID + timestamp)
//   3. Broadcast to everyone subscribed to this channel (do this FIRST so
//      real-time delivery isn't blocked waiting on the database write)
//   4. Persist to MongoDB in the background
//   5. TODO (Sprint 6): Publish to Redis so OTHER WS instances also broadcast
export async function handleSendMessage(
  ws: AuthenticatedWebSocket,
  payload: SendMessagePayload
): Promise<void> {
  const { channelId, content, tempId } = payload;

  if (!channelId || !content?.trim()) {
    sendError(ws, 'SEND_MESSAGE requires channelId and content');
    return;
  }

  const trimmedContent = content.trim();
  const id = randomUUID(); // assign the ID up front so we can broadcast immediately

  // Build the canonical message object
  const newMessage: NewMessagePayload = {
    id,
    tempId,                   // echoed back so React can replace optimistic msg
    channelId,
    content: trimmedContent,
    timestamp: new Date().toISOString(),
    user: {
      id: ws.userId,
      name: ws.username,
    },
  };

  // Track ownership so EDIT/DELETE can verify the requester later
  messageOwners.set(newMessage.id, { authorId: ws.userId, channelId });

  const outgoing = buildMessage('NEW_MESSAGE', newMessage);

  // Broadcast FIRST — real-time delivery should never wait on a DB write.
  // Broadcast to all channel subscribers INCLUDING the sender
  // (sender needs to receive the confirmed message with the real server ID)
  broadcastToChannel(channelId, outgoing);

  // ── Persist to MongoDB (fire-and-forget from the client's perspective) ────
  // We still await it here so we can log failures, but the client already
  // has their message rendered by this point — a DB failure doesn't block UX.
  try {
    await Message.create({
      _id: id, // reuse the same ID we already broadcast, so it's consistent
      channelId,
      authorId: ws.userId,
      authorName: ws.username,
      content: trimmedContent,
      isDM: false,
    });
  } catch (err) {
    console.error(`[DB] Failed to save message ${id}:`, (err as Error).message);
    // Note: we don't notify the client of this failure — the message already
    // delivered in real-time. A background reconciliation/retry job would be
    // the production-grade fix here (out of scope for now).
  }

  // ── Module 9: Mention detection ──────────────────────────────────────────
  // Simple @username scan. Real version (Sprint 7) would resolve against the
  // actual workspace member list and push through the Notification Queue.
  detectMentionsAndNotify(trimmedContent, channelId, ws);

  console.log(`[Message] ${ws.username} → #${channelId}: "${trimmedContent}"`);
}

// ── Module 9: Notification helper ───────────────────────────────────────────
// Scans message content for @mentions and pings the mentioned user directly
// (even if they're not currently subscribed to that channel).
// NOTE: this is a regex-based placeholder. Once user directory data is wired
// up via MongoDB, replace the lookup with a real username → userId resolver.
function detectMentionsAndNotify(
  content: string,
  channelId: string,
  fromWs: AuthenticatedWebSocket
): void {
  const mentionPattern = /@(\w+)/g;
  const matches = content.matchAll(mentionPattern);

  for (const match of matches) {
    const mentionedUsername = match[1];

    // TODO: resolve mentionedUsername → actual userId via database package
    // For now we just demonstrate the notification pipeline structure.
    const notification: NotificationPayload = {
      id: randomUUID(),
      kind: 'mention',
      channelId,
      fromUserId: fromWs.userId,
      fromUsername: fromWs.username,
      preview: content.slice(0, 80),
      timestamp: new Date().toISOString(),
    };

    // sendToUser requires a real userId — placeholder call shown for wiring:
    // sendToUser(resolvedUserId, buildMessage('NOTIFICATION', notification));
    console.log(`[Mention] @${mentionedUsername} mentioned by ${fromWs.username}`, notification.id);
  }
}

// ─── Handler: TYPING_START ────────────────────────────────────────────────────
// Broadcast to channel that this user is typing.
// Auto-clears after 3 seconds if no further TYPING_START events arrive.
export function handleTypingStart(
  ws: AuthenticatedWebSocket,
  payload: TypingPayload
): void {
  const { channelId } = payload;
  if (!channelId) return;

  const key = `${ws.userId}:${channelId}`;

  // Clear existing timer if any (user is still actively typing)
  const existing = typingTimers.get(key);
  if (existing) clearTimeout(existing);

  // Broadcast typing=true to channel (excluding self)
  const typingMsg: TypingUpdatePayload = {
    channelId,
    userId: ws.userId,
    username: ws.username,
    isTyping: true,
  };
  broadcastToChannel(channelId, buildMessage('TYPING_UPDATE', typingMsg), ws);

  // Auto-stop after 3 seconds of no TYPING_START
  const timer = setTimeout(() => {
    const stopMsg: TypingUpdatePayload = {
      channelId,
      userId: ws.userId,
      username: ws.username,
      isTyping: false,
    };
    broadcastToChannel(channelId, buildMessage('TYPING_UPDATE', stopMsg), ws);
    typingTimers.delete(key);
  }, 3000);

  typingTimers.set(key, timer);
}

// ─── Handler: TYPING_STOP ────────────────────────────────────────────────────
// Explicit stop (e.g. user sent message or cleared input)
export function handleTypingStop(
  ws: AuthenticatedWebSocket,
  payload: TypingPayload
): void {
  const { channelId } = payload;
  if (!channelId) return;

  const key = `${ws.userId}:${channelId}`;
  const existing = typingTimers.get(key);
  if (existing) {
    clearTimeout(existing);
    typingTimers.delete(key);
  }

  const stopMsg: TypingUpdatePayload = {
    channelId,
    userId: ws.userId,
    username: ws.username,
    isTyping: false,
  };
  broadcastToChannel(channelId, buildMessage('TYPING_UPDATE', stopMsg), ws);
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 4 (cont.): Edit / Delete Message
// ═══════════════════════════════════════════════════════════════════════════

// ─── Handler: EDIT_MESSAGE ────────────────────────────────────────────────────
// Only the original author can edit. We now check against MongoDB (the
// authoritative source) rather than just the in-memory map, since messages
// persist across server restarts.
export async function handleEditMessage(
  ws: AuthenticatedWebSocket,
  payload: EditMessagePayload
): Promise<void> {
  const { messageId, channelId, newContent } = payload;

  if (!messageId || !channelId || !newContent?.trim()) {
    sendError(ws, 'EDIT_MESSAGE requires messageId, channelId, and newContent');
    return;
  }

  try {
    const existing = await Message.findById(messageId);

    if (!existing) {
      sendError(ws, 'Message not found');
      return;
    }

    if (existing.authorId !== ws.userId) {
      sendError(ws, 'You can only edit your own messages');
      return;
    }

    existing.content = newContent.trim();
    existing.isEdited = true;
    await existing.save();
  } catch (err) {
    console.error(`[DB] Failed to edit message ${messageId}:`, (err as Error).message);
    sendError(ws, 'Failed to save edit');
    return;
  }

  const editedPayload: MessageEditedPayload = {
    messageId,
    channelId,
    newContent: newContent.trim(),
    editedAt: new Date().toISOString(),
  };

  broadcastToChannel(channelId, buildMessage('MESSAGE_EDITED', editedPayload));
  console.log(`[Edit] ${ws.username} edited message ${messageId}`);
}

// ─── Handler: DELETE_MESSAGE ──────────────────────────────────────────────────
// Soft-delete: we keep the row (isDeleted: true) rather than removing it,
// so thread replies / reactions pointing at it don't dangle.
export async function handleDeleteMessage(
  ws: AuthenticatedWebSocket,
  payload: DeleteMessagePayload
): Promise<void> {
  const { messageId, channelId } = payload;

  if (!messageId || !channelId) {
    sendError(ws, 'DELETE_MESSAGE requires messageId and channelId');
    return;
  }

  try {
    const existing = await Message.findById(messageId);

    if (!existing) {
      sendError(ws, 'Message not found');
      return;
    }

    if (existing.authorId !== ws.userId) {
      sendError(ws, 'You can only delete your own messages');
      return;
    }

    existing.isDeleted = true;
    existing.content = ''; // scrub content so it's not sitting in the DB either
    await existing.save();
  } catch (err) {
    console.error(`[DB] Failed to delete message ${messageId}:`, (err as Error).message);
    sendError(ws, 'Failed to delete message');
    return;
  }

  messageOwners.delete(messageId);

  const deletedPayload: MessageDeletedPayload = { messageId, channelId };
  broadcastToChannel(channelId, buildMessage('MESSAGE_DELETED', deletedPayload));
  console.log(`[Delete] ${ws.username} deleted message ${messageId}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 4 (cont.): Emoji Reactions
// ═══════════════════════════════════════════════════════════════════════════

export async function handleAddReaction(
  ws: AuthenticatedWebSocket,
  payload: AddReactionPayload
): Promise<void> {
  const { messageId, channelId, emoji } = payload;

  if (!messageId || !channelId || !emoji) {
    sendError(ws, 'ADD_REACTION requires messageId, channelId, and emoji');
    return;
  }

  try {
    // $addToSet on the matching reaction's userIds array, avoiding duplicates.
    // If the emoji doesn't exist yet on this message, push a new reaction entry.
    const existing = await Message.findOne({ _id: messageId, 'reactions.emoji': emoji });

    if (existing) {
      await Message.updateOne(
        { _id: messageId, 'reactions.emoji': emoji },
        { $addToSet: { 'reactions.$.userIds': ws.userId } }
      );
    } else {
      await Message.updateOne(
        { _id: messageId },
        { $push: { reactions: { emoji, userIds: [ws.userId] } } }
      );
    }
  } catch (err) {
    console.error(`[DB] Failed to add reaction on ${messageId}:`, (err as Error).message);
    // Don't block the real-time broadcast on a DB hiccup for something this minor
  }

  const update: ReactionUpdatePayload = {
    messageId,
    channelId,
    emoji,
    userId: ws.userId,
    action: 'add',
  };

  broadcastToChannel(channelId, buildMessage('REACTION_UPDATE', update));
}

export async function handleRemoveReaction(
  ws: AuthenticatedWebSocket,
  payload: RemoveReactionPayload
): Promise<void> {
  const { messageId, channelId, emoji } = payload;

  if (!messageId || !channelId || !emoji) {
    sendError(ws, 'REMOVE_REACTION requires messageId, channelId, and emoji');
    return;
  }

  try {
    await Message.updateOne(
      { _id: messageId, 'reactions.emoji': emoji },
      { $pull: { 'reactions.$.userIds': ws.userId } }
    );
  } catch (err) {
    console.error(`[DB] Failed to remove reaction on ${messageId}:`, (err as Error).message);
  }

  const update: ReactionUpdatePayload = {
    messageId,
    channelId,
    emoji,
    userId: ws.userId,
    action: 'remove',
  };

  broadcastToChannel(channelId, buildMessage('REACTION_UPDATE', update));
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 4 (cont.): Thread Replies
// ═══════════════════════════════════════════════════════════════════════════

// ─── Handler: SEND_THREAD_REPLY ───────────────────────────────────────────────
// A thread reply belongs to a parent message but still broadcasts to the same
// channel — the frontend groups replies under the parent using parentMessageId.
export async function handleSendThreadReply(
  ws: AuthenticatedWebSocket,
  payload: SendThreadReplyPayload
): Promise<void> {
  const { parentMessageId, channelId, content, tempId } = payload;

  if (!parentMessageId || !channelId || !content?.trim()) {
    sendError(ws, 'SEND_THREAD_REPLY requires parentMessageId, channelId, and content');
    return;
  }

  const trimmedContent = content.trim();
  const id = randomUUID();

  const reply: ThreadReplyPayload = {
    id,
    tempId,
    parentMessageId,
    channelId,
    content: trimmedContent,
    timestamp: new Date().toISOString(),
    user: { id: ws.userId, name: ws.username },
  };

  messageOwners.set(reply.id, { authorId: ws.userId, channelId });

  // Broadcast first, persist after — same pattern as handleSendMessage
  broadcastToChannel(channelId, buildMessage('THREAD_REPLY', reply));

  try {
    await Message.create({
      _id: id,
      channelId,
      authorId: ws.userId,
      authorName: ws.username,
      content: trimmedContent,
      isDM: false,
      parentMessageId,
    });
  } catch (err) {
    console.error(`[DB] Failed to save thread reply ${id}:`, (err as Error).message);
  }

  console.log(`[Thread] ${ws.username} replied to ${parentMessageId}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 7: Read Receipts (Sent → Delivered → Read)
// ═══════════════════════════════════════════════════════════════════════════
//
// "Sent" happens implicitly the moment broadcastToChannel succeeds in
// handleSendMessage — there's no separate event for it.
// Below we handle the next two stages, which the RECEIVING client reports
// back to the server.

// ─── Handler: MARK_DELIVERED ──────────────────────────────────────────────────
// Client calls this the instant a NEW_MESSAGE event lands in their app
// (i.e. it reached their device — doesn't mean they've seen it yet).
export function handleMarkDelivered(
  ws: AuthenticatedWebSocket,
  payload: MarkDeliveredPayload
): void {
  const { messageId, channelId } = payload;

  if (!messageId || !channelId) {
    sendError(ws, 'MARK_DELIVERED requires messageId and channelId');
    return;
  }

  const receipt: ReceiptUpdatePayload = {
    messageId,
    channelId,
    userId: ws.userId,
    status: 'delivered',
  };

  // Broadcast so the original sender's UI can update the checkmark
  broadcastToChannel(channelId, buildMessage('RECEIPT_UPDATE', receipt));
}

// ─── Handler: MARK_READ ───────────────────────────────────────────────────────
// Client calls this when the message actually becomes visible on screen
// (e.g. via an IntersectionObserver in the message list).
export function handleMarkRead(
  ws: AuthenticatedWebSocket,
  payload: MarkReadPayload
): void {
  const { messageId, channelId } = payload;

  if (!messageId || !channelId) {
    sendError(ws, 'MARK_READ requires messageId and channelId');
    return;
  }

  const receipt: ReceiptUpdatePayload = {
    messageId,
    channelId,
    userId: ws.userId,
    status: 'read',
  };

  broadcastToChannel(channelId, buildMessage('RECEIPT_UPDATE', receipt));
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 8: Direct Messaging (one-to-one chat)
// ═══════════════════════════════════════════════════════════════════════════
//
// We reuse the channel subscription system: a DM conversation between two
// users is just a "channel" with a deterministic ID (see dmKey in registry.ts),
// so all the broadcast/subscribe machinery from Module 4 works unchanged.

// ─── Handler: JOIN_DM ─────────────────────────────────────────────────────────
// Client calls this when opening a DM conversation with someone, so the
// server starts routing messages from that conversation to them.
export function handleJoinDM(
  ws: AuthenticatedWebSocket,
  payload: JoinDMPayload
): void {
  const { withUserId } = payload;

  if (!withUserId) {
    sendError(ws, 'JOIN_DM requires withUserId');
    return;
  }

  const roomId = dmKey(ws.userId, withUserId);
  subscribeToChannel(ws, roomId);

  ws.send(buildMessage('CONNECTED', {
    message: `Joined DM with ${withUserId}`,
    channelId: roomId,
  }));
}

// ─── Handler: SEND_DM ──────────────────────────────────────────────────────────
export async function handleSendDM(
  ws: AuthenticatedWebSocket,
  payload: SendDMPayload
): Promise<void> {
  const { toUserId, content, tempId } = payload;

  if (!toUserId || !content?.trim()) {
    sendError(ws, 'SEND_DM requires toUserId and content');
    return;
  }

  const trimmedContent = content.trim();
  const roomId = dmKey(ws.userId, toUserId);
  const id = randomUUID();

  const dm: NewDMPayload = {
    id,
    tempId,
    fromUserId: ws.userId,
    toUserId,
    content: trimmedContent,
    timestamp: new Date().toISOString(),
    user: { id: ws.userId, name: ws.username },
  };

  messageOwners.set(dm.id, { authorId: ws.userId, channelId: roomId });

  // Broadcast within the DM "room" (covers the case where the recipient
  // already has the DM thread open and subscribed)
  broadcastToChannel(roomId, buildMessage('NEW_DM', dm));

  // ALSO push directly to the recipient's connection in case they haven't
  // opened/subscribed to this DM thread yet (e.g. they're elsewhere in the app)
  sendToUser(toUserId, buildMessage('NEW_DM', dm));

  // Persist — isDM: true distinguishes these from regular channel messages
  // when querying message history later.
  try {
    await Message.create({
      _id: id,
      channelId: roomId,
      authorId: ws.userId,
      authorName: ws.username,
      content: trimmedContent,
      isDM: true,
    });
  } catch (err) {
    console.error(`[DB] Failed to save DM ${id}:`, (err as Error).message);
  }

  // ── Module 9: Notification for DM ──────────────────────────────────────
  const notification: NotificationPayload = {
    id: randomUUID(),
    kind: 'message',
    fromUserId: ws.userId,
    fromUsername: ws.username,
    preview: trimmedContent.slice(0, 80),
    timestamp: new Date().toISOString(),
  };
  sendToUser(toUserId, buildMessage('NOTIFICATION', notification));

  console.log(`[DM] ${ws.username} → ${toUserId}: "${trimmedContent}"`);
}