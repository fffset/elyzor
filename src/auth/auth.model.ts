import { Schema, model } from 'mongoose';

export interface IRefreshToken {
  userId: Schema.Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  userType?: 'platform' | 'project';
}

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    userType: { type: String, enum: ['platform', 'project'], default: 'platform' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ tokenHash: 1 });
refreshTokenSchema.index({ userId: 1 });

export const RefreshTokenModel = model<IRefreshToken>('RefreshToken', refreshTokenSchema);
