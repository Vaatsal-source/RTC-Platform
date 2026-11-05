import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import {
  Activity,
  AuditLog,
  WorkspaceInvite,
  isValidId,
  Channel,
  Message,
  StoredFile,
  User,
  Workspace,
  WorkspaceMember,
  toActivityDTO,
  toChannelDTO,
  toWorkspaceDTO,
} from '@repo/database';
import type { AnalyticsDTO, AuditEntryDTO, PendingInviteDTO, WorkspaceMemberDTO } from '@repo/shared-types';
import {
  enqueueAudit,
  enqueueEmail,
  enqueueNotification,
  filterOnline,
  getRedis,
  invalidateChannelMembers,
  invalidateWorkspaceChannels,
  publishBroadcast,
  publishEvent,
} from '@repo/queue';
import { authed, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  activityQuerySchema,
  auditQuerySchema,
  createChannelSchema,
  createWorkspaceSchema,
  inviteMemberSchema,
  joinWorkspaceSchema,
  roleSchema,
  updateWorkspaceSchema,
} from '../lib/schemas.js';
import { requireAdmin, requireMember, requireWorkspace } from '../lib/access.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { config } from '../lib/env.js';
import { removeUserFromWorkspaceChannels } from '../lib/cascade.js';
import { storage } from '../lib/storage.js';
import { addMember, notifyMembershipChange } from '../lib/membership.js';
import { param } from '../lib/params.js';

const router: Router = Router();
router.use(requireAuth);

const newInviteCode = () => randomBytes(9).toString('base64url');

// ─── Create / list ────────────────────────────────────────────────────────────
router.post('/', validate(createWorkspaceSchema), async (req, res) => {
  const user = authed(req);
  const { name, description } = req.body;

  const workspace = await Workspace.create({ name, description: description ?? '', ownerId: user.userId, inviteCode: newInviteCode() });
  const wid = String(workspace._id);
  await WorkspaceMember.create({ workspaceId: wid, userId: user.userId, role: 'admin' });

  const general = await Channel.create({ workspaceId: wid, name: 'general', kind: 'public', createdBy: user.userId });

  void publishEvent({ type: 'user-joined', workspaceId: wid, userId: user.userId, userName: user.name, ts: Date.now() });
  void publishEvent({
    type: 'channel-created',
    channelId: String(general._id),
    workspaceId: wid,
    name: 'general',
    actorId: user.userId,
    actorName: user.name,
    ts: Date.now(),
  });
  void enqueueAudit('workspace_created', user.userId, { workspaceId: wid, name });

  res.status(201).json({ success: true, workspace: toWorkspaceDTO(workspace.toObject(), 'admin') });
});

router.get('/', async (req, res) => {
  const memberships = await WorkspaceMember.find({ userId: authed(req).userId }).lean();
  const roles = new Map(memberships.map((m) => [String(m.workspaceId), m.role]));
  const workspaces = await Workspace.find({ _id: { $in: [...roles.keys()] } })
    .sort({ createdAt: 1 })
    .lean();
  res.json({ success: true, workspaces: workspaces.map((w) => toWorkspaceDTO(w, roles.get(String(w._id)))) });
});

// ─── Join via invite code ─────────────────────────────────────────────────────
router.post('/join', validate(joinWorkspaceSchema), async (req, res) => {
  const user = authed(req);
  const workspace = await Workspace.findOne({ inviteCode: req.body.code }).lean();
  if (!workspace) throw notFound('Invalid invite code');
  const wid = String(workspace._id);

  if (await WorkspaceMember.exists({ workspaceId: wid, userId: user.userId })) throw conflict('You are already a member');
  await addMember(wid, user.userId, user.name, 'member');
  void enqueueAudit('workspace_joined', user.userId, { workspaceId: wid, via: 'invite_code' });

  res.json({ success: true, workspace: toWorkspaceDTO(workspace, 'member') });
});

// ─── Single workspace ─────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const role = await requireMember(param(req, 'id'), authed(req).userId);
  const workspace = await requireWorkspace(param(req, 'id'));
  res.json({ success: true, workspace: toWorkspaceDTO(workspace, role) });
});

// Module 2: workspace settings
router.patch('/:id', validate(updateWorkspaceSchema), async (req, res) => {
  const user = authed(req);
  await requireAdmin(param(req, 'id'), user.userId);
  const workspace = await Workspace.findByIdAndUpdate(param(req, 'id'), { $set: req.body }, { new: true }).lean();
  if (!workspace) throw notFound('Workspace not found');
  void enqueueAudit('workspace_updated', user.userId, { workspaceId: param(req, 'id'), fields: Object.keys(req.body) });
  res.json({ success: true, workspace: toWorkspaceDTO(workspace, 'admin') });
});

router.post('/:id/invite-code', async (req, res) => {
  const user = authed(req);
  await requireAdmin(param(req, 'id'), user.userId);
  const workspace = await Workspace.findByIdAndUpdate(param(req, 'id'), { inviteCode: newInviteCode() }, { new: true }).lean();
  if (!workspace) throw notFound('Workspace not found');
  void enqueueAudit('workspace_invite_code_rotated', user.userId, { workspaceId: param(req, 'id') });
  res.json({ success: true, workspace: toWorkspaceDTO(workspace, 'admin') });
});

router.delete('/:id', async (req, res) => {
  const user = authed(req);
  await requireMember(param(req, 'id'), user.userId);
  const workspace = await requireWorkspace(param(req, 'id'));
  if (String(workspace.ownerId) !== user.userId) throw forbidden('Only the workspace owner can delete it');

  const channels = await Channel.find({ workspaceId: workspace._id }).select('_id').lean();
  const channelIds = channels.map((c) => c._id);
  const files = await StoredFile.find({ channelId: { $in: channelIds } }).select('storageName').lean();
  await Promise.all([
    Message.deleteMany({ channelId: { $in: channelIds } }),
    StoredFile.deleteMany({ channelId: { $in: channelIds } }),
    Channel.deleteMany({ workspaceId: workspace._id }),
    WorkspaceMember.deleteMany({ workspaceId: workspace._id }),
    Activity.deleteMany({ workspaceId: workspace._id }),
    Workspace.deleteOne({ _id: workspace._id }),
  ]);
  await Promise.all(files.map((f) => storage.remove(f.storageName))); // the uploaded bytes, not just their records
  await invalidateChannelMembers(...channelIds.map(String));
  void enqueueAudit('workspace_deleted', user.userId, { workspaceId: param(req, 'id'), name: workspace.name });
  res.json({ success: true, message: 'Workspace deleted' });
});

// ─── Members ──────────────────────────────────────────────────────────────────
router.get('/:id/members', async (req, res) => {
  await requireMember(param(req, 'id'), authed(req).userId);
  const rows = await WorkspaceMember.find({ workspaceId: param(req, 'id') }).lean();
  const users = await User.find({ _id: { $in: rows.map((r) => r.userId) } })
    .select('name email')
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const online = new Set(await filterOnline(rows.map((r) => String(r.userId))));

  const members: WorkspaceMemberDTO[] = rows
    .filter((r) => byId.has(String(r.userId)))
    .map((r) => {
      const u = byId.get(String(r.userId))!;
      return { userId: String(u._id), name: u.name, email: u.email, role: r.role, online: online.has(String(u._id)) };
    });
  res.json({ success: true, members });
});

// Module 2: invite members by email (existing users are added at once; others get a pending invitation + email) or user id
router.post('/:id/members', validate(inviteMemberSchema), async (req, res) => {
  const requester = authed(req);
  await requireAdmin(param(req, 'id'), requester.userId);
  const workspace = await requireWorkspace(param(req, 'id'));

  const target = req.body.userId ? await User.findById(req.body.userId) : await User.findOne({ email: req.body.email });
  if (!target) {
    // No account yet: remember the invitation (redeemed once that email is verified) and email them a sign-up link.
    if (!req.body.email) throw notFound('User not found');
    const email: string = req.body.email;
    await WorkspaceInvite.updateOne({ workspaceId: param(req, 'id'), email }, { $setOnInsert: { invitedBy: requester.userId } }, { upsert: true });
    await enqueueEmail('workspace_invite_signup', {
      to: email,
      subject: `${requester.name} invited you to ${workspace.name} on SyncGrid`,
      body: `${requester.name} invited you to join the workspace "${workspace.name}".\n\nCreate an account with this email address and confirm it, and you will be added automatically:\n${config.APP_URL}/?invite=${workspace.inviteCode}\n\n(The link also lets you join directly once you are signed in.)`,
    });
    void enqueueAudit('workspace_invite_sent', requester.userId, { workspaceId: param(req, 'id'), email });
    return void res.status(202).json({ success: true, pending: true, email });
  }
  const targetId = String(target._id);

  if (await WorkspaceMember.exists({ workspaceId: param(req, 'id'), userId: targetId })) throw conflict('User is already a member');
  await addMember(param(req, 'id'), targetId, target.name, 'member');

  void enqueueNotification(
    'workspace_invite',
    {
      userId: targetId,
      type: 'invite',
      message: `${requester.name} added you to ${workspace.name}`,
      workspaceId: param(req, 'id'),
      senderId: requester.userId,
      senderName: requester.name,
    },
    `invite-${param(req, 'id')}-${targetId}`,
  );
  void enqueueEmail('workspace_invite_email', {
    to: target.email,
    subject: `You were added to ${workspace.name}`,
    body: `Hi ${target.name}, ${requester.name} added you to the workspace "${workspace.name}". Open ${config.APP_URL} to start chatting.`,
    userId: targetId,
  });
  void enqueueAudit('workspace_member_added', requester.userId, { workspaceId: param(req, 'id'), invitedUserId: targetId });

  res.status(201).json({ success: true, member: { userId: targetId, name: target.name, email: target.email, role: 'member' } });
});

// Module 2: role management
router.patch('/:id/members/:userId', validate(roleSchema), async (req, res) => {
  const requester = authed(req);
  await requireAdmin(param(req, 'id'), requester.userId);
  const workspace = await requireWorkspace(param(req, 'id'));

  if (String(workspace.ownerId) === param(req, 'userId')) throw forbidden("The owner's role can't be changed");
  const updated = await WorkspaceMember.findOneAndUpdate(
    { workspaceId: param(req, 'id'), userId: param(req, 'userId') },
    { role: req.body.role },
    { new: true },
  ).lean();
  if (!updated) throw notFound('Member not found');

  void enqueueAudit('workspace_role_changed', requester.userId, {
    workspaceId: param(req, 'id'),
    targetUserId: param(req, 'userId'),
    role: req.body.role,
  });
  res.json({ success: true, member: { userId: param(req, 'userId'), role: updated.role } });
});

// Remove a member (admin) or leave (self)
router.delete('/:id/members/:userId', async (req, res) => {
  const requester = authed(req);
  const isSelf = requester.userId === param(req, 'userId');
  if (isSelf) await requireMember(param(req, 'id'), requester.userId);
  else await requireAdmin(param(req, 'id'), requester.userId);

  const workspace = await requireWorkspace(param(req, 'id'));
  if (String(workspace.ownerId) === param(req, 'userId')) throw badRequest("The owner can't leave or be removed — delete the workspace instead");

  const removed = await WorkspaceMember.findOneAndDelete({ workspaceId: param(req, 'id'), userId: param(req, 'userId') });
  if (!removed) throw notFound('Member not found');

  await removeUserFromWorkspaceChannels(param(req, 'id'), param(req, 'userId'));
  await invalidateWorkspaceChannels(param(req, 'id'));
  notifyMembershipChange(param(req, 'id'), param(req, 'userId'));
  void enqueueAudit(isSelf ? 'workspace_left' : 'workspace_member_removed', requester.userId, {
    workspaceId: param(req, 'id'),
    targetUserId: param(req, 'userId'),
  });
  res.json({ success: true });
});

// ─── Channels (create / list) ─────────────────────────────────────────────────
router.get('/:id/channels', async (req, res) => {
  const user = authed(req);
  await requireMember(param(req, 'id'), user.userId);
  const channels = await Channel.find({
    workspaceId: param(req, 'id'),
    $or: [{ kind: 'public' }, { kind: 'private', memberIds: user.userId }],
  })
    .sort({ name: 1 })
    .lean();
  res.json({ success: true, channels: channels.map((c) => toChannelDTO(c)) });
});

router.post('/:id/channels', validate(createChannelSchema), async (req, res) => {
  const user = authed(req);
  await requireMember(param(req, 'id'), user.userId);
  const { name, isPrivate, memberIds } = req.body as { name: string; isPrivate: boolean; memberIds: string[] };

  let members: string[] = [];
  if (isPrivate) {
    members = [...new Set([user.userId, ...memberIds])];
    const valid = await WorkspaceMember.countDocuments({ workspaceId: param(req, 'id'), userId: { $in: members } });
    if (valid !== members.length) throw badRequest('All private channel members must belong to the workspace');
  }

  const channel = await Channel.create({
    workspaceId: param(req, 'id'),
    name,
    kind: isPrivate ? 'private' : 'public',
    memberIds: members,
    createdBy: user.userId,
  });
  const cid = String(channel._id);

  void publishEvent({ type: 'channel-created', channelId: cid, workspaceId: param(req, 'id'), name, actorId: user.userId, actorName: user.name, ts: Date.now() });
  if (isPrivate) {
    for (const m of members) void publishBroadcast({ kind: 'user', userId: m }, 'CHANNEL_UPDATED', { channelId: cid, workspaceId: param(req, 'id'), change: 'created' });
  } else {
    void publishBroadcast({ kind: 'workspaces', workspaceIds: [param(req, 'id')] }, 'CHANNEL_UPDATED', { channelId: cid, workspaceId: param(req, 'id'), change: 'created' });
  }
  void enqueueAudit('channel_created', user.userId, { workspaceId: param(req, 'id'), channelId: cid, name, isPrivate });

  res.status(201).json({ success: true, channel: toChannelDTO(channel.toObject()) });
});

// ─── Activity feed (Module 12) ────────────────────────────────────────────────
router.get('/:id/activity', validate(activityQuerySchema, 'query'), async (req, res) => {
  const user = authed(req);
  await requireMember(param(req, 'id'), user.userId);
  const { limit } = req.query as unknown as { limit: number };

  // Don't leak activity from private channels the caller can't see.
  const hidden = await Channel.find({ workspaceId: param(req, 'id'), kind: 'private', memberIds: { $ne: user.userId } }).distinct('_id');
  const items = await Activity.find({ workspaceId: param(req, 'id'), channelId: { $nin: hidden } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  res.json({ success: true, activity: items.map(toActivityDTO) });
});

// ─── Pending email invitations ───────────────────────────────────────────────
router.get('/:id/invites', async (req, res) => {
  await requireAdmin(param(req, 'id'), authed(req).userId);
  const invites = await WorkspaceInvite.find({ workspaceId: param(req, 'id') }).sort({ createdAt: -1 }).lean();
  const invites_: PendingInviteDTO[] = invites.map((i) => ({ id: String(i._id), email: i.email, invitedBy: String(i.invitedBy), createdAt: i.createdAt.toISOString() }));
  res.json({ success: true, invites: invites_ });
});

router.delete('/:id/invites/:inviteId', async (req, res) => {
  await requireAdmin(param(req, 'id'), authed(req).userId);
  const r = await WorkspaceInvite.deleteOne({ _id: param(req, 'inviteId'), workspaceId: param(req, 'id') });
  if (r.deletedCount === 0) throw notFound('Invitation not found');
  res.json({ success: true });
});

// ─── Audit log (admins) ──────────────────────────────────────────────────────
router.get('/:id/audit', validate(auditQuerySchema, 'query'), async (req, res) => {
  await requireAdmin(param(req, 'id'), authed(req).userId);
  const { limit } = req.query as unknown as { limit: number };
  const rows = await AuditLog.find({ 'metadata.workspaceId': param(req, 'id') }).sort({ timestamp: -1 }).limit(limit).lean();
  const users = await User.find({ _id: { $in: [...new Set(rows.map((r) => r.userId))].filter(isValidId) } }).select('name').lean();
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  const entries: AuditEntryDTO[] = rows.map((r) => ({
    id: String(r._id),
    action: r.action,
    user: { id: r.userId, name: names.get(r.userId) ?? 'Unknown' },
    metadata: r.metadata ?? {},
    createdAt: new Date(r.timestamp).toISOString(),
  }));
  res.json({ success: true, entries });
});

// ─── Analytics (admins): the Redis rollups the worker's analytics service writes ────────
router.get('/:id/analytics', async (req, res) => {
  const wid = param(req, 'id');
  await requireAdmin(wid, authed(req).userId);

  const dates = Array.from({ length: 7 }, (_, i) => new Date(Date.now() - (6 - i) * 86_400_000).toISOString().slice(0, 10));
  const redis = getRedis();
  const pipe = redis.pipeline();
  for (const d of dates) pipe.hgetall(`analytics:ws:${wid}:messages:${d}`).scard(`analytics:ws:${wid}:posters:${d}`);
  const out = (await pipe.exec()) ?? [];

  const perChannel = new Map<string, number>();
  const days: AnalyticsDTO['days'] = dates.map((date, i) => {
    const counts = (out[i * 2]?.[1] ?? {}) as Record<string, string>;
    let messages = 0;
    for (const [channelId, n] of Object.entries(counts)) {
      messages += Number(n);
      perChannel.set(channelId, (perChannel.get(channelId) ?? 0) + Number(n));
    }
    return { date, messages, activeUsers: Number(out[i * 2 + 1]?.[1] ?? 0) };
  });

  const [channels, members] = await Promise.all([
    Channel.find({ workspaceId: wid }).select('name').lean(),
    WorkspaceMember.countDocuments({ workspaceId: wid }),
  ]);
  const names = new Map(channels.map((c) => [String(c._id), c.name]));
  const topChannels = [...perChannel.entries()]
    .filter(([id]) => names.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([channelId, messages]) => ({ channelId, name: names.get(channelId)!, messages }));

  const result: AnalyticsDTO = { days, topChannels, totals: { messages: days.reduce((n, d) => n + d.messages, 0), members, channels: channels.length } };
  res.json({ success: true, ...result });
});

export default router;
