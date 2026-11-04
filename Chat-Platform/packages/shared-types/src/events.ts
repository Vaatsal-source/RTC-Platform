import type { NotificationKind } from './dto.js';

// ═══════════════════════════════════════════════════════════════════════════
// Domain events published on Redis Pub/Sub. Services (notification, audit,
// activity, analytics) subscribe instead of being called directly.
// The Redis channel name equals the event `type`.
// ═══════════════════════════════════════════════════════════════════════════

export const EVENT_CHANNELS = {
  MESSAGE_CREATED: 'message-created',
  PRESENCE_UPDATED: 'presence-updated',
  NOTIFICATION_CREATED: 'notification-created',
  CHANNEL_CREATED: 'channel-created',
  USER_JOINED: 'user-joined',
  FILE_UPLOADED: 'file-uploaded',
} as const;

/** Transport channel carrying client-bound frames between WS instances. */
export const WS_BROADCAST_CHANNEL = 'ws:broadcast';

export interface MessageCreatedEvent {
  type: 'message-created';
  messageId: string;
  channelId: string;
  channelName: string;
  workspaceId: string | null;
  isDM: boolean;
  parentMessageId?: string | null;
  authorId: string;
  authorName: string;
  content: string;
  mentionedUserIds: string[];
  recipientIds: string[]; // everyone who can see the channel except the author
  ts: number;
}

export interface PresenceUpdatedEvent {
  type: 'presence-updated';
  userId: string;
  username: string;
  status: 'online' | 'offline';
  workspaceIds: string[];
  ts: number;
}

export interface NotificationCreatedEvent {
  type: 'notification-created';
  notificationId: string;
  userId: string;
  kind: NotificationKind;
  message: string;
  channelId?: string;
  workspaceId?: string;
  senderId?: string;
  senderName?: string;
  createdAt: string;
  ts: number;
}

export interface ChannelCreatedEvent {
  type: 'channel-created';
  channelId: string;
  workspaceId: string;
  name: string;
  actorId: string;
  actorName: string;
  ts: number;
}

export interface UserJoinedEvent {
  type: 'user-joined';
  workspaceId: string;
  userId: string;
  userName: string;
  ts: number;
}

export interface FileUploadedEvent {
  type: 'file-uploaded';
  fileId: string;
  fileName: string;
  channelId: string;
  workspaceId: string | null;
  uploaderId: string;
  uploaderName: string;
  ts: number;
}

export type DomainEvent =
  | MessageCreatedEvent
  | PresenceUpdatedEvent
  | NotificationCreatedEvent
  | ChannelCreatedEvent
  | UserJoinedEvent
  | FileUploadedEvent;

export type DomainEventType = DomainEvent['type'];
export type EventOf<T extends DomainEventType> = Extract<DomainEvent, { type: T }>;

/** Envelope on `ws:broadcast`. Each WS instance forwards to its own sockets. */
export type BroadcastTarget =
  | { kind: 'channel'; channelId: string }
  | { kind: 'user'; userId: string }
  | { kind: 'workspaces'; workspaceIds: string[] };

export interface BroadcastEnvelope {
  origin: string; // publishing instance id (diagnostics)
  target: BroadcastTarget;
  frame: string; // pre-serialised `{type,payload}`
  excludeUserId?: string | null;
}
