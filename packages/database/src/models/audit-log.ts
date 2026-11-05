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

// Workspace admins read the audit trail by workspace (metadata.workspaceId), newest first.
AuditLogSchema.index({ 'metadata.workspaceId': 1, timestamp: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', AuditLogSchema);
