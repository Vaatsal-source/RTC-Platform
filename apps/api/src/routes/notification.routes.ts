import { Router } from 'express';
import { Notification, toNotificationDTO } from '@repo/database';
import { authed, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { markReadSchema, notificationsQuerySchema } from '../lib/schemas.js';

// Module 9 — notifications are *created* by the worker (from queue jobs);
// the API only reads them and flips the read flag.

const router: Router = Router();
router.use(requireAuth);

router.get('/', validate(notificationsQuerySchema, 'query'), async (req, res) => {
  const userId = authed(req).userId;
  const { unread, limit } = req.query as unknown as { unread?: string; limit: number };
  const [items, unreadCount] = await Promise.all([
    Notification.find({ userId, ...(unread ? { read: false } : {}) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    Notification.countDocuments({ userId, read: false }),
  ]);
  res.json({ success: true, notifications: items.map(toNotificationDTO), unreadCount });
});

router.post('/read', validate(markReadSchema), async (req, res) => {
  const userId = authed(req).userId;
  const ids: string[] | undefined = req.body.ids;
  await Notification.updateMany({ userId, read: false, ...(ids?.length ? { _id: { $in: ids } } : {}) }, { read: true });
  res.json({ success: true, unreadCount: await Notification.countDocuments({ userId, read: false }) });
});

export default router;
