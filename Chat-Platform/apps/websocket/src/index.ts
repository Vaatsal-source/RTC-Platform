import { WebSocketServer } from 'ws';
import { connectDB } from 'database';
import type { AuthenticatedWebSocket } from './types.js';
import type { WSMessage } from './types.js';
import { subscriber } from './redis.js';
import {
  registerConnection,
  removeConnection,
  broadcastToAll,
  getAllConnections,
  getChannelSubscribers,
} from './registry.js';
import {
  handleJoinChannel,
  handleLeaveChannel,
  handleSendMessage,
  handleTypingStart,
  handleTypingStop,
  handleEditMessage,
  handleDeleteMessage,
  handleAddReaction,
  handleRemoveReaction,
  handleSendThreadReply,
  handleMarkDelivered,
  handleMarkRead,
  handleJoinDM,
  handleSendDM,
  handleLoadMoreMessages,
} from './handlers.js';

const PORT = Number(process.env.WS_PORT) || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

function verifyToken(token: string): { userId: string; username: string } | null {
  if (token === 'mock_jwt_token_payload') {
    return { userId: 'mock_user_001', username: 'Vaatsalya' };
  }
  if (token.startsWith('test_')) {
    const username = token.slice(5) || 'Anonymous';
    return { userId: `test_${username.toLowerCase()}`, username };
  }
  return null;
}

let wss: WebSocketServer;

async function startServer() {
  try {
    await connectDB(process.env.MONGO_URI);
  } catch (err) {
    console.error('[WS Server] Failed to connect to MongoDB. Exiting.');
    process.exit(1);
  }

  wss = new WebSocketServer({ port: PORT });
  console.log(`[WS Server] Listening on ws://localhost:${PORT}`);

  setupRedisSubscriber();
  attachConnectionHandler();
  startHeartbeat();
}

function setupRedisSubscriber() {
  subscriber.subscribe('ws:broadcast', (err) => {
    if (err) {
      console.error('[Redis] Failed to subscribe:', err);
      return;
    }
    console.log('[Redis] Subscribed to ws:broadcast channel');
  });

  subscriber.on('message', (_channel, data) => {
    const envelope = JSON.parse(data);
    const { target, message, excludeUserId, channelId } = envelope;
    const connections = getAllConnections();
    const channelSubscribers = getChannelSubscribers();

    if (target === 'channel') {
      const subscribers = channelSubscribers.get(channelId);
      if (!subscribers) return;
      for (const client of subscribers) {
        if (client.userId === excludeUserId) continue;
        if (client.readyState === 1) {
          client.send(message);
        }
      }
    } else if (target === 'all') {
      for (const [, client] of connections) {
        if (client.userId === excludeUserId) continue;
        if (client.readyState === 1) {
          client.send(message);
        }
      }
    }
  });
}

function attachConnectionHandler() {
  wss.on('connection', (rawWs, request) => {
    const url = new URL(request.url || '', `ws://localhost:${PORT}`);
    const token = url.searchParams.get('token');

    if (!token) {
      rawWs.send(JSON.stringify({ type: 'ERROR', payload: { message: 'No token provided' } }));
      rawWs.close(1008, 'Unauthorized');
      return;
    }

    const user = verifyToken(token);

    if (!user) {
      rawWs.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Invalid token' } }));
      rawWs.close(1008, 'Unauthorized');
      return;
    }

    const ws = rawWs as AuthenticatedWebSocket;
    ws.userId = user.userId;
    ws.username = user.username;
    ws.isAlive = true;

    registerConnection(ws);

    broadcastToAll(
      JSON.stringify({
        type: 'PRESENCE_UPDATE',
        payload: { userId: ws.userId, username: ws.username, status: 'online' },
      }),
      ws
    );

    ws.send(JSON.stringify({
      type: 'CONNECTED',
      payload: { message: 'Connected to SyncGrid WS', userId: ws.userId, username: ws.username },
    }));

    ws.on('message', (raw) => {
      let parsed: WSMessage;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Invalid JSON' } }));
        return;
      }

      const { type, payload } = parsed;
      console.log(`[WS] <- ${ws.username}: ${type}`);

      switch (type) {
        case 'JOIN_CHANNEL': handleJoinChannel(ws, payload as any); break;
        case 'LEAVE_CHANNEL': handleLeaveChannel(ws, payload as any); break;
        case 'SEND_MESSAGE': handleSendMessage(ws, payload as any); break;
        case 'TYPING_START': handleTypingStart(ws, payload as any); break;
        case 'TYPING_STOP': handleTypingStop(ws, payload as any); break;
        case 'EDIT_MESSAGE': handleEditMessage(ws, payload as any); break;
        case 'DELETE_MESSAGE': handleDeleteMessage(ws, payload as any); break;
        case 'ADD_REACTION': handleAddReaction(ws, payload as any); break;
        case 'REMOVE_REACTION': handleRemoveReaction(ws, payload as any); break;
        case 'SEND_THREAD_REPLY': handleSendThreadReply(ws, payload as any); break;
        case 'MARK_DELIVERED': handleMarkDelivered(ws, payload as any); break;
        case 'MARK_READ': handleMarkRead(ws, payload as any); break;
        case 'JOIN_DM': handleJoinDM(ws, payload as any); break;
        case 'SEND_DM': handleSendDM(ws, payload as any); break;
        case 'LOAD_MORE_MESSAGES': handleLoadMoreMessages(ws, payload as any); break;
        default:
          ws.send(JSON.stringify({
            type: 'ERROR',
            payload: { message: `Unknown message type: ${type}` },
          }));
      }
    });

    ws.on('close', () => {
      removeConnection(ws);
      broadcastToAll(
        JSON.stringify({
          type: 'PRESENCE_UPDATE',
          payload: { userId: ws.userId, username: ws.username, status: 'offline' },
        })
      );
    });

    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('error', (err) => { console.error(`[WS Error] ${ws.username}:`, err.message); });
  });
}

const HEARTBEAT_INTERVAL = 30_000;
let heartbeat: ReturnType<typeof setInterval>;

function startHeartbeat() {
  heartbeat = setInterval(() => {
    const connections = getAllConnections();
    connections.forEach((ws) => {
      if (!ws.isAlive) {
        console.log(`[Heartbeat] Terminating dead connection: ${ws.username}`);
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL);

  wss.on('close', () => {
    clearInterval(heartbeat);
    console.log('[WS Server] Shutting down');
  });
}

process.on('SIGINT', () => {
  console.log('[WS Server] Received SIGINT, closing...');
  wss.close();
  process.exit(0);
});

startServer();
