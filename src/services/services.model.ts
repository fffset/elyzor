import { Schema, model } from 'mongoose';
import { IService } from './services.types';

const serviceSchema = new Schema<IService>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    name: { type: String, required: true, trim: true },
    keyHash: { type: String, required: true },
    publicPart: { type: String, required: true },
    revokedAt: { type: Date },
  },
  { timestamps: true }
);

serviceSchema.index({ projectId: 1, name: 1 }, { unique: true });
serviceSchema.index({ keyHash: 1 });

export const ServiceModel = model<IService>('Service', serviceSchema);
