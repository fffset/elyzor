import { Document, Types } from 'mongoose';

export interface IApiKey extends Document {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  publicPart: string;
  secretHash: string;
  label: string;
  revoked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKeyResponse {
  id: string;
  projectId: string;
  publicPart: string;
  label: string;
  revoked: boolean;
  createdAt: Date;
}

export interface CreatedApiKeyResponse extends ApiKeyResponse {
  key: string;
}
