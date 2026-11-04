import mongoose from 'mongoose';

// ─── MongoDB connection ───────────────────────────────────────────────────────
// Single shared helper used by the api, websocket and worker apps.

let connecting: Promise<void> | null = null;

export async function connectDB(uri: string = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/syncgrid'): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  if (!connecting) {
    connecting = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 5000 })
      .then(() => undefined)
      .finally(() => {
        connecting = null;
      });
  }
  await connecting;
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}

export { mongoose };
export { Types } from 'mongoose';

export * from './models/user.js';
export * from './models/workspace.js';
export * from './models/channel.js';
export * from './models/message.js';
export * from './models/notification.js';
export * from './models/audit-log.js';
export * from './models/file.js';
export * from './models/activity.js';
export * from './serializers.js';
export * from './services/messages.js';
export * from './services/access.js';
