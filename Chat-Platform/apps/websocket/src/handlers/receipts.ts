import { Message, Types } from '@repo/database';
import type { ClientMessage } from '@repo/shared-types';
import type { Client } from '../types.js';
import { broadcastToChannel } from '../registry.js';
import { requireChannel, sendError } from './common.js';

// Module 7 — Sent → Delivered → Read
//   Sent      : the message was persisted and broadcast (implicit — no event).
//   Delivered : the recipient's client got NEW_MESSAGE      → MARK_DELIVERED
//   Read      : the message was actually on screen          → MARK_READ
// State lives on the message (deliveredTo / readBy) so it survives reloads.

type Payload<T extends ClientMessage['type']> = Extract<ClientMessage, { type: T }>['payload'];

async function mark(ws: Client, messageId: string, channelId: string, status: 'delivered' | 'read'): Promise<void> {
  const ctx = await requireChannel(ws, channelId);
  if (!ctx) return;
  if (!Types.ObjectId.isValid(messageId)) return sendError(ws, 'Message not found', 'NOT_FOUND');

  // Authors don't send receipts for their own messages.
  const filter = { _id: messageId, channelId, authorId: { $ne: ws.userId }, isDeleted: false };
  const update = status === 'read' ? { $addToSet: { readBy: ws.userId, deliveredTo: ws.userId } } : { $addToSet: { deliveredTo: ws.userId } };
  const res = await Message.updateOne(filter, update, { timestamps: false }); // else updatedAt makes every call look like a change
  if (res.modifiedCount === 0) return; // already recorded, or not ours to mark

  await broadcastToChannel(channelId, 'RECEIPT_UPDATE', { messageId, channelId, userId: ws.userId, status });
}

export const handleMarkDelivered = (ws: Client, p: Payload<'MARK_DELIVERED'>) => mark(ws, p.messageId, p.channelId, 'delivered');
export const handleMarkRead = (ws: Client, p: Payload<'MARK_READ'>) => mark(ws, p.messageId, p.channelId, 'read');
