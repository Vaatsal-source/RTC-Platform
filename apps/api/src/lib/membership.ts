import { User, WorkspaceInvite, Workspace, WorkspaceMember } from '@repo/database';
import { enqueueAudit, invalidateWorkspaceChannels, publishBroadcast, publishEvent } from '@repo/queue';

/** Tell the workspace (sidebars) and the affected user's sockets (re-scope subscriptions) that membership changed. */
export function notifyMembershipChange(workspaceId: string, userId: string): void {
  const payload = { channelId: '', workspaceId, change: 'members' as const };
  void publishBroadcast({ kind: 'workspaces', workspaceIds: [workspaceId] }, 'CHANNEL_UPDATED', payload);
  void publishBroadcast({ kind: 'user', userId }, 'CHANNEL_UPDATED', payload);
}

/** Adds a user to a workspace and fires the side effects every join shares. */
export async function addMember(workspaceId: string, userId: string, userName: string, role: 'admin' | 'member'): Promise<void> {
  await WorkspaceMember.create({ workspaceId, userId, role });
  await invalidateWorkspaceChannels(workspaceId);
  void publishEvent({ type: 'user-joined', workspaceId, userId, userName, ts: Date.now() });
  notifyMembershipChange(workspaceId, userId);
}

/**
 * Redeems invitations that were emailed to an address before it had an account.
 * Only call this once the address is VERIFIED — otherwise anyone could register
 * someone else's email and walk into their workspace.
 */
export async function acceptPendingInvites(userId: string): Promise<number> {
  const user = await User.findById(userId).select('name email').lean();
  if (!user) return 0;
  const invites = await WorkspaceInvite.find({ email: user.email }).lean();
  let joined = 0;
  for (const inv of invites) {
    const wid = String(inv.workspaceId);
    if (!(await Workspace.exists({ _id: wid }))) {
      await WorkspaceInvite.deleteOne({ _id: inv._id });
      continue;
    }
    if (!(await WorkspaceMember.exists({ workspaceId: wid, userId }))) {
      await addMember(wid, userId, user.name, 'member');
      void enqueueAudit('workspace_joined', userId, { workspaceId: wid, via: 'email_invite' });
      joined++;
    }
    await WorkspaceInvite.deleteOne({ _id: inv._id });
  }
  return joined;
}
