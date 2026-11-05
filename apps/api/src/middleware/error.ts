import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/env.js';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ success: false, message: 'Route not found' });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, message: err.message, errors: err.details });
    return;
  }
  const e = err as { code?: number | string; name?: string; message?: string; type?: string; status?: number };
  if (e?.code === 11000) {
    res.status(409).json({ success: false, message: 'Already exists' });
    return;
  }
  if (e?.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, message: 'Invalid JSON body' });
    return;
  }
  if (e?.name === 'MulterError') {
    res.status(400).json({ success: false, message: e.code === 'LIMIT_FILE_SIZE' ? 'File too large' : (e.message ?? 'Upload failed') });
    return;
  }
  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, { err: (err as Error)?.stack ?? err });
  res.status(500).json({ success: false, message: 'Internal server error' });
}
