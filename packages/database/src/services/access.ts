import { Types } from 'mongoose';
import { Channel, type IChannel } from '../models/channel.js';
import { WorkspaceMember } from '../models/workspace.js';
import { oid } from '../serializers.js';

export const isValidId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);

export async function getWorkspaceRole(workspaceId: string, userId: string): Promise<'admin' | 'member' | null> {
  if (!isValidId(workspaceId) || !isValidId(userId)) return null;
  const m = await WorkspaceMember.findOne({ workspaceId, userId }).select('role').lean();
  return m ? m.role : null;
}

export async function getUserWorkspaceIds(userId: string): Promise<string[]> {
  if (!isValidId(userId)) return [];
  const rows = await WorkspaceMember.find({ userId }).select('workspaceId').lean();
  return rows.map((r) => oid(r.workspaceId));
}

export async function getWorkspaceMemberIds(workspaceId: string): Promise<string[]> {
  const rows = await WorkspaceMember.find({ workspaceId }).select('userId').lean();
  return rows.map((r) => oid(r.userId));
}

/**
 * Everyone allowed to see a channel.
 * - public  → every member of the workspace
 * - private → explicit memberIds
 * - dm      → the two participants
 */
export async function resolveChannelMemberIds(channel: Pick<IChannel, 'kind' | 'workspaceId' | 'memberIds'>): Promise<string[]> {
  if (channel.kind === 'public' && channel.workspaceId) return getWorkspaceMemberIds(oid(channel.workspaceId));
  return channel.memberIds.map(oid);
}

export async function loadChannel(channelId: string): Promise<IChannel | null> {
  if (!isValidId(channelId)) return null;
  return Channel.findById(new Types.ObjectId(channelId)).lean<IChannel>();
}

/** Authoritative (uncached) access check. */
export async function userCanAccessChannel(channel: IChannel, userId: string): Promise<boolean> {
  if (channel.kind === 'public') {
    if (!channel.workspaceId) return false;
    return (await getWorkspaceRole(oid(channel.workspaceId), userId)) !== null;
  }
  return channel.memberIds.some((m) => oid(m) === userId);
}

/** Ids of every channel the user can currently see (used to auto-subscribe a fresh socket). */
export async function listAccessibleChannelIds(userId: string): Promise<string[]> {
  if (!isValidId(userId)) return [];
  const workspaceIds = await getUserWorkspaceIds(userId);
  const rows = await Channel.find({
    $or: [
      { kind: 'public', workspaceId: { $in: workspaceIds } },
      { kind: { $in: ['private', 'dm'] }, memberIds: new Types.ObjectId(userId) },
    ],
  })
    .select('_id')
    .lean();
  return rows.map((r) => oid(r._id));
}
