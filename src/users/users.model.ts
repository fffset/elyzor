import { Schema, model } from 'mongoose';
import { IUser } from './users.types';

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

export const UserModel = model<IUser>('User', userSchema);
