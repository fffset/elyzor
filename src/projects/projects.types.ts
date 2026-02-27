import { Document, Types } from 'mongoose';

export interface IProject extends Document {
  _id: Types.ObjectId;
  name: string;
  userId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectDto {
  name: string;
}
