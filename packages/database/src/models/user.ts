import { Schema, model, type Types } from 'mongoose';

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string; // bcrypt hash
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    emailVerified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Module 11 — user search
UserSchema.index({ name: 'text', email: 'text' });

export const User = model<IUser>('User', UserSchema);
