import type {
  ActivityDTO,
  ChannelDTO,
  FileDTO,
  NotificationDTO,
  UserDTO,
  WorkspaceDTO,
  WorkspaceRole,
} from '@repo/shared-types';
import type { IActivity } from './models/activity.js';
import type { IChannel } from './models/channel.js';
import type { IStoredFile } from './models/file.js';
import type { INotification } from './models/notification.js';
import type { IUser } from './models/user.js';
import type { IWorkspace } from './models/workspace.js';

export const oid = (v: unknown): string => String(v);

export function toUserDTO(u: Pick<IUser, '_id' | 'name' | 'email'>): UserDTO {
  return { id: oid(u._id), name: u.name, email: u.email };
}

export function toWorkspaceDTO(w: IWorkspace, myRole?: WorkspaceRole): WorkspaceDTO {
  return {
    id: oid(w._id),
    name: w.name,
    description: w.description ?? '',
    ownerId: oid(w.ownerId),
    // The invite code is a capability — only admins see it.
    inviteCode: myRole === 'admin' ? w.inviteCode : undefined,
    myRole,
    createdAt: w.createdAt.toISOString(),
  };
}

export function toChannelDTO(c: IChannel, extra?: Partial<Pick<ChannelDTO, 'dmUser'>>): ChannelDTO {
  const isPrivateish = c.kind !== 'public';
  return {
    id: oid(c._id),
    workspaceId: c.workspaceId ? oid(c.workspaceId) : null,
    name: c.name,
    kind: c.kind,
    isArchived: c.isArchived,
    memberIds: isPrivateish ? c.memberIds.map(oid) : [],
    createdBy: c.createdBy ? oid(c.createdBy) : null,
    createdAt: c.createdAt.toISOString(),
    ...extra,
  };
}

const IMAGE_RE = /^image\/(png|jpe?g|gif|webp|svg\+xml|avif)$/i;

export function toFileDTO(f: IStoredFile): FileDTO {
  return {
    id: oid(f._id),
    name: f.name,
    mimeType: f.mimeType,
    size: f.size,
    isImage: IMAGE_RE.test(f.mimeType),
    url: `/api/files/${oid(f._id)}`,
  };
}

export function toNotificationDTO(n: INotification): NotificationDTO {
  return {
    id: oid(n._id),
    kind: n.kind,
    message: n.message,
    channelId: n.channelId ? oid(n.channelId) : undefined,
    workspaceId: n.workspaceId ? oid(n.workspaceId) : undefined,
    senderId: n.senderId ? oid(n.senderId) : undefined,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}

export function toActivityDTO(a: IActivity): ActivityDTO {
  return {
    id: oid(a._id),
    kind: a.kind,
    workspaceId: oid(a.workspaceId),
    actor: { id: oid(a.actorId), name: a.actorName },
    channelId: a.channelId ? oid(a.channelId) : undefined,
    summary: a.summary,
    createdAt: a.createdAt.toISOString(),
  };
}
