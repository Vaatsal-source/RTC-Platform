import { connectDB, disconnectDB } from '@repo/database';
import { closeQueues, getRedis, setQueueErrorLogger } from '@repo/queue';
import { createApp } from './app.js';
import { config, logger } from './lib/env.js';

async function main() {
  setQueueErrorLogger((msg, err) => logger.error(msg, { err: (err as Error)?.message }));
  await connectDB(config.MONGO_URI);
  logger.info('MongoDB connected');

  const server = createApp().listen(config.API_PORT, () => logger.info(`API listening on :${config.API_PORT}`));

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close();
    await closeQueues();
    await disconnectDB();
    getRedis().disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Failed to start API', { err: err?.stack ?? err });
  process.exit(1);
});
