import { Schema, model, Document } from 'mongoose';

// ─── Channel Model ────────────────────────────────────────────────────────────
// Minimal version covering what the WS layer needs right now (Module 3).
// Backend team can extend this with workspaceId, settings, etc. once
// Module 2 (Workspace Management) is implemented — kept intentionally small
// here so it doesn't collide with whatever they're building.

export interface IChannel extends Document {
  name: string;
  isPrivate: boolean;
  isArchived: boolean;
  memberIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ChannelSchema = new Schema<IChannel>(
  {
    name: { type: String, required: true },
    isPrivate: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    memberIds: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const Channel = model<IChannel>('Channel', ChannelSchema);