import {
  getWorkspaceRole,
  isValidId,
  loadChannel,
  userCanAccessChannel,
  type IChannel,
  type IWorkspace,
  Workspace,
} from '@repo/database';
import type { WorkspaceRole } from '@repo/shared-types';
import { forbidden, notFound } from './errors.js';

/** Resolves the caller's role in a workspace or throws 404 (don't reveal existence to outsiders). */
export async function requireMember(workspaceId: string, userId: string): Promise<WorkspaceRole> {
  if (!isValidId(workspaceId)) throw notFound('Workspace not found');
  const role = await getWorkspaceRole(workspaceId, userId);
  if (!role) throw notFound('Workspace not found');
  return role;
}

export async function requireAdmin(workspaceId: string, userId: string): Promise<void> {
  const role = await requireMember(workspaceId, userId);
  if (role !== 'admin') throw forbidden('Only workspace admins can do that');
}

export async function requireWorkspace(workspaceId: string): Promise<IWorkspace> {
  const ws = isValidId(workspaceId) ? await Workspace.findById(workspaceId).lean<IWorkspace>() : null;
  if (!ws) throw notFound('Workspace not found');
  return ws;
}

/** Loads a channel the caller is allowed to see, else 404. */
export async function requireChannelAccess(channelId: string, userId: string): Promise<IChannel> {
  const channel = await loadChannel(channelId);
  if (!channel || !(await userCanAccessChannel(channel, userId))) throw notFound('Channel not found');
  return channel;
}
