import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { ProjectUserRepository } from './project-users.repository';
import { AuthRepository } from '../auth/auth.repository';
import { ProjectService } from '../projects/projects.service';
import { UnauthorizedError, ValidationError } from '../errors';
import { env } from '../config/env';
import { generateProjectUserAccessToken } from '../auth/services/token.service';
import { RegisterProjectUserDto } from './dtos/register-project-user.dto';
import { LoginProjectUserDto } from './dtos/login-project-user.dto';
import { ProjectUserRegisterResponse, ProjectUserLoginResponse } from './project-users.types';

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
    const accessToken = generateProjectUserAccessToken({ id: userId, email: user.email, projectId });
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
}
