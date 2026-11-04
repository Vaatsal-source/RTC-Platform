import { Schema, model, type Types } from 'mongoose';

export interface IAuditLog {
  _id: Types.ObjectId;
  userId: string;
  action: string;
  metadata: Record<string, unknown>;
  timestamp: number;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    userId: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    timestamp: { type: Number, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const AuditLog = model<IAuditLog>('AuditLog', AuditLogSchema);
