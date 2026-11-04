import { Router } from 'express';
import { Channel, User, WorkspaceMember, fetchChannelHistory, getWorkspaceRole, toChannelDTO } from '@repo/database';
import { enqueueAudit, invalidateChannelMembers, publishBroadcast } from '@repo/queue';
import { authed, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { channelMemberSchema, historyQuerySchema, renameChannelSchema } from '../lib/schemas.js';
import { requireChannelAccess } from '../lib/access.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { deleteChannelCascade } from '../lib/cascade.js';
import { param } from '../lib/params.js';

const router: Router = Router();
router.use(requireAuth);

/** Channel settings (rename/archive/delete) are for workspace admins or the channel's creator. */
async function requireChannelManager(channelId: string, userId: string) {
  const channel = await requireChannelAccess(channelId, userId);
  if (channel.kind === 'dm' || !channel.workspaceId) throw badRequest('Direct messages cannot be managed');
  const role = await getWorkspaceRole(String(channel.workspaceId), userId);
  if (role !== 'admin' && String(channel.createdBy) !== userId) throw forbidden('Only workspace admins or the channel creator can do that');
  return channel;
}

function notifyChange(channel: { _id: unknown; workspaceId: unknown; kind: string; memberIds: unknown[] }, change: 'renamed' | 'archived' | 'unarchived' | 'deleted' | 'members') {
  const payload = { channelId: String(channel._id), workspaceId: channel.workspaceId ? String(channel.workspaceId) : null, change };
  if (channel.kind === 'public' && channel.workspaceId) {
    void publishBroadcast({ kind: 'workspaces', workspaceIds: [String(channel.workspaceId)] }, 'CHANNEL_UPDATED', payload);
  } else {
    for (const m of channel.memberIds) void publishBroadcast({ kind: 'user', userId: String(m) }, 'CHANNEL_UPDATED', payload);
  }
}

router.get('/:id', async (req, res) => {
  const channel = await requireChannelAccess(param(req, 'id'), authed(req).userId);
  res.json({ success: true, channel: toChannelDTO(channel) });
});

// Module 4: message history + infinite scroll (REST twin of LOAD_MORE_MESSAGES)
router.get('/:id/messages', validate(historyQuerySchema, 'query'), async (req, res) => {
  await requireChannelAccess(param(req, 'id'), authed(req).userId);
  const { before, limit } = req.query as unknown as { before?: string; limit?: number };
  const page = await fetchChannelHistory(param(req, 'id'), { before, limit });
  res.json({ success: true, ...page });
});

router.patch('/:id', validate(renameChannelSchema), async (req, res) => {
  const user = authed(req);
  const channel = await requireChannelManager(param(req, 'id'), user.userId);
  const updated = await Channel.findByIdAndUpdate(channel._id, { name: req.body.name }, { new: true }).lean();
  if (!updated) throw notFound('Channel not found');
  notifyChange(updated, 'renamed');
  void enqueueAudit('channel_renamed', user.userId, { channelId: param(req, 'id'), name: req.body.name });
  res.json({ success: true, channel: toChannelDTO(updated) });
});

// Module 3: archive (read-only) / unarchive
for (const [path, archived] of [['archive', true], ['unarchive', false]] as const) {
  router.post(`/:id/${path}`, async (req, res) => {
    const user = authed(req);
    const channel = await requireChannelManager(param(req, 'id'), user.userId);
    const updated = await Channel.findByIdAndUpdate(channel._id, { isArchived: archived }, { new: true }).lean();
    if (!updated) throw notFound('Channel not found');
    notifyChange(updated, archived ? 'archived' : 'unarchived');
    void enqueueAudit(archived ? 'channel_archived' : 'channel_unarchived', user.userId, { channelId: param(req, 'id') });
    res.json({ success: true, channel: toChannelDTO(updated) });
  });
}

router.delete('/:id', async (req, res) => {
  const user = authed(req);
  const channel = await requireChannelManager(param(req, 'id'), user.userId);
  const general = await Channel.findOne({ workspaceId: channel.workspaceId, name: 'general', kind: 'public' }).select('_id').lean();
  if (general && String(general._id) === param(req, 'id')) throw badRequest('The #general channel cannot be deleted');

  await deleteChannelCascade(channel);
  notifyChange(channel, 'deleted');
  void enqueueAudit('channel_deleted', user.userId, { channelId: param(req, 'id'), name: channel.name });
  res.json({ success: true, message: 'Channel deleted' });
});

// ─── Members (meaningful for private channels; public = whole workspace) ─────
router.get('/:id/members', async (req, res) => {
  const channel = await requireChannelAccess(param(req, 'id'), authed(req).userId);
  const ids =
    channel.kind === 'public'
      ? await WorkspaceMember.find({ workspaceId: channel.workspaceId }).distinct('userId')
      : channel.memberIds;
  const users = await User.find({ _id: { $in: ids } }).select('name email').lean();
  res.json({ success: true, members: users.map((u) => ({ userId: String(u._id), name: u.name, email: u.email })) });
});

router.post('/:id/members', validate(channelMemberSchema), async (req, res) => {
  const user = authed(req);
  const channel = await requireChannelAccess(param(req, 'id'), user.userId);
  if (channel.kind !== 'private' || !channel.workspaceId) throw badRequest('Members can only be managed on private channels');
  if (!(await getWorkspaceRole(String(channel.workspaceId), req.body.userId))) throw badRequest('User is not in this workspace');

  const updated = await Channel.findByIdAndUpdate(channel._id, { $addToSet: { memberIds: req.body.userId } }, { new: true }).lean();
  await invalidateChannelMembers(param(req, 'id'));
  if (updated) {
    notifyChange(updated, 'members');
    void publishBroadcast({ kind: 'user', userId: req.body.userId }, 'CHANNEL_UPDATED', {
      channelId: param(req, 'id'),
      workspaceId: String(channel.workspaceId),
      change: 'created',
    });
  }
  void enqueueAudit('channel_member_added', user.userId, { channelId: param(req, 'id'), userId: req.body.userId });
  res.json({ success: true, channel: updated ? toChannelDTO(updated) : undefined });
});

router.delete('/:id/members/:userId', async (req, res) => {
  const user = authed(req);
  const channel = await requireChannelAccess(param(req, 'id'), user.userId);
  if (channel.kind !== 'private') throw badRequest('Members can only be managed on private channels');
  const isSelf = param(req, 'userId') === user.userId;
  if (!isSelf) await requireChannelManager(param(req, 'id'), user.userId);

  await Channel.updateOne({ _id: channel._id }, { $pull: { memberIds: param(req, 'userId') } });
  await invalidateChannelMembers(param(req, 'id'));
  notifyChange(channel, 'members');
  void publishBroadcast({ kind: 'user', userId: param(req, 'userId') }, 'CHANNEL_UPDATED', {
    channelId: param(req, 'id'),
    workspaceId: channel.workspaceId ? String(channel.workspaceId) : null,
    change: 'deleted',
  });
  void enqueueAudit('channel_member_removed', user.userId, { channelId: param(req, 'id'), userId: param(req, 'userId') });
  res.json({ success: true });
});

export default router;
