import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  userId: string;
  action: string;
  metadata: Record<string, unknown>;
  timestamp: number;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    action: {
      type: String,
      required: true
    },
    metadata: {
      type: Schema.Types.Mixed,   // flexible, any key value pairs
      default: {}
    },
    timestamp: {
      type: Number,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);