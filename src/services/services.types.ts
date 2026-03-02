import { Document, Types } from 'mongoose';

export interface IService extends Document {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  name: string;
  keyHash: string;
  publicPart: string;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceResponse {
  id: string;
  projectId: string;
  name: string;
  publicPart: string;
  revoked: boolean;
  createdAt: Date;
}

export interface CreatedServiceResponse extends ServiceResponse {
  key: string;
}
