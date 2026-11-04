import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { User, toUserDTO } from '@repo/database';
import { enqueueAudit, enqueueEmail, getRedis } from '@repo/queue';
import { authed, requireAuth, signToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, registerSchema } from '../lib/schemas.js';
import { conflict, notFound, unauthorized } from '../lib/errors.js';
import { config } from '../lib/env.js';

const router: Router = Router();

// Brute-force protection on credential endpoints (disabled under test).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.NODE_ENV === 'test' ? 10_000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, try again later' },
});

// A real hash so unknown-email logins cost the same as wrong-password ones (no timing oracle).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

router.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
  const { name, email, password } = req.body;
  if (await User.exists({ email })) throw conflict('Email already registered');

  const user = await User.create({ name, email, password: await bcrypt.hash(password, 10) });
  const id = String(user._id);
  const token = signToken({ userId: id, email: user.email, name: user.name });

  void enqueueAudit('user_registered', id, { email });
  void enqueueEmail('welcome_email', {
    to: email,
    subject: 'Welcome to SyncGrid',
    body: `Hi ${name}, your account has been created successfully.`,
    userId: id,
  });

  res.status(201).json({ success: true, token, user: toUserDTO(user) });
});

router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  // Same message for unknown email and wrong password — don't leak which accounts exist.
  const ok = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Invalid email or password');

  const id = String(user._id);
  const token = signToken({ userId: id, email: user.email, name: user.name });
  void enqueueAudit('user_logged_in', id, { email });
  res.json({ success: true, token, user: toUserDTO(user) });
});

router.post('/logout', requireAuth, async (req, res) => {
  const user = authed(req);
  const token = req.headers.authorization!.slice(7);
  const exp = (jwt.decode(token) as { exp?: number } | null)?.exp;
  const ttl = exp ? exp - Math.floor(Date.now() / 1000) : 7 * 24 * 3600;
  if (ttl > 0) await getRedis().setex(`blacklist:${token}`, ttl, '1');
  void enqueueAudit('user_logged_out', user.userId, { email: user.email });
  res.json({ success: true, message: 'Logged out successfully' });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(authed(req).userId);
  if (!user) throw notFound('User not found');
  res.json({ success: true, user: toUserDTO(user) });
});

export default router;
