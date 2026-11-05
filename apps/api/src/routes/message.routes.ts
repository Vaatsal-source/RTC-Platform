import { Router } from 'express';
import { Message, fetchReplies, isValidId } from '@repo/database';
import { authed, requireAuth } from '../middleware/auth.js';
import { requireChannelAccess } from '../lib/access.js';
import { notFound } from '../lib/errors.js';
import { param } from '../lib/params.js';

// Writes (send / edit / delete / react) go over WebSocket — Module 4.
// REST only serves reads that don't need to be pushed.

const router: Router = Router();
router.use(requireAuth);

// Thread replies for a parent message
router.get('/:id/replies', async (req, res) => {
  if (!isValidId(param(req, 'id'))) throw notFound('Message not found');
  const parent = await Message.findById(param(req, 'id')).select('channelId').lean();
  if (!parent) throw notFound('Message not found');
  await requireChannelAccess(String(parent.channelId), authed(req).userId);
  res.json({ success: true, replies: await fetchReplies(param(req, 'id')) });
});

export default router;
