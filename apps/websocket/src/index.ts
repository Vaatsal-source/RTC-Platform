import { createServer, type IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { WS_BROADCAST_CHANNEL, type BroadcastEnvelope, type ChannelUpdatedPayload } from '@repo/shared-types';
import { connectDB, disconnectDB, WorkspaceMember } from '@repo/database';
import {
  INSTANCE_ID,
  addSocket,
  closeQueues,
  createEventSubscriber,
  createRedis,
  filterOnline,
  getRedis,
  publishEvent,
  refreshPresence,
  removeSocket,
} from '@repo/queue';
import { config, logger } from './env.js';
import { verifyToken, type AuthedUser } from './auth.js';
import type { Client } from './types.js';
import { allSockets, deliver, dropChannel, registerConnection, removeConnection, resolveLocalTargets, send, socketsOf, stats, subscribe, unsubscribe } from './registry.js';
import { handleRawMessage } from './handlers/index.js';
import { refreshScope } from './handlers/channels.js';
import { clearTypingFor } from './handlers/typing.js';
import { broadcastCounter, connectionsGauge, registry as metricsRegistry, rejectedCounter } from './metrics.js';

const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const allowedOrigins = config.CORS_ORIGIN.split(',').map((s) => s.trim());

// ─── HTTP (health + metrics) and the WS upgrade ──────────────────────────────
const server = createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'ok', instance: INSTANCE_ID, ...stats() }));
  } else if (req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': metricsRegistry.contentType }).end(await metricsRegistry.metrics());
  } else {
    res.writeHead(404).end();
  }
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });

/**
 * Connection lifecycle:  Connect → JWT verify → Register → Subscribe to channels → Ready
 * The JWT is checked during the HTTP upgrade, before a socket exists.
 */
server.on('upgrade', async (req: IncomingMessage, socket, head) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) {
    rejectedCounter.inc({ reason: 'origin' });
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return void socket.destroy();
  }

  let user: AuthedUser | null = null;
  try {
    user = await verifyToken(new URL(req.url ?? '/', 'http://localhost').searchParams.get('token'));
  } catch {
    user = null;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    if (!user) {
      // Accept-then-close with an app-specific code so the browser can tell "bad token" (4401) from a network drop.
      rejectedCounter.inc({ reason: 'auth' });
      ws.close(4401, 'Unauthorized');
      return;
    }
    void onConnection(ws as Client, user);
  });
});

async function onConnection(ws: Client, user: AuthedUser): Promise<void> {
  ws.socketId = randomUUID();
  ws.userId = user.userId;
  ws.username = user.username;
  ws.isAlive = true;
  ws.workspaceIds = new Set();
  ws.channels = new Set();
  ws.tokens = 40;
  ws.tokensRefilledAt = Date.now();

  // Messages can arrive while we're still loading scope; chain them behind `ready` to keep them ordered.
  let ready: Promise<void> = Promise.resolve();
  ws.on('message', (raw) => {
    const text = raw.toString();
    ready = ready.then(() => handleRawMessage(ws, text));
  });
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('error', (err) => logger.warn('socket error', { user: ws.username, err: err.message }));
  ws.on('close', () => void onClose(ws));

  ready = (async () => {
    try {
      await refreshScope(ws); // Subscribe to channels
      registerConnection(ws); // Register
      connectionsGauge.inc();

      const firstSocket = await addSocket(ws.userId, `${INSTANCE_ID}:${ws.socketId}`);
      if (firstSocket) announcePresence(ws, 'online');

      send(ws, 'CONNECTED', {
        userId: ws.userId,
        username: ws.username,
        message: 'Connected to SyncGrid',
        onlineUserIds: await onlinePeers(ws),
      });
      logger.info('connected', { user: ws.username, workspaces: ws.workspaceIds.size, channels: ws.channels.size });
    } catch (err) {
      logger.error('connection setup failed', { err: (err as Error).message });
      ws.close(1011, 'Setup failed');
    }
  })();
}

/** Users sharing a workspace with this socket's user who are currently online (anywhere). */
async function onlinePeers(ws: Client): Promise<string[]> {
  const ids = await WorkspaceMember.find({ workspaceId: { $in: [...ws.workspaceIds] } }).distinct('userId');
  return filterOnline([...new Set(ids.map(String))].filter((id) => id !== ws.userId));
}

async function onClose(ws: Client): Promise<void> {
  clearTypingFor(ws);
  const registered = [...socketsOf(ws.userId)].includes(ws);
  removeConnection(ws);
  if (!registered) return; // never finished setup
  connectionsGauge.dec();
  try {
    const wasLast = await removeSocket(ws.userId, `${INSTANCE_ID}:${ws.socketId}`);
    if (wasLast) announcePresence(ws, 'offline');
  } catch (err) {
    logger.error('presence cleanup failed', { err: (err as Error).message });
  }
}

/** Presence is an event on the bus; every WS instance turns it into PRESENCE_UPDATE frames for its own sockets. */
function announcePresence(ws: Client, status: 'online' | 'offline'): void {
  void publishEvent({ type: 'presence-updated', userId: ws.userId, username: ws.username, status, workspaceIds: [...ws.workspaceIds], ts: Date.now() });
}

// ─── Redis → local sockets ───────────────────────────────────────────────────
// This is the horizontal-scaling backplane: whichever instance a user is on,
// every broadcast reaches them because all instances listen on the same channels.
const broadcastSub = createRedis({ name: 'ws-broadcast', subscriber: true });
const events = createEventSubscriber('ws');

function setupRedis(): Promise<unknown> {
  broadcastSub.on('message', (_channel, raw) => {
    let env: BroadcastEnvelope;
    try {
      env = JSON.parse(raw);
    } catch {
      return;
    }
    const targets = deliver(env);
    broadcastCounter.inc(targets.length);
    if (env.frame.includes('"CHANNEL_UPDATED"')) void applyChannelUpdate(env);
  });

  events.on('presence-updated', (e) => {
    const targets = resolveLocalTargets({ origin: '', target: { kind: 'workspaces', workspaceIds: e.workspaceIds }, frame: '', excludeUserId: e.userId });
    for (const ws of targets) send(ws, 'PRESENCE_UPDATE', { userId: e.userId, username: e.username, status: e.status });
  });

  events.on('notification-created', (e) => {
    for (const ws of socketsOf(e.userId)) {
      send(ws, 'NOTIFICATION', {
        id: e.notificationId,
        kind: e.kind,
        message: e.message,
        channelId: e.channelId,
        workspaceId: e.workspaceId,
        senderId: e.senderId,
        senderName: e.senderName,
        read: false,
        createdAt: e.createdAt,
      });
    }
  });

  return Promise.all([broadcastSub.subscribe(WS_BROADCAST_CHANNEL), events.start()]);
}

/** Keep subscriptions in step with channel/membership changes announced by the API. */
async function applyChannelUpdate(env: BroadcastEnvelope): Promise<void> {
  const { payload } = JSON.parse(env.frame) as { payload: ChannelUpdatedPayload };
  const targets = resolveLocalTargets(env);
  const { target } = env;

  try {
    if (payload.change === 'members' && target.kind === 'user') {
      // Joined/left a workspace → recompute subscriptions, then resync who is online (the earlier snapshot is stale).
      await Promise.all(
        targets.map(async (ws) => {
          await refreshScope(ws);
          send(ws, 'PRESENCE_SNAPSHOT', { onlineUserIds: await onlinePeers(ws) });
        }),
      );
    } else if (payload.change === 'created' && payload.channelId) {
      if (target.kind === 'user') await Promise.all(targets.map(refreshScope)); // new private channel / DM
      else for (const ws of targets) subscribe(ws, payload.channelId); // new public channel in their workspace
    } else if (payload.change === 'deleted' && payload.channelId) {
      if (target.kind === 'user') for (const ws of targets) unsubscribe(ws, payload.channelId); // removed from a private channel
      else dropChannel(payload.channelId); // channel gone for everyone
    }
  } catch (err) {
    logger.error('failed to apply channel update', { err: (err as Error).message });
  }
}

// ─── Heartbeat: Ping → Pong → Alive ──────────────────────────────────────────
const heartbeat = setInterval(() => {
  const alive = new Set<string>();
  for (const ws of allSockets()) {
    if (!ws.isAlive) {
      logger.info('terminating dead connection', { user: ws.username });
      ws.terminate();
      continue;
    }
    alive.add(ws.userId);
    ws.isAlive = false;
    ws.ping();
  }
  // Presence keys carry a TTL; refreshing them proves *this instance* is still alive.
  void refreshPresence([...alive]).catch((err) => logger.warn('presence refresh failed', { err: err.message }));
}, HEARTBEAT_INTERVAL_MS);

// ─── Boot / shutdown ─────────────────────────────────────────────────────────
async function main() {
  await connectDB(config.MONGO_URI);
  await setupRedis();
  server.listen(config.WS_PORT, () => logger.info(`WebSocket server (instance ${INSTANCE_ID}) listening on :${config.WS_PORT}`));
}

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, closing`);
  clearInterval(heartbeat);
  server.close();
  for (const ws of allSockets()) ws.close(1001, 'Server restarting'); // clients auto-reconnect to another instance
  await new Promise((r) => setTimeout(r, 500)); // let close handlers clear presence
  await events.close();
  broadcastSub.disconnect();
  await closeQueues();
  await disconnectDB();
  getRedis().disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

main().catch((err) => {
  logger.error('Failed to start WebSocket server', { err: err?.stack ?? err });
  process.exit(1);
});
