import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserRepository } from '../users/users.repository';
import { AuthRepository } from './auth.repository';
import { UnauthorizedError, ValidationError } from '../errors';
import { env } from '../config/env';
import redis from '../config/redis';
import { RegisterDto } from './dtos/register.dto';
import { LoginDto } from './dtos/login.dto';
import { generateAccessToken } from './services/token.service';
import { RegisterResponse, LoginResponse, RotatedRefreshResponse } from './auth.types';

const userRepo = new UserRepository();
const authRepo = new AuthRepository();

const REFRESH_TOKEN_BYTES = 48;
const REFRESH_COOKIE = 'refreshToken';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function blacklistKey(token: string): string {
  return `blacklist:${token}`;
}

async function issueRefreshToken(userId: string): Promise<string> {
  const refreshToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await authRepo.createRefreshToken({ userId, tokenHash, expiresAt });
  return refreshToken;
}

async function blacklistAccessToken(accessToken: string): Promise<void> {
  try {
    const decoded = jwt.decode(accessToken) as { exp?: number } | null;
    if (decoded?.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await redis.setex(blacklistKey(accessToken), ttl, '1');
      }
    }
  } catch {
    // token decode edilemese bile devam et
  }
}

export class AuthService {
  async register(dto: RegisterDto): Promise<RegisterResponse> {
    const existing = await userRepo.findByEmail(dto.email);
    if (existing) {
      throw new ValidationError('Kayıt tamamlanamadı');
    }

    const passwordHash = await bcrypt.hash(dto.password, env.bcryptRounds);
    const user = await userRepo.create({ email: dto.email, passwordHash });

    const userId = user._id.toString();
    const accessToken = generateAccessToken({ id: userId, email: user.email });
    const refreshToken = await issueRefreshToken(userId);

    return { user: { id: userId, email: user.email }, token: { accessToken, refreshToken } };
  }

  async login(dto: LoginDto): Promise<{ response: LoginResponse; refreshToken: string }> {
    const user = await userRepo.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedError('Geçersiz email veya şifre');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Geçersiz email veya şifre');
    }

    const accessToken = generateAccessToken({ id: user._id.toString(), email: user.email });
    const refreshToken = await issueRefreshToken(user._id.toString());

    return { response: { accessToken }, refreshToken };
  }

  async refresh(rawRefreshToken: string | undefined): Promise<RotatedRefreshResponse> {
    if (!rawRefreshToken) {
      throw new UnauthorizedError('Refresh token gerekli');
    }

    const tokenHash = hashToken(rawRefreshToken);

    // Rotation için her zaman DB'den doğrula — cache'e güvenme
    const stored = await authRepo.findRefreshTokenAny(tokenHash);

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedError('Geçersiz veya süresi dolmuş refresh token');
    }

    if (stored.revokedAt !== null) {
      // Revoke edilmiş token kullanıldı → token theft sinyali → tüm oturumları kapat
      await authRepo.revokeAllUserTokens(stored.userId.toString());
      await redis.del(`refresh:${tokenHash}`);
      throw new UnauthorizedError('Geçersiz veya süresi dolmuş refresh token');
    }

    const userId = stored.userId.toString();

    const user = await userRepo.findById(userId);
    if (!user) {
      throw new UnauthorizedError('Kullanıcı bulunamadı');
    }

    // Eski token'ı revoke et (rotation)
    await authRepo.revokeRefreshToken(tokenHash);
    await redis.del(`refresh:${tokenHash}`);

    // Yeni token çifti ver
    const accessToken = generateAccessToken({ id: user._id.toString(), email: user.email });
    const newRefreshToken = await issueRefreshToken(userId);

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(accessToken: string, rawRefreshToken: string | undefined): Promise<void> {
    await blacklistAccessToken(accessToken);

    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      await authRepo.revokeRefreshToken(tokenHash);
      await redis.del(`refresh:${tokenHash}`);
    }
  }

  async logoutAll(userId: string, accessToken: string): Promise<void> {
    await blacklistAccessToken(accessToken);
    await authRepo.revokeAllUserTokens(userId);
  }
}

export { REFRESH_COOKIE };
