import { Schema, model } from 'mongoose';
import { IApiKey } from './apikeys.types';

const apiKeySchema = new Schema<IApiKey>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    publicPart: { type: String, required: true },
    secretHash: { type: String, required: true },
    label: { type: String, default: '', trim: true },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

apiKeySchema.index({ secretHash: 1 });
apiKeySchema.index({ projectId: 1 });

export const ApiKeyModel = model<IApiKey>('ApiKey', apiKeySchema);
