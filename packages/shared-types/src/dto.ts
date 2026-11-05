// ─── DTOs shared by API, WebSocket server, worker and web ─────────────────────
// All ids are serialised as strings on the wire.

export type WorkspaceRole = 'admin' | 'member';
export type ChannelKind = 'public' | 'private' | 'dm';
export type NotificationKind = 'mention' | 'message' | 'invite';

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}

export interface UserSummary {
  id: string;
  name: string;
}

export interface WorkspaceDTO {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  inviteCode?: string; // only returned to admins
  myRole?: WorkspaceRole;
  createdAt: string;
}

export interface WorkspaceMemberDTO {
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  online: boolean;
}

export interface ChannelDTO {
  id: string;
  workspaceId: string | null;
  name: string;
  kind: ChannelKind;
  isArchived: boolean;
  memberIds: string[]; // only meaningful for private/dm
  createdBy: string | null;
  /** For DMs: the other participant. */
  dmUser?: UserSummary & { online?: boolean };
  createdAt: string;
}

export interface FileDTO {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  isImage: boolean;
  url: string; // relative API path, e.g. /api/files/<id>
}

export interface ReactionDTO {
  emoji: string;
  userIds: string[];
}

export interface MessageDTO {
  id: string;
  tempId?: string;
  channelId: string;
  content: string;
  timestamp: string;
  user: UserSummary;
  parentMessageId?: string | null;
  reactions: ReactionDTO[];
  attachments: FileDTO[];
  isEdited: boolean;
  isDeleted: boolean;
  deliveredTo: string[];
  readBy: string[];
  replyCount: number;
}

export interface NotificationDTO {
  id: string;
  kind: NotificationKind;
  message: string;
  channelId?: string;
  workspaceId?: string;
  senderId?: string;
  read: boolean;
  createdAt: string;
}

export type ActivityKind = 'message_sent' | 'user_joined' | 'channel_created' | 'file_uploaded';

export interface ActivityDTO {
  id: string;
  kind: ActivityKind;
  workspaceId: string;
  actor: UserSummary;
  channelId?: string;
  summary: string;
  createdAt: string;
}

export interface SearchResultDTO {
  messages: MessageDTO[];
  users: UserDTO[];
  channels: ChannelDTO[];
}

export const MESSAGE_PAGE_SIZE = 50;
export const MAX_MESSAGE_LENGTH = 4000;

export interface PendingInviteDTO {
  id: string;
  email: string;
  invitedBy: string;
  createdAt: string;
}

export interface AuditEntryDTO {
  id: string;
  action: string;
  user: { id: string; name: string };
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AnalyticsDTO {
  days: Array<{ date: string; messages: number; activeUsers: number }>;
  topChannels: Array<{ channelId: string; name: string; messages: number }>;
  totals: { messages: number; members: number; channels: number };
}
