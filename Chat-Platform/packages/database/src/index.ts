import mongoose from 'mongoose';

// ─── MongoDB Connection ────────────────────────────────────────────────────────
// Single shared connection helper. Both the websocket app and the api app
// will import `connectDB()` from this package so they don't duplicate
// connection logic.

let isConnected = false;

export async function connectDB(uri?: string): Promise<void> {
  if (isConnected) {
    console.log('[DB] Already connected, skipping');
    return;
  }

  const connectionString = uri || process.env.MONGO_URI || 'mongodb://localhost:27017/synccgrid';

  try {
    await mongoose.connect(connectionString, {
      serverSelectionTimeoutMS: 5000, // fail fast instead of hanging indefinitely
    });
    isConnected = true;
    console.log('[DB] Connected to MongoDB');
  } catch (err) {
    console.error('[DB] Connection failed:', err);
    throw err;
  }

  const connection = mongoose.connection;
  connection.on('disconnected', () => {
    isConnected = false;
    console.log('[DB] Disconnected from MongoDB');
  });
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  isConnected = false;
}

// Re-export models so consuming apps only need one import path:
// import { connectDB, Message, Channel } from 'database';
export * from './models/message.js';
export * from './models/channel.js';
export * from './models/notification.js';
export * from './models/auditLog.js';