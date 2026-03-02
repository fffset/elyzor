import { Document, Types } from 'mongoose';

export type VerificationResult = 'success' | 'invalid_key' | 'revoked' | 'rate_limited' | 'error';

export interface IUsage extends Document {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  apiKeyId?: Types.ObjectId;
  serviceId?: Types.ObjectId;
  result: VerificationResult;
  latencyMs: number;
  ip: string;
  country?: string;
  timestamp: Date;
}

export interface UsageLogDto {
  projectId: string;
  apiKeyId?: string;
  serviceId?: string;
  result: VerificationResult;
  latencyMs: number;
  ip: string;
  country?: string;
}
