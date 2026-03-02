import { Schema, model } from 'mongoose';
import { IUsage } from './usage.types';

const usageSchema = new Schema<IUsage>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    apiKeyId: { type: Schema.Types.ObjectId, ref: 'ApiKey', required: false },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: false },
    result: {
      type: String,
      enum: ['success', 'invalid_key', 'revoked', 'rate_limited', 'error'],
      required: true,
    },
    latencyMs: { type: Number, required: true },
    ip: { type: String, default: '' },
    country: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

usageSchema.index({ projectId: 1, timestamp: -1 });
usageSchema.index({ apiKeyId: 1, timestamp: -1 });
usageSchema.index({ serviceId: 1, timestamp: -1 });
usageSchema.index({ result: 1, timestamp: -1 });
usageSchema.index({ timestamp: -1 });

export const UsageModel = model<IUsage>('Usage', usageSchema);
