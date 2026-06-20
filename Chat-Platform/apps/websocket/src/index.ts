import { WebSocketServer } from 'ws';
import { connectDB } from 'database';
import type { AuthenticatedWebSocket } from './types.js';
import type { WSMessage } from './types.js';
import {
  registerConnection,
  removeConnection,
  broadcastToAll,
  getAllConnections,
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

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT = Number(process.env.WS_PORT) || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

// ─── Auth helper ──────────────────────────────────────────────────────────────
// Since the frontend still uses a mock token ('mock_jwt_token_payload'),
// we handle multiple cases:
//   - Real JWT          → decode it properly
//   - Default mock token → fixed fake user (Vaatsalya), for the normal login flow
//   - Test token         → format 'test_<username>', lets you simulate DIFFERENT
//                          users from different browser tabs for local testing
//                          (e.g. localStorage.setItem('token', 'test_Alice'))
//
// When your backend team ships real JWT auth in Sprint 2,
// replace the mock block with: jwt.verify(token, JWT_SECRET)
function verifyToken(token: string): { userId: string; username: string } | null {
  // DEV SHORTCUT: accept the mock token the frontend currently uses
  if (token === 'mock_jwt_token_payload') {
    return { userId: 'mock_user_001', username: 'Vaatsalya' };
  }

  // DEV SHORTCUT for multi-user testing: any token starting with 'test_'
  // creates a distinct fake user, e.g. 'test_Alice' -> userId 'test_alice', username 'Alice'
  if (token.startsWith('test_')) {
    const username = token.slice(5) || 'Anonymous';
    return { userId: `test_${username.toLowerCase()}`, username };
  }

  // REAL JWT path (uncomment when Sprint 2 auth lands):
  // try {
  //   const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; username: string };
  //   return { userId: decoded.sub, username: decoded.username };
  // } catch {
  //   return null;
  // }

  return null;
}

// ─── WebSocket Server ─────────────────────────────────────────────────────────
// We connect to MongoDB FIRST, then start accepting WS connections. This way
// if the DB is down, we fail loudly at startup instead of silently dropping
// messages later when handlers try to persist them.
let wss: WebSocketServer;

async function startServer() {
  try {
    await connectDB(process.env.MONGO_URI);
  } catch (err) {
    console.error('[WS Server] Failed to connect to MongoDB. Exiting.');
    console.error('Make sure MongoDB is running locally, or set MONGO_URI in your environment.');
    process.exit(1);
  }

  wss = new WebSocketServer({ port: PORT });
  console.log(`[WS Server] Listening on ws://localhost:${PORT}`);
  attachConnectionHandler();
  startHeartbeat();
}

function attachConnectionHandler() {
wss.on('connection', (rawWs, request) => {
  // ── Step 1: Extract the JWT from the query string ─────────────────────────
  // Frontend connects as: ws://localhost:8080?token=<jwt>
  const url = new URL(request.url || '', `ws://localhost:${PORT}`);
  const token = url.searchParams.get('token');

  if (!token) {
    rawWs.send(JSON.stringify({ type: 'ERROR', payload: { message: 'No token provided' } }));
    rawWs.close(1008, 'Unauthorized');
    return;
  }

  // ── Step 2: Verify the token ──────────────────────────────────────────────
  const user = verifyToken(token);

  if (!user) {
    rawWs.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Invalid token' } }));
    rawWs.close(1008, 'Unauthorized');
    return;
  }

  // ── Step 3: Attach our metadata to the raw WS object ─────────────────────
  // We cast it to our AuthenticatedWebSocket type which has userId, username, isAlive
  const ws = rawWs as AuthenticatedWebSocket;
  ws.userId = user.userId;
  ws.username = user.username;
  ws.isAlive = true;

  // ── Step 4: Register in memory + announce presence ────────────────────────
  registerConnection(ws);

  // Tell everyone this user came online
  broadcastToAll(
    JSON.stringify({
      type: 'PRESENCE_UPDATE',
      payload: { userId: ws.userId, username: ws.username, status: 'online' },
    }),
    ws // exclude the connecting user themselves
  );

  // Confirm successful connection back to the client
  ws.send(JSON.stringify({
    type: 'CONNECTED',
    payload: { message: 'Connected to SyncGrid WS', userId: ws.userId, username: ws.username },
  }));

  // ── Step 5: Handle incoming messages ──────────────────────────────────────
  // Every message from the client is a JSON string shaped as: { type, payload }
  // We parse it and route to the correct handler.
  ws.on('message', (raw) => {
    let parsed: WSMessage;

    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Invalid JSON' } }));
      return;
    }

    const { type, payload } = parsed;

    console.log(`[WS] ← ${ws.username}: ${type}`);

    // Route to the correct handler
    switch (type) {
      case 'JOIN_CHANNEL':
        handleJoinChannel(ws, payload as any);
        break;

      case 'LEAVE_CHANNEL':
        handleLeaveChannel(ws, payload as any);
        break;

      case 'SEND_MESSAGE':
        handleSendMessage(ws, payload as any);
        break;

      case 'TYPING_START':
        handleTypingStart(ws, payload as any);
        break;

      case 'TYPING_STOP':
        handleTypingStop(ws, payload as any);
        break;

      case 'EDIT_MESSAGE':
        handleEditMessage(ws, payload as any);
        break;

      case 'DELETE_MESSAGE':
        handleDeleteMessage(ws, payload as any);
        break;

      case 'ADD_REACTION':
        handleAddReaction(ws, payload as any);
        break;

      case 'REMOVE_REACTION':
        handleRemoveReaction(ws, payload as any);
        break;

      case 'SEND_THREAD_REPLY':
        handleSendThreadReply(ws, payload as any);
        break;

      case 'MARK_DELIVERED':
        handleMarkDelivered(ws, payload as any);
        break;

      case 'MARK_READ':
        handleMarkRead(ws, payload as any);
        break;

      case 'JOIN_DM':
        handleJoinDM(ws, payload as any);
        break;

      case 'SEND_DM':
        handleSendDM(ws, payload as any);
        break;

      case 'LOAD_MORE_MESSAGES':
        handleLoadMoreMessages(ws, payload as any);
        break;

      default:
        ws.send(JSON.stringify({
          type: 'ERROR',
          payload: { message: `Unknown message type: ${type}` },
        }));
    }
  });

  // ── Step 6: Handle disconnect ─────────────────────────────────────────────
  ws.on('close', () => {
    removeConnection(ws);

    // Announce offline to everyone
    broadcastToAll(
      JSON.stringify({
        type: 'PRESENCE_UPDATE',
        payload: { userId: ws.userId, username: ws.username, status: 'offline' },
      })
    );
  });

  // ── Step 7: Handle pong responses for heartbeat ───────────────────────────
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  // Handle WS-level errors without crashing the server
  ws.on('error', (err) => {
    console.error(`[WS Error] ${ws.username}:`, err.message);
  });
});
} // end attachConnectionHandler

// ─── Heartbeat System ─────────────────────────────────────────────────────────
// Problem: WebSocket connections can "silently die" — the TCP connection drops
// but neither side knows. This happens on mobile (screen off), flaky networks, etc.
//
// Solution: every 30 seconds, ping every client.
//   - If they respond (pong) → they're alive, mark isAlive = true
//   - If they don't respond before the next ping → kill the connection
//
// This is pure ws library — no Socket.IO needed.
const HEARTBEAT_INTERVAL = 30_000; // 30 seconds
let heartbeat: ReturnType<typeof setInterval>;

function startHeartbeat() {
  heartbeat = setInterval(() => {
    const connections = getAllConnections();

    connections.forEach((ws) => {
      if (!ws.isAlive) {
        // Didn't respond to last ping → they're dead, terminate
        console.log(`[Heartbeat] Terminating dead connection: ${ws.username}`);
        ws.terminate();
        return;
      }

      // Mark as not alive — they need to pong back to flip it to true
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL);

  // Clean up the interval when the server shuts down
  wss.on('close', () => {
    clearInterval(heartbeat);
    console.log('[WS Server] Shutting down');
  });
}

// Graceful shutdown on CTRL+C
process.on('SIGINT', () => {
  console.log('[WS Server] Received SIGINT, closing...');
  wss.close();
  process.exit(0);
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
startServer();