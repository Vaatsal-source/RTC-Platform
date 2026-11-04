import { Schema, model, type Types } from 'mongoose';

// Metadata for an uploaded file. Bytes live on disk (UPLOAD_DIR) under
// `storageName`; swap for S3 by changing only the API's storage layer.

export interface IStoredFile {
  _id: Types.ObjectId;
  uploaderId: Types.ObjectId;
  channelId: Types.ObjectId;
  workspaceId: Types.ObjectId | null;
  name: string; // original filename
  storageName: string; // on-disk filename
  mimeType: string;
  size: number;
  createdAt: Date;
}

const FileSchema = new Schema<IStoredFile>(
  {
    uploaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null },
    name: { type: String, required: true },
    storageName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const StoredFile = model<IStoredFile>('File', FileSchema);
