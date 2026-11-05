import { Schema, model, type Types } from 'mongoose';
import type { ChannelKind } from '@repo/shared-types';

// A Channel is a public channel, a private channel, or a 1:1 DM.
// DMs reuse all channel machinery (subscriptions, history, receipts) — they
// simply have kind 'dm', no workspace, and exactly two memberIds.

export interface IChannel {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId | null;
  name: string;
  kind: ChannelKind;
  isArchived: boolean;
  memberIds: Types.ObjectId[]; // authoritative for private + dm; ignored for public
  createdBy: Types.ObjectId | null;
  dmKey?: string; // "<smallerId>:<largerId>" for dm channels
  createdAt: Date;
  updatedAt: Date;
}

const ChannelSchema = new Schema<IChannel>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null, index: true },
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ['public', 'private', 'dm'], default: 'public' },
    isArchived: { type: Boolean, default: false },
    memberIds: { type: [Schema.Types.ObjectId], default: [], index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    dmKey: { type: String },
  },
  { timestamps: true },
);

ChannelSchema.index({ dmKey: 1 }, { unique: true, partialFilterExpression: { dmKey: { $type: 'string' } } });
ChannelSchema.index(
  { workspaceId: 1, name: 1 },
  { unique: true, partialFilterExpression: { kind: { $in: ['public', 'private'] } } },
);
// Module 11 — channel search
ChannelSchema.index({ name: 'text' });

export const Channel = model<IChannel>('Channel', ChannelSchema);

export function dmKeyFor(a: string, b: string): string {
  return [a, b].sort().join(':');
}
