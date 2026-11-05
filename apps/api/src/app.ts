import express, { Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { mongoose } from '@repo/database';
import { getRedis } from '@repo/queue';
import { config } from './lib/env.js';
import { metricsMiddleware, registry } from './lib/metrics.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.routes.js';
import workspaceRoutes from './routes/workspace.routes.js';
import channelRoutes from './routes/channel.routes.js';
import messageRoutes from './routes/message.routes.js';
import dmRoutes from './routes/dm.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import fileRoutes from './routes/file.routes.js';
import searchRoutes from './routes/search.routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Behind a reverse proxy, req.ip is the proxy unless we trust its X-Forwarded-For (needed for per-IP rate limits).
  if (config.TRUST_PROXY > 0) app.set('trust proxy', config.TRUST_PROXY);
  // Files are fetched cross-origin by the web app, so allow that resource policy.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(metricsMiddleware);

  const api = Router();
  api.use('/auth', authRoutes);
  api.use('/workspaces', workspaceRoutes);
  api.use('/channels', channelRoutes);
  api.use('/messages', messageRoutes);
  api.use('/dms', dmRoutes);
  api.use('/notifications', notificationRoutes);
  api.use('/files', fileRoutes);
  api.use('/search', searchRoutes);

  // Everything lives under /api; /auth is also exposed bare to match the original spec (POST /auth/login …).
  app.use('/api', api);
  app.use('/auth', authRoutes);

  app.get('/', (_req, res) => void res.send('SyncGrid API running'));

  app.get('/health', async (_req, res) => {
    const mongo = mongoose.connection.readyState === 1;
    let redis = false;
    try {
      redis = (await getRedis().ping()) === 'PONG';
    } catch {
      /* reported below */
    }
    res.status(mongo && redis ? 200 : 503).json({ status: mongo && redis ? 'ok' : 'degraded', mongo, redis });
  });

  app.get('/metrics', async (_req, res) => {
    res.setHeader('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
