import crypto from 'crypto';
import { ApiKeyRepository } from './apikeys.repository';
import { ProjectService } from '../projects/projects.service';
import { NotFoundError, ForbiddenError } from '../errors';
import { CreateApiKeyDto, CreatedApiKeyResponse, ApiKeyResponse } from './apikeys.types';

const apiKeyRepo = new ApiKeyRepository();
const projectService = new ProjectService();

export class ApiKeyService {
  private generateKey(): { publicPart: string; secretPart: string; fullKey: string } {
    const publicPart = crypto.randomBytes(8).toString('hex');
    const secretPart = crypto.randomBytes(32).toString('hex');
    const fullKey = `sk_live_${publicPart}.${secretPart}`;
    return { publicPart, secretPart, fullKey };
  }

  private hashSecret(secretPart: string): string {
    return crypto.createHash('sha256').update(secretPart).digest('hex');
  }

  async listKeys(userId: string, projectId: string): Promise<ApiKeyResponse[]> {
    await projectService.assertOwnership(userId, projectId);
    const keys = await apiKeyRepo.findByProject(projectId);
    return keys.map((k) => ({
      id: k._id.toString(),
      projectId: k.projectId.toString(),
      publicPart: k.publicPart,
      label: k.label,
      revoked: k.revoked,
      createdAt: k.createdAt,
    }));
  }

  async createKey(userId: string, projectId: string, dto: CreateApiKeyDto): Promise<CreatedApiKeyResponse> {
    await projectService.assertOwnership(userId, projectId);

    const { publicPart, secretPart, fullKey } = this.generateKey();
    const secretHash = this.hashSecret(secretPart);

    const key = await apiKeyRepo.create({
      projectId,
      publicPart,
      secretHash,
      label: dto.label ?? '',
    });

    return {
      id: key._id.toString(),
      projectId: key.projectId.toString(),
      publicPart,
      label: key.label,
      revoked: false,
      createdAt: key.createdAt,
      key: fullKey,
    };
  }

  async revokeKey(userId: string, projectId: string, keyId: string): Promise<void> {
    await projectService.assertOwnership(userId, projectId);

    const key = await apiKeyRepo.findByIdAndProject(keyId, projectId);
    if (!key) {
      throw new NotFoundError('API key bulunamadı');
    }
    if (key.revoked) {
      throw new ForbiddenError('Bu key zaten iptal edilmiş');
    }

    await apiKeyRepo.revoke(keyId, projectId);
  }
}
