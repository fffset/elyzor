import { Document, Types } from 'mongoose';

export interface IProjectUser extends Document {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectUserRegisterResponse {
  user: { id: string; email: string; projectId: string };
  accessToken: string;
}

export interface ProjectUserLoginResponse {
  accessToken: string;
}
