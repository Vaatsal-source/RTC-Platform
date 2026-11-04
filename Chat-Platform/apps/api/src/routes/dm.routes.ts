import { Router } from 'express';
import { Channel, User, dmKeyFor, getUserWorkspaceIds, toChannelDTO, WorkspaceMember } from '@repo/database';
import { enqueueAudit, filterOnline, publishBroadcast } from '@repo/queue';
import { authed, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createDmSchema } from '../lib/schemas.js';
import { badRequest, notFound } from '../lib/errors.js';

// Module 8 — one-to-one chat. A DM is a Channel with kind 'dm' and two members.

const router: Router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const me = authed(req).userId;
  const channels = await Channel.find({ kind: 'dm', memberIds: me }).sort({ updatedAt: -1 }).lean();
  const otherIds = channels.map((c) => c.memberIds.map(String).find((m) => m !== me) ?? me);
  const [users, online] = await Promise.all([User.find({ _id: { $in: otherIds } }).select('name').lean(), filterOnline(otherIds)]);
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  const onlineSet = new Set(online);

  res.json({
    success: true,
    channels: channels.map((c, i) =>
      toChannelDTO(c, { dmUser: { id: otherIds[i], name: names.get(otherIds[i]) ?? 'Unknown', online: onlineSet.has(otherIds[i]) } }),
    ),
  });
});

router.post('/', validate(createDmSchema), async (req, res) => {
  const me = authed(req);
  const otherId: string = req.body.userId;
  if (otherId === me.userId) throw badRequest("You can't message yourself");

  const other = await User.findById(otherId).select('name').lean();
  if (!other) throw notFound('User not found');

  // Only people who share a workspace may DM each other (prevents cold spam to every account).
  const mine = await getUserWorkspaceIds(me.userId);
  if (!(await WorkspaceMember.exists({ userId: otherId, workspaceId: { $in: mine } }))) throw notFound('User not found');

  const key = dmKeyFor(me.userId, otherId);
  const existing = await Channel.findOne({ dmKey: key }).lean();
  if (existing) {
    return void res.json({ success: true, channel: toChannelDTO(existing, { dmUser: { id: otherId, name: other.name } }) });
  }

  const channel = await Channel.findOneAndUpdate(
    { dmKey: key },
    { $setOnInsert: { kind: 'dm', name: key, workspaceId: null, memberIds: [me.userId, otherId], createdBy: me.userId, dmKey: key } },
    { upsert: true, new: true },
  ).lean();

  void publishBroadcast({ kind: 'user', userId: otherId }, 'CHANNEL_UPDATED', { channelId: String(channel!._id), workspaceId: null, change: 'created' });
  void enqueueAudit('dm_created', me.userId, { withUserId: otherId });
  res.status(201).json({ success: true, channel: toChannelDTO(channel!, { dmUser: { id: otherId, name: other.name } }) });
});

export default router;
