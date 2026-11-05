import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { User, toUserDTO } from '@repo/database';
import {
  consumeToken,
  enqueueAudit,
  enqueueEmail,
  getRedis,
  invalidateSessionsBefore,
  newOpaqueToken,
  revokeAllRefreshTokens,
  storeToken,
} from '@repo/queue';
import { authed, requireAuth, signToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { forgotPasswordSchema, loginSchema, refreshSchema, registerSchema, resetPasswordSchema, verifyEmailSchema } from '../lib/schemas.js';
import { badRequest, conflict, notFound, unauthorized } from '../lib/errors.js';
import { config } from '../lib/env.js';
import { acceptPendingInvites } from '../lib/membership.js';

const router: Router = Router();

const REFRESH_TTL = config.REFRESH_TOKEN_DAYS * 24 * 3600;
const RESET_TTL = 60 * 60; // 1 hour
const VERIFY_TTL = 24 * 60 * 60; // 24 hours

// Brute-force protection on credential endpoints (disabled under test).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.NODE_ENV === 'test' ? 10_000 : config.AUTH_RATE_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, try again later' },
});

// Token refresh happens automatically (about hourly per client) and refresh tokens are 256-bit random, so they can't be
// guessed. It must NOT share the strict credential budget above, or a burst of login attempts from a shared IP would
// sign everyone on that network out when their access tokens expire. Generous flood protection only.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.NODE_ENV === 'test' ? 10_000 : 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, try again later' },
});

// A real hash so unknown-email logins cost the same as wrong-password ones (no timing oracle).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

/** Access token (short-lived JWT) + refresh token (opaque, rotated on use). */
async function issueSession(user: { _id: unknown; email: string; name: string }) {
  const id = String(user._id);
  const token = signToken({ userId: id, email: user.email, name: user.name });
  const refreshToken = newOpaqueToken();
  await storeToken('refresh', refreshToken, id, REFRESH_TTL);
  return { token, refreshToken };
}

async function sendVerification(user: { _id: unknown; email: string; name: string }): Promise<void> {
  const id = String(user._id);
  const token = newOpaqueToken();
  await storeToken('verify', token, id, VERIFY_TTL);
  await enqueueEmail('verify_email', {
    to: user.email,
    subject: 'Confirm your SyncGrid email',
    body: `Hi ${user.name},\n\nConfirm your email address to finish setting up your account:\n${config.APP_URL}/?verify=${token}\n\nThis link is valid for 24 hours. If you did not sign up, ignore this email.`,
    userId: id,
  });
}

router.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
  const { name, email, password } = req.body;
  if (await User.exists({ email })) throw conflict('Email already registered');

  const user = await User.create({ name, email, password: await bcrypt.hash(password, 10) });
  const id = String(user._id);

  void enqueueAudit('user_registered', id, { email });
  void sendVerification(user);
  void enqueueEmail('welcome_email', { to: email, subject: 'Welcome to SyncGrid', body: `Hi ${name}, your account has been created successfully.`, userId: id });

  res.status(201).json({ success: true, ...(await issueSession(user)), user: toUserDTO(user) });
});

router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  // Same message for unknown email and wrong password — don't leak which accounts exist.
  const ok = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Invalid email or password');

  void enqueueAudit('user_logged_in', String(user._id), { email });
  res.json({ success: true, ...(await issueSession(user)), user: toUserDTO(user) });
});

// Trade a refresh token for a new access token. The refresh token is single-use: it is rotated here.
router.post('/refresh', refreshLimiter, validate(refreshSchema), async (req, res) => {
  const userId = await consumeToken('refresh', req.body.refreshToken);
  if (!userId) throw unauthorized('Invalid or expired refresh token');
  const user = await User.findById(userId);
  if (!user) throw unauthorized('Invalid or expired refresh token');
  res.json({ success: true, ...(await issueSession(user)), user: toUserDTO(user) });
});

router.post('/logout', requireAuth, async (req, res) => {
  const user = authed(req);
  const token = req.headers.authorization!.slice(7);
  const exp = (jwt.decode(token) as { exp?: number } | null)?.exp;
  const ttl = exp ? exp - Math.floor(Date.now() / 1000) : 3600;
  if (ttl > 0) await getRedis().setex(`blacklist:${token}`, ttl, '1');
  const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';
  if (refreshToken) await consumeToken('refresh', refreshToken);
  void enqueueAudit('user_logged_out', user.userId, { email: user.email });
  res.json({ success: true, message: 'Logged out successfully' });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(authed(req).userId);
  if (!user) throw notFound('User not found');
  res.json({ success: true, user: toUserDTO(user) });
});

// ─── Password reset ──────────────────────────────────────────────────────────
// Always answers 200 so the endpoint can't be used to discover which emails have accounts.
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (user) {
    const token = newOpaqueToken();
    await storeToken('pwreset', token, String(user._id), RESET_TTL);
    await enqueueEmail('password_reset', {
      to: user.email,
      subject: 'Reset your SyncGrid password',
      body: `Hi ${user.name},\n\nSomeone asked to reset the password for this account. Choose a new one here:\n${config.APP_URL}/?reset=${token}\n\nThe link is valid for 1 hour and works once. If it was not you, ignore this email: your password is unchanged.`,
      userId: String(user._id),
    });
    void enqueueAudit('password_reset_requested', String(user._id), {});
  }
  res.json({ success: true, message: 'If that email has an account, a reset link is on its way.' });
});

router.post('/reset-password', authLimiter, validate(resetPasswordSchema), async (req, res) => {
  const userId = await consumeToken('pwreset', req.body.token);
  if (!userId) throw badRequest('This reset link is invalid or has expired');
  const user = await User.findById(userId);
  if (!user) throw badRequest('This reset link is invalid or has expired');

  user.password = await bcrypt.hash(req.body.password, 10);
  user.emailVerified = true; // they just proved control of the inbox
  await user.save();

  // Everything signed in before this moment is signed out.
  await Promise.all([revokeAllRefreshTokens(userId), invalidateSessionsBefore(userId)]);
  void enqueueAudit('password_reset_completed', userId, {});
  void acceptPendingInvites(userId);
  res.json({ success: true, message: 'Password updated. Please log in.' });
});

// ─── Email verification ──────────────────────────────────────────────────────
router.post('/verify-email', authLimiter, validate(verifyEmailSchema), async (req, res) => {
  const userId = await consumeToken('verify', req.body.token);
  if (!userId) throw badRequest('This verification link is invalid or has expired');
  const user = await User.findByIdAndUpdate(userId, { emailVerified: true }, { new: true });
  if (!user) throw badRequest('This verification link is invalid or has expired');

  const joined = await acceptPendingInvites(userId); // invitations sent to this address before sign-up
  void enqueueAudit('email_verified', userId, {});
  res.json({ success: true, user: toUserDTO(user), joinedWorkspaces: joined });
});

router.post('/resend-verification', requireAuth, authLimiter, async (req, res) => {
  const user = await User.findById(authed(req).userId);
  if (!user) throw notFound('User not found');
  if (user.emailVerified) throw badRequest('Your email is already verified');
  await sendVerification(user);
  res.json({ success: true, message: 'Verification email sent' });
});

export default router;
