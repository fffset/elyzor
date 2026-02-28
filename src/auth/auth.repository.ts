import { RefreshTokenModel, IRefreshToken } from './auth.model';

export class AuthRepository {
  async createRefreshToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userType?: 'platform' | 'project';
  }): Promise<IRefreshToken> {
    return RefreshTokenModel.create(data);
  }

  async findRefreshToken(tokenHash: string): Promise<IRefreshToken | null> {
    return RefreshTokenModel.findOne({ tokenHash, revokedAt: null });
  }

  async findRefreshTokenAny(tokenHash: string): Promise<IRefreshToken | null> {
    return RefreshTokenModel.findOne({ tokenHash });
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await RefreshTokenModel.updateOne({ tokenHash }, { revokedAt: new Date() });
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await RefreshTokenModel.updateMany(
      { userId, revokedAt: null },
      { revokedAt: new Date() }
    );
  }
}
