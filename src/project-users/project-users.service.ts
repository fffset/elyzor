import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { ProjectUserRepository } from './project-users.repository';
import { AuthRepository } from '../auth/auth.repository';
import { ProjectService } from '../projects/projects.service';
import { UnauthorizedError, ValidationError, NotFoundError, ForbiddenError } from '../errors';
import { env } from '../config/env';
import redis from '../config/redis';
import { generateProjectUserAccessToken } from '../auth/services/token.service';
import { RegisterProjectUserDto } from './dtos/register-project-user.dto';
import { LoginProjectUserDto } from './dtos/login-project-user.dto';
import {
  ProjectUserRegisterResponse,
  ProjectUserLoginResponse,
  ProjectUserRefreshResponse,
} from './project-users.types';

const projectUserRepo = new ProjectUserRepository();
const authRepo = new AuthRepository();
const projectService = new ProjectService();

const REFRESH_TOKEN_BYTES = 48;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function issueRefreshToken(userId: string): Promise<string> {
  const refreshToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await authRepo.createRefreshToken({ userId, tokenHash, expiresAt, userType: 'project' });
  return refreshToken;
}

async function blacklistAccessToken(accessToken: string): Promise<void> {
  try {
    const decoded = jwt.decode(accessToken) as { exp?: number } | null;
    if (decoded?.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await redis.setex(`blacklist:${accessToken}`, ttl, '1');
      }
    }
  } catch {
    // token decode edilemese bile devam et
  }
}

export class ProjectUserService {
  async register(
    platformUserId: string,
    projectId: string,
    dto: RegisterProjectUserDto
  ): Promise<{ response: ProjectUserRegisterResponse; refreshToken: string }> {
    // XYZ Backend'in bu projeye sahip olduğunu doğrula
    await projectService.assertOwnership(platformUserId, projectId);

    const existing = await projectUserRepo.findByEmailAndProject(dto.email, projectId);
    if (existing) {
      // Enumeration koruması: kullanıcı varlığını sızdırmaz
      throw new ValidationError('Kayıt tamamlanamadı');
    }

    const passwordHash = await bcrypt.hash(dto.password, env.bcryptRounds);
    const user = await projectUserRepo.create({ projectId, email: dto.email, passwordHash });

    const userId = user._id.toString();
    const accessToken = generateProjectUserAccessToken({
      id: userId,
      email: user.email,
      projectId,
    });
    const refreshToken = await issueRefreshToken(userId);

    return {
      response: {
        user: { id: userId, email: user.email, projectId },
        accessToken,
      },
      refreshToken,
    };
  }

  async login(
    platformUserId: string,
    projectId: string,
    dto: LoginProjectUserDto
  ): Promise<{ response: ProjectUserLoginResponse; refreshToken: string }> {
    // XYZ Backend'in bu projeye sahip olduğunu doğrula
    await projectService.assertOwnership(platformUserId, projectId);

    const user = await projectUserRepo.findByEmailAndProject(dto.email, projectId);
    if (!user) {
      throw new UnauthorizedError('Geçersiz email veya şifre');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Geçersiz email veya şifre');
    }

    const accessToken = generateProjectUserAccessToken({
      id: user._id.toString(),
      email: user.email,
      projectId,
    });
    const refreshToken = await issueRefreshToken(user._id.toString());

    return { response: { accessToken }, refreshToken };
  }

  async refresh(
    rawRefreshToken: string | undefined,
    projectId: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
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

    // Sadece project user token'ları kabul et
    if (stored.userType !== 'project') {
      throw new UnauthorizedError('Geçersiz refresh token');
    }

    const userId = stored.userId.toString();
    const projectUser = await projectUserRepo.findById(userId);
    if (!projectUser) {
      throw new UnauthorizedError('Kullanıcı bulunamadı');
    }

    // Token'ın bu projeye ait olduğunu doğrula
    if (projectUser.projectId.toString() !== projectId) {
      throw new UnauthorizedError('Geçersiz refresh token');
    }

    // Eski token'ı revoke et (rotation)
    await authRepo.revokeRefreshToken(tokenHash);
    await redis.del(`refresh:${tokenHash}`);

    // Yeni token çifti ver
    const accessToken = generateProjectUserAccessToken({
      id: userId,
      email: projectUser.email,
      projectId,
    });
    const newRefreshToken = await issueRefreshToken(userId);

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(projectUserAccessToken: string, rawRefreshToken: string | undefined): Promise<void> {
    await blacklistAccessToken(projectUserAccessToken);

    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      await authRepo.revokeRefreshToken(tokenHash);
      await redis.del(`refresh:${tokenHash}`);
    }
  }

  async logoutAll(
    platformUserId: string,
    projectId: string,
    projectUserId: string,
    projectUserAccessToken: string
  ): Promise<void> {
    await projectService.assertOwnership(platformUserId, projectId);

    const projectUser = await projectUserRepo.findById(projectUserId);
    if (!projectUser) {
      throw new NotFoundError('Kullanıcı bulunamadı');
    }

    if (projectUser.projectId.toString() !== projectId) {
      throw new ForbiddenError('Bu kullanıcı bu projeye ait değil');
    }

    await blacklistAccessToken(projectUserAccessToken);
    await authRepo.revokeAllUserTokens(projectUserId);
  }
}

export type { ProjectUserRefreshResponse };
