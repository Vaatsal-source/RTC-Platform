import { clientMessageSchema, type ClientMessage } from '@repo/shared-types';
import type { Client } from '../types.js';
import { logger } from '../env.js';
import { frameCounter } from '../metrics.js';
import { handleJoinChannel, handleLeaveChannel, handleLoadMore } from './channels.js';
import { handleDeleteMessage, handleEditMessage, handleSendMessage, handleThreadReply } from './messages.js';
import { handleAddReaction, handleRemoveReaction } from './reactions.js';
import { handleMarkDelivered, handleMarkRead } from './receipts.js';
import { handleTypingStart, handleTypingStop } from './typing.js';
import { sendError } from './common.js';

// Token bucket per socket: ~20 frames/sec sustained, bursts up to 40.
const BUCKET_MAX = 40;
const REFILL_PER_SEC = 20;

function allow(ws: Client): boolean {
  const now = Date.now();
  ws.tokens = Math.min(BUCKET_MAX, ws.tokens + ((now - ws.tokensRefilledAt) / 1000) * REFILL_PER_SEC);
  ws.tokensRefilledAt = now;
  if (ws.tokens < 1) return false;
  ws.tokens -= 1;
  return true;
}

/** Parse → validate → rate-limit → dispatch. Nothing the client sends reaches a handler unvalidated. */
export async function handleRawMessage(ws: Client, raw: string): Promise<void> {
  if (!allow(ws)) return sendError(ws, 'Slow down', 'RATE_LIMITED');

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return sendError(ws, 'Invalid JSON');
  }

  const parsed = clientMessageSchema.safeParse(json);
  if (!parsed.success) {
    const type = (json as { type?: unknown } | null)?.type;
    return sendError(ws, typeof type === 'string' ? `Invalid payload for ${type}` : 'Invalid message format', 'INVALID_MESSAGE');
  }

  const msg: ClientMessage = parsed.data;
  frameCounter.inc({ type: msg.type });
  try {
    await dispatch(ws, msg);
  } catch (err) {
    logger.error('handler failed', { type: msg.type, user: ws.userId, err: (err as Error).message });
    sendError(ws, 'Something went wrong', 'INTERNAL');
  }
}

async function dispatch(ws: Client, msg: ClientMessage): Promise<void> {
  switch (msg.type) {
    case 'JOIN_CHANNEL': return handleJoinChannel(ws, msg.payload);
    case 'LEAVE_CHANNEL': return handleLeaveChannel(ws, msg.payload);
    case 'LOAD_MORE_MESSAGES': return handleLoadMore(ws, msg.payload);
    case 'SEND_MESSAGE': return handleSendMessage(ws, msg.payload);
    case 'SEND_THREAD_REPLY': return handleThreadReply(ws, msg.payload);
    case 'EDIT_MESSAGE': return handleEditMessage(ws, msg.payload);
    case 'DELETE_MESSAGE': return handleDeleteMessage(ws, msg.payload);
    case 'ADD_REACTION': return handleAddReaction(ws, msg.payload);
    case 'REMOVE_REACTION': return handleRemoveReaction(ws, msg.payload);
    case 'TYPING_START': return handleTypingStart(ws, msg.payload);
    case 'TYPING_STOP': return handleTypingStop(ws, msg.payload);
    case 'MARK_DELIVERED': return handleMarkDelivered(ws, msg.payload);
    case 'MARK_READ': return handleMarkRead(ws, msg.payload);
  }
}
