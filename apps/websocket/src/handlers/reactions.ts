import { Message, Types } from '@repo/database';
import type { ClientMessage } from '@repo/shared-types';
import type { Client } from '../types.js';
import { broadcastToChannel } from '../registry.js';
import { requireChannel, sendError } from './common.js';

type Payload<T extends ClientMessage['type']> = Extract<ClientMessage, { type: T }>['payload'];

// NOTE: `timestamps: false` matters — otherwise Mongoose bumps updatedAt on every update and
// `modifiedCount` is 1 even when $addToSet/$pull changed nothing, defeating the no-op detection below.
const MAX_DISTINCT_EMOJI = 30;

export async function handleAddReaction(ws: Client, { messageId, channelId, emoji }: Payload<'ADD_REACTION'>): Promise<void> {
  const ctx = await requireChannel(ws, channelId, { writable: true });
  if (!ctx) return;
  if (!Types.ObjectId.isValid(messageId)) return sendError(ws, 'Message not found', 'NOT_FOUND');
  const base = { _id: messageId, channelId, isDeleted: false };

  // 1) emoji already present → add the user to its set (idempotent).
  let changed = (await Message.updateOne({ ...base, 'reactions.emoji': emoji }, { $addToSet: { 'reactions.$.userIds': ws.userId } }, { timestamps: false })).modifiedCount > 0;

  // 2) first use of this emoji on the message → push a new entry (guarded so concurrent first-reactions don't duplicate).
  if (!changed) {
    const exists = await Message.exists({ ...base, 'reactions.emoji': emoji });
    if (!exists) {
      changed = (await Message.updateOne({ ...base, 'reactions.emoji': { $ne: emoji }, [`reactions.${MAX_DISTINCT_EMOJI}`]: { $exists: false } }, { $push: { reactions: { emoji, userIds: [ws.userId] } } }, { timestamps: false })).modifiedCount > 0;
    }
  }
  if (!changed) return; // duplicate or message gone — nothing to tell anyone

  await broadcastToChannel(channelId, 'REACTION_UPDATE', { messageId, channelId, emoji, userId: ws.userId, action: 'add' });
}

export async function handleRemoveReaction(ws: Client, { messageId, channelId, emoji }: Payload<'REMOVE_REACTION'>): Promise<void> {
  const ctx = await requireChannel(ws, channelId, { writable: true });
  if (!ctx) return;
  if (!Types.ObjectId.isValid(messageId)) return sendError(ws, 'Message not found', 'NOT_FOUND');

  const res = await Message.updateOne({ _id: messageId, channelId, 'reactions.emoji': emoji }, { $pull: { 'reactions.$.userIds': ws.userId } }, { timestamps: false });
  if (res.modifiedCount === 0) return;
  await Message.updateOne({ _id: messageId }, { $pull: { reactions: { userIds: { $size: 0 } } } }, { timestamps: false }); // drop emptied reactions

  await broadcastToChannel(channelId, 'REACTION_UPDATE', { messageId, channelId, emoji, userId: ws.userId, action: 'remove' });
}
