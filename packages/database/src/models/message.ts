import { Schema, model, type Types } from 'mongoose';

// Channel messages, thread replies and DMs all live in this collection.
// DMs are just messages in a Channel of kind 'dm'.

export interface IReaction {
  emoji: string;
  userIds: string[];
}

export interface IMessage {
  _id: Types.ObjectId;
  channelId: Types.ObjectId;
  authorId: Types.ObjectId;
  authorName: string; // denormalised for fast rendering without a join
  content: string;
  parentMessageId: Types.ObjectId | null; // set when this is a thread reply
  attachmentIds: Types.ObjectId[];
  mentionedUserIds: Types.ObjectId[];
  reactions: IReaction[];
  deliveredTo: string[]; // Module 7: Sent → Delivered → Read
  readBy: string[];
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ReactionSchema = new Schema<IReaction>(
  {
    emoji: { type: String, required: true },
    userIds: { type: [String], default: [] },
  },
  { _id: false },
);

const MessageSchema = new Schema<IMessage>(
  {
    channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    authorName: { type: String, required: true },
    content: { type: String, default: '' },
    parentMessageId: { type: Schema.Types.ObjectId, ref: 'Message', default: null, index: true },
    attachmentIds: { type: [Schema.Types.ObjectId], ref: 'File', default: [] },
    mentionedUserIds: { type: [Schema.Types.ObjectId], default: [] },
    reactions: { type: [ReactionSchema], default: [] },
    deliveredTo: { type: [String], default: [] },
    readBy: { type: [String], default: [] },
    isEdited: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// History / infinite scroll: newest-first by channel is the hottest query.
MessageSchema.index({ channelId: 1, parentMessageId: 1, _id: -1 });
// Module 11 — message search
MessageSchema.index({ content: 'text' });

export const Message = model<IMessage>('Message', MessageSchema);
