import { Schema, model, type Types } from 'mongoose';
import type { WorkspaceRole } from '@repo/shared-types';

export interface IWorkspace {
  _id: Types.ObjectId;
  name: string;
  description: string;
  ownerId: Types.ObjectId;
  inviteCode: string;
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceSchema = new Schema<IWorkspace>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    inviteCode: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

export const Workspace = model<IWorkspace>('Workspace', WorkspaceSchema);

// ─── WorkspaceMember ──────────────────────────────────────────────────────────
export interface IWorkspaceMember {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  userId: Types.ObjectId;
  role: WorkspaceRole;
  createdAt: Date;
}

const WorkspaceMemberSchema = new Schema<IWorkspaceMember>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
WorkspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export const WorkspaceMember = model<IWorkspaceMember>('WorkspaceMember', WorkspaceMemberSchema);
