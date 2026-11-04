import { Schema, model, type Types } from 'mongoose';
import type { NotificationKind } from '@repo/shared-types';

export interface INotification {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  kind: NotificationKind;
  message: string;
  read: boolean;
  channelId?: Types.ObjectId;
  workspaceId?: Types.ObjectId;
  senderId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['mention', 'message', 'invite'], required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    channelId: { type: Schema.Types.ObjectId, ref: 'Channel' },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace' },
    senderId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const Notification = model<INotification>('Notification', NotificationSchema);
