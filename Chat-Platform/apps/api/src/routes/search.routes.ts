import { Router } from 'express';
import { Channel, Message, User, WorkspaceMember, hydrateMessages, getUserWorkspaceIds, toChannelDTO, toUserDTO } from '@repo/database';
import type { SearchResultDTO } from '@repo/shared-types';
import { authed, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { searchQuerySchema, userSearchSchema } from '../lib/schemas.js';
import { requireMember } from '../lib/access.js';

const router: Router = Router();
router.use(requireAuth);

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Everything the caller may see: public channels in their workspaces + private/DM channels they belong to. */
async function accessibleChannels(userId: string, workspaceId?: string) {
  const workspaceIds = workspaceId ? [workspaceId] : await getUserWorkspaceIds(userId);
  return Channel.find({
    $or: [
      { kind: 'public' as const, workspaceId: { $in: workspaceIds } },
      { kind: 'private' as const, workspaceId: { $in: workspaceIds }, memberIds: userId },
      ...(workspaceId ? [] : [{ kind: 'dm' as const, memberIds: userId }]),
    ],
  }).lean();
}

// Module 11 — search messages, users and channels (MongoDB text indexes + prefix match for names).
router.get('/', validate(searchQuerySchema, 'query'), async (req, res) => {
  const me = authed(req).userId;
  const { q, workspaceId } = req.query as unknown as { q: string; workspaceId?: string };
  if (workspaceId) await requireMember(workspaceId, me);

  const channels = await accessibleChannels(me, workspaceId);
  const channelIds = channels.map((c) => c._id);
  const prefix = new RegExp(escapeRegex(q), 'i');

  const workspaceIds = workspaceId ? [workspaceId] : await getUserWorkspaceIds(me);
  const peerIds = await WorkspaceMember.find({ workspaceId: { $in: workspaceIds } }).distinct('userId');

  const [messageDocs, users] = await Promise.all([
    Message.find({ channelId: { $in: channelIds }, isDeleted: false, $text: { $search: q } }, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(25)
      .lean(),
    User.find({ _id: { $in: peerIds }, $or: [{ name: prefix }, { email: prefix }] })
      .limit(10)
      .lean(),
  ]);

  const result: SearchResultDTO = {
    messages: await hydrateMessages(messageDocs),
    users: users.map(toUserDTO),
    channels: channels.filter((c) => c.kind !== 'dm' && prefix.test(c.name)).slice(0, 10).map((c) => toChannelDTO(c)),
  };
  res.json({ success: true, ...result });
});

// People picker (DMs, invites): members of workspaces I'm in.
router.get('/users', validate(userSearchSchema, 'query'), async (req, res) => {
  const me = authed(req).userId;
  const { q, workspaceId } = req.query as unknown as { q: string; workspaceId?: string };
  if (workspaceId) await requireMember(workspaceId, me);

  const workspaceIds = workspaceId ? [workspaceId] : await getUserWorkspaceIds(me);
  const peerIds = (await WorkspaceMember.find({ workspaceId: { $in: workspaceIds } }).distinct('userId')).filter((id) => String(id) !== me);
  const filter = q ? { _id: { $in: peerIds }, $or: [{ name: new RegExp(escapeRegex(q), 'i') }, { email: new RegExp(escapeRegex(q), 'i') }] } : { _id: { $in: peerIds } };
  const users = await User.find(filter).sort({ name: 1 }).limit(20).lean();
  res.json({ success: true, users: users.map(toUserDTO) });
});

export default router;
