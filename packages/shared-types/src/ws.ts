import { z } from 'zod';
import { MAX_MESSAGE_LENGTH } from './dto.js';
import type { MessageDTO, NotificationDTO } from './dto.js';

// ═══════════════════════════════════════════════════════════════════════════
// WebSocket protocol — every frame, both directions, is `{ type, payload }`.
// Client frames are validated at runtime with the zod schemas below.
// ═══════════════════════════════════════════════════════════════════════════

const id = z.string().min(1).max(64);
const content = z.string().trim().min(1).max(MAX_MESSAGE_LENGTH);
const tempId = z.string().max(80).optional();

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('JOIN_CHANNEL'), payload: z.object({ channelId: id }) }),
  z.object({ type: z.literal('LEAVE_CHANNEL'), payload: z.object({ channelId: id }) }),
  z.object({
    type: z.literal('SEND_MESSAGE'),
    payload: z.object({
      channelId: id,
      // May be empty when attachments are present (validated in the handler).
      content: z.string().trim().max(MAX_MESSAGE_LENGTH),
      tempId,
      attachmentIds: z.array(id).max(10).optional(),
    }),
  }),
  z.object({
    type: z.literal('SEND_THREAD_REPLY'),
    payload: z.object({ parentMessageId: id, channelId: id, content, tempId }),
  }),
  z.object({
    type: z.literal('EDIT_MESSAGE'),
    payload: z.object({ messageId: id, channelId: id, newContent: content }),
  }),
  z.object({
    type: z.literal('DELETE_MESSAGE'),
    payload: z.object({ messageId: id, channelId: id }),
  }),
  z.object({
    type: z.literal('ADD_REACTION'),
    payload: z.object({ messageId: id, channelId: id, emoji: z.string().min(1).max(32) }),
  }),
  z.object({
    type: z.literal('REMOVE_REACTION'),
    payload: z.object({ messageId: id, channelId: id, emoji: z.string().min(1).max(32) }),
  }),
  z.object({ type: z.literal('TYPING_START'), payload: z.object({ channelId: id }) }),
  z.object({ type: z.literal('TYPING_STOP'), payload: z.object({ channelId: id }) }),
  z.object({
    type: z.literal('MARK_DELIVERED'),
    payload: z.object({ messageId: id, channelId: id }),
  }),
  z.object({ type: z.literal('MARK_READ'), payload: z.object({ messageId: id, channelId: id }) }),
  z.object({
    type: z.literal('LOAD_MORE_MESSAGES'),
    payload: z.object({ channelId: id, before: z.string().min(1).max(40) }),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ClientMessageType = ClientMessage['type'];

// ─── Server → Client ──────────────────────────────────────────────────────────
export type ServerMessageType =
  | 'CONNECTED'
  | 'ERROR'
  | 'CHANNEL_JOINED'
  | 'NEW_MESSAGE'
  | 'MESSAGE_EDITED'
  | 'MESSAGE_DELETED'
  | 'MESSAGE_HISTORY'
  | 'MORE_MESSAGES_LOADED'
  | 'REACTION_UPDATE'
  | 'THREAD_REPLY'
  | 'PRESENCE_UPDATE'
  | 'PRESENCE_SNAPSHOT'
  | 'TYPING_UPDATE'
  | 'RECEIPT_UPDATE'
  | 'NOTIFICATION'
  | 'CHANNEL_UPDATED';

export interface ServerFrame<T = unknown> {
  type: ServerMessageType;
  payload: T;
}

export interface ConnectedPayload {
  userId: string;
  username: string;
  message: string;
  onlineUserIds: string[]; // snapshot of currently-online users sharing a workspace
}
export interface ChannelJoinedPayload {
  channelId: string;
}
export interface ErrorPayload {
  message: string;
  code?: string;
}
export interface MessageHistoryPayload {
  channelId: string;
  messages: MessageDTO[];
  hasMore: boolean;
}
export interface MoreMessagesPayload {
  channelId: string;
  messages: MessageDTO[];
  hasMore: boolean;
}
export interface MessageEditedPayload {
  messageId: string;
  channelId: string;
  newContent: string;
  editedAt: string;
}
export interface MessageDeletedPayload {
  messageId: string;
  channelId: string;
}
export interface ReactionUpdatePayload {
  messageId: string;
  channelId: string;
  emoji: string;
  userId: string;
  action: 'add' | 'remove';
}
export interface PresenceSnapshotPayload {
  onlineUserIds: string[];
}
export interface PresenceUpdatePayload {
  userId: string;
  username: string;
  status: 'online' | 'offline';
}
export interface TypingUpdatePayload {
  channelId: string;
  userId: string;
  username: string;
  isTyping: boolean;
}
export interface ReceiptUpdatePayload {
  messageId: string;
  channelId: string;
  userId: string;
  status: 'delivered' | 'read';
}
export type NotificationPayload = NotificationDTO & { senderName?: string };
export interface ChannelUpdatedPayload {
  channelId: string;
  workspaceId: string | null;
  change: 'created' | 'renamed' | 'archived' | 'unarchived' | 'deleted' | 'members';
}

/** Typing indicators auto-expire server side after this long without TYPING_START. */
export const TYPING_TIMEOUT_MS = 3000;
