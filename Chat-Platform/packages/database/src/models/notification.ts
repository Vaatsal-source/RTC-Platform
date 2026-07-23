import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  userId: string;
  message: string;
  type: 'mention' | 'message' | 'invite';
  read: boolean;
  channelId?: string;
  senderId?: string;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: String,
      required: true,
      index: true        // index for fast queries by userId
    },
    message: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['mention', 'message', 'invite'],
      required: true
    },
    read: {
      type: Boolean,
      default: false
    },
    channelId: {
      type: String
    },
    senderId: {
      type: String
    }
  },
  {
    timestamps: true     // adds createdAt and updatedAt automatically
  }
);

export default mongoose.model<INotification>('Notification', NotificationSchema);