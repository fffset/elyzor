import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserRepository } from '../users/users.repository';
import { AuthRepository } from './auth.repository';
import { UnauthorizedError, ValidationError } from '../errors';
import { env } from '../config/env';
import redis from '../config/redis';
import {
  RegisterDto,
  LoginDto,
  RegisterResponse,
  LoginResponse,
  RefreshResponse,
} from './auth.types';

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

export class AuthService {
  async register(dto: RegisterDto): Promise<RegisterResponse> {
    if (!dto.email || !dto.password) {
      throw new ValidationError('Email ve şifre zorunludur');
    }
    if (dto.password.length < 8) {
      throw new ValidationError('Şifre en az 8 karakter olmalıdır');
    }

    const existing = await userRepo.findByEmail(dto.email);
    if (existing) {
      throw new ValidationError('Bu email zaten kullanımda');
    }

    const passwordHash = await bcrypt.hash(dto.password, env.bcryptRounds);
    const user = await userRepo.create({ email: dto.email, passwordHash });

    return { id: user._id.toString(), email: user.email };
  }

  async login(dto: LoginDto): Promise<{ response: LoginResponse; refreshToken: string }> {
    if (!dto.email || !dto.password) {
      throw new ValidationError('Email ve şifre zorunludur');
    }

    const user = await userRepo.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedError('Geçersiz email veya şifre');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Geçersiz email veya şifre');
    }

    const accessToken = jwt.sign(
      { userId: user._id.toString(), email: user.email },
      env.jwt.secret,
      { expiresIn: env.jwt.accessExpiresIn }
    );

    const refreshToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await authRepo.createRefreshToken({ userId: user._id.toString(), tokenHash, expiresAt });

    return { response: { accessToken }, refreshToken };
  }

  async refresh(rawRefreshToken: string | undefined): Promise<RefreshResponse> {
    if (!rawRefreshToken) {
      throw new UnauthorizedError('Refresh token gerekli');
    }

    const tokenHash = hashToken(rawRefreshToken);

    // Redis cache'e bak, yoksa MongoDB'ye git
    const cacheKey = `refresh:${tokenHash}`;
    let userId: string | null = await redis.get(cacheKey);

    if (!userId) {
      const stored = await authRepo.findRefreshToken(tokenHash);
      if (!stored || stored.expiresAt < new Date()) {
        throw new UnauthorizedError('Geçersiz veya süresi dolmuş refresh token');
      }
      userId = stored.userId.toString();
      const ttl = Math.floor((stored.expiresAt.getTime() - Date.now()) / 1000);
      await redis.setex(cacheKey, ttl, userId);
    }

    const user = await userRepo.findById(userId);
    if (!user) {
      throw new UnauthorizedError('Kullanıcı bulunamadı');
    }

    const accessToken = jwt.sign(
      { userId: user._id.toString(), email: user.email },
      env.jwt.secret,
      { expiresIn: env.jwt.accessExpiresIn }
    );

    return { accessToken };
  }

  async logout(accessToken: string, rawRefreshToken: string | undefined): Promise<void> {
    // Access token'ı blacklist'e ekle (kalan TTL kadar)
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

    // Refresh token'ı iptal et
    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      await authRepo.revokeRefreshToken(tokenHash);
      await redis.del(`refresh:${tokenHash}`);
    }
  }

  async logoutAll(userId: string, accessToken: string): Promise<void> {
    // Mevcut access token'ı blacklist'e ekle
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

    // Tüm refresh token'ları iptal et
    await authRepo.revokeAllUserTokens(userId);
  }
}

export { REFRESH_COOKIE };
