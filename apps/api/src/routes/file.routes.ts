import { Router } from 'express';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { StoredFile, isValidId, toFileDTO } from '@repo/database';
import { enqueueAudit, publishEvent } from '@repo/queue';
import { authed, requireAuth } from '../middleware/auth.js';
import { requireChannelAccess } from '../lib/access.js';
import { badRequest, notFound } from '../lib/errors.js';
import { config } from '../lib/env.js';
import { storage, uploadDir } from '../lib/storage.js';
import { param } from '../lib/params.js';

// Module 10 — file sharing: upload, image preview, download.

const router: Router = Router();
router.use(requireAuth);

mkdirSync(uploadDir(), { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      mkdirSync(uploadDir(), { recursive: true }); // survives the directory being removed/mounted late
      cb(null, uploadDir());
    },
    // Random on-disk names: the client-supplied name never touches the filesystem path.
    filename: (_req, _file, cb) => cb(null, randomBytes(16).toString('hex')),
  }),
  limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
});

// Only these may be rendered inline by the browser. Everything else (html, svg, js…) is
// forced to download so an uploaded file can never execute in our origin.
const INLINE_SAFE = /^image\/(png|jpe?g|gif|webp|avif)$/i;

router.post('/', upload.single('file'), async (req, res) => {
  const user = authed(req);
  const file = req.file;
  if (!file) throw badRequest('No file uploaded (field name: file)');

  const discard = async () => {
    await unlink(file.path).catch(() => undefined);
    await storage.remove(file.filename);
  };
  try {
    const channelId = String(req.body.channelId ?? '');
    if (!isValidId(channelId)) throw badRequest('channelId required');
    const channel = await requireChannelAccess(channelId, user.userId);
    if (channel.isArchived) throw badRequest('This channel is archived');

    const originalName = path.basename(file.originalname).slice(0, 200) || 'file';
    const mimeType = file.mimetype || 'application/octet-stream';
    await storage.put(file.path, file.filename, mimeType, file.size); // local disk: no-op · S3: upload + delete temp
    const stored = await StoredFile.create({
      uploaderId: user.userId,
      channelId,
      workspaceId: channel.workspaceId,
      name: originalName,
      storageName: file.filename,
      mimeType,
      size: file.size,
    });

    void publishEvent({
      type: 'file-uploaded',
      fileId: String(stored._id),
      fileName: originalName,
      channelId,
      workspaceId: channel.workspaceId ? String(channel.workspaceId) : null,
      uploaderId: user.userId,
      uploaderName: user.name,
      ts: Date.now(),
    });
    void enqueueAudit('file_uploaded', user.userId, { fileId: String(stored._id), channelId, workspaceId: channel.workspaceId ? String(channel.workspaceId) : undefined, size: file.size });

    res.status(201).json({ success: true, file: toFileDTO(stored.toObject()) });
  } catch (err) {
    await discard();
    throw err;
  }
});

router.get('/:id', async (req, res) => {
  if (!isValidId(param(req, 'id'))) throw notFound('File not found');
  const file = await StoredFile.findById(param(req, 'id')).lean();
  if (!file) throw notFound('File not found');
  await requireChannelAccess(String(file.channelId), authed(req).userId);

  const inline = INLINE_SAFE.test(file.mimeType) && req.query.download !== '1';
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', inline ? file.mimeType : 'application/octet-stream');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  try {
    const body = await storage.open(file.storageName);
    res.setHeader('Content-Length', String(file.size));
    await pipeline(body, res);
  } catch {
    if (!res.headersSent) res.status(404).json({ success: false, message: 'File not found' });
    else res.destroy();
  }
});

export default router;
