import type { WebSocket } from 'ws';

// ─── Authenticated WebSocket connection ───────────────────────────────────────
// We extend the raw WebSocket object to attach our own metadata to each client.
export interface AuthenticatedWebSocket extends WebSocket {
  userId: string;
  username: string;
  isAlive: boolean; // used by the heartbeat system
}

// ─── Message types the CLIENT sends TO the server ────────────────────────────
export type ClientMessageType =
  | 'JOIN_CHANNEL'
  | 'LEAVE_CHANNEL'
  | 'SEND_MESSAGE'
  | 'EDIT_MESSAGE'
  | 'DELETE_MESSAGE'
  | 'ADD_REACTION'
  | 'REMOVE_REACTION'
  | 'SEND_THREAD_REPLY'
  | 'TYPING_START'
  | 'TYPING_STOP'
  | 'MARK_DELIVERED'
  | 'MARK_READ'
  | 'SEND_DM'
  | 'JOIN_DM'
  | 'LOAD_MORE_MESSAGES';

// ─── Message types the SERVER sends TO clients ───────────────────────────────
export type ServerMessageType =
  | 'NEW_MESSAGE'
  | 'MESSAGE_EDITED'
  | 'MESSAGE_DELETED'
  | 'MESSAGE_HISTORY'
  | 'MORE_MESSAGES_LOADED'
  | 'REACTION_UPDATE'
  | 'THREAD_REPLY'
  | 'PRESENCE_UPDATE'
  | 'TYPING_UPDATE'
  | 'RECEIPT_UPDATE'
  | 'NEW_DM'
  | 'NOTIFICATION'
  | 'ERROR'
  | 'CONNECTED';

// ─── Generic envelope for every WS message ────────────────────────────────────
// Every single message in this system, both directions, follows this shape.
// type  = what kind of event is this
// payload = the actual data for that event
export interface WSMessage<T = unknown> {
  type: ClientMessageType | ServerMessageType;
  payload: T;
}

// ─── Payload shapes for CLIENT → SERVER messages ─────────────────────────────
export interface JoinChannelPayload {
  channelId: string;
}

export interface LeaveChannelPayload {
  channelId: string;
}

export interface SendMessagePayload {
  channelId: string;
  content: string;
  tempId: string; // frontend assigns this so it can reconcile optimistic UI
}

export interface TypingPayload {
  channelId: string;
}

// ── Module 4: Edit / Delete Message ──────────────────────────────────────────
export interface EditMessagePayload {
  messageId: string;
  channelId: string;
  newContent: string;
}

export interface DeleteMessagePayload {
  messageId: string;
  channelId: string;
}

// ── Module 4: Emoji Reactions ────────────────────────────────────────────────
export interface AddReactionPayload {
  messageId: string;
  channelId: string;
  emoji: string;
}

export interface RemoveReactionPayload {
  messageId: string;
  channelId: string;
  emoji: string;
}

// ── Module 4: Thread Replies ─────────────────────────────────────────────────
export interface SendThreadReplyPayload {
  parentMessageId: string;
  channelId: string;
  content: string;
  tempId: string;
}

// ── Module 7: Read Receipts ──────────────────────────────────────────────────
export interface MarkDeliveredPayload {
  messageId: string;
  channelId: string;
}

export interface MarkReadPayload {
  messageId: string;
  channelId: string;
}

// ── Module 8: Direct Messaging ───────────────────────────────────────────────
export interface SendDMPayload {
  toUserId: string;
  content: string;
  tempId: string;
}

export interface JoinDMPayload {
  withUserId: string; // the other person in the 1:1 conversation
}

// ── Module 4: Infinite Scroll ────────────────────────────────────────────────
export interface LoadMoreMessagesPayload {
  channelId: string;
  before: string; // ISO timestamp — fetch messages created before this point
}

// ─── Payload shapes for SERVER → CLIENT messages ─────────────────────────────
export interface NewMessagePayload {
  id: string;
  tempId: string; // echoed back so frontend can replace its optimistic message
  channelId: string;
  content: string;
  timestamp: string;
  user: {
    id: string;
    name: string;
  };
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

export interface ErrorPayload {
  message: string;
}

// ── Module 4: server-side broadcast shapes ───────────────────────────────────
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

export interface ThreadReplyPayload {
  id: string;
  tempId: string;
  parentMessageId: string;
  channelId: string;
  content: string;
  timestamp: string;
  user: {
    id: string;
    name: string;
  };
}

// ── Module 7: Read Receipts ──────────────────────────────────────────────────
export interface ReceiptUpdatePayload {
  messageId: string;
  channelId: string;
  userId: string;
  status: 'delivered' | 'read';
}

// ── Module 8: Direct Messaging ───────────────────────────────────────────────
export interface NewDMPayload {
  id: string;
  tempId: string;
  fromUserId: string;
  toUserId: string;
  content: string;
  timestamp: string;
  user: {
    id: string;
    name: string;
  };
}

// ── Module 9: Notifications ──────────────────────────────────────────────────
export type NotificationKind = 'mention' | 'message' | 'invite';

export interface NotificationPayload {
  id: string;
  kind: NotificationKind;
  channelId?: string;
  fromUserId: string;
  fromUsername: string;
  preview: string;
  timestamp: string;
}