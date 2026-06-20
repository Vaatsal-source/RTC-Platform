import { Schema, model, Document, Types } from 'mongoose';

// ─── Message Model ────────────────────────────────────────────────────────────
// Stores every chat message — channel messages, thread replies, and DMs all
// share this schema. `channelId` doubles as the DM room ID (see dmKey() in
// the websocket app's registry.ts) when isDM is true.

export interface IReaction {
  emoji: string;
  userIds: string[]; // userIds who reacted with this emoji
}

export interface IMessage extends Document<string> {
  channelId: string;
  authorId: string;
  authorName: string;       // denormalized for fast rendering without a join
  content: string;
  isDM: boolean;
  parentMessageId?: string; // set when this is a thread reply
  reactions: IReaction[];
  deliveredTo: string[];    // userIds who have received it (Module 7)
  readBy: string[];         // userIds who have read it (Module 7)
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
  { _id: false } // no separate _id needed for each reaction subdocument
);

const MessageSchema = new Schema<IMessage>(
  {
    // Override Mongoose's default ObjectId _id with a plain String, since
    // the websocket layer generates IDs via crypto.randomUUID() (not
    // ObjectId-compatible hex strings). This MUST be declared explicitly,
    // or Mongoose silently expects ObjectId and every save() call that
    // passes a UUID will fail validation.
    _id: { type: String, required: true },
    channelId: { type: String, required: true, index: true },
    authorId: { type: String, required: true, index: true },
    authorName: { type: String, required: true },
    content: { type: String, required: true },
    isDM: { type: Boolean, default: false },
    parentMessageId: { type: String, default: null, index: true },
    reactions: { type: [ReactionSchema], default: [] },
    deliveredTo: { type: [String], default: [] },
    readBy: { type: [String], default: [] },
    isEdited: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true, // adds createdAt / updatedAt automatically
  }
);

// Compound index: fetching a channel's messages in order is the most common
// query (message history / infinite scroll — Module 4), so optimize for it.
MessageSchema.index({ channelId: 1, createdAt: -1 });

// Text index for Module 11 (Search) — lets MongoDB do full-text search
// on message content without needing a separate search engine.
MessageSchema.index({ content: 'text' });

export const Message = model<IMessage>('Message', MessageSchema);