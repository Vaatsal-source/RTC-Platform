import { Schema, model, type Types } from 'mongoose';

// An invitation for an email address that has no account yet. It is redeemed when that address
// is VERIFIED (so nobody can claim an invite by registering someone else's email).

export interface IWorkspaceInvite {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  email: string;
  invitedBy: Types.ObjectId;
  createdAt: Date;
}

const WorkspaceInviteSchema = new Schema<IWorkspaceInvite>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
WorkspaceInviteSchema.index({ workspaceId: 1, email: 1 }, { unique: true });

export const WorkspaceInvite = model<IWorkspaceInvite>('WorkspaceInvite', WorkspaceInviteSchema);
