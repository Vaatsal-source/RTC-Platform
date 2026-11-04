import { Schema, model, type Types } from 'mongoose';
import type { ActivityKind } from '@repo/shared-types';

// Module 12 — Activity feed (message sent, user joined, channel created, file uploaded)

export interface IActivity {
  _id: Types.ObjectId;
  kind: ActivityKind;
  workspaceId: Types.ObjectId;
  actorId: Types.ObjectId;
  actorName: string;
  channelId?: Types.ObjectId;
  summary: string;
  createdAt: Date;
}

const ActivitySchema = new Schema<IActivity>(
  {
    kind: { type: String, enum: ['message_sent', 'user_joined', 'channel_created', 'file_uploaded'], required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorName: { type: String, required: true },
    channelId: { type: Schema.Types.ObjectId, ref: 'Channel' },
    summary: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
ActivitySchema.index({ workspaceId: 1, createdAt: -1 });

export const Activity = model<IActivity>('Activity', ActivitySchema);
