import crypto from 'crypto';
import { ServiceRepository } from './services.repository';
import { ProjectService } from '../projects/projects.service';
import { NotFoundError, ForbiddenError, ValidationError } from '../errors';
import { ServiceResponse, CreatedServiceResponse } from './services.types';
import { CreateServiceDto } from './dtos/create-service.dto';
import redis from '../config/redis';

const serviceRepo = new ServiceRepository();
const projectService = new ProjectService();

export class ServicesService {
  private generateKey(): { publicPart: string; secretPart: string; fullKey: string } {
    const publicPart = crypto.randomBytes(8).toString('hex');
    const secretPart = crypto.randomBytes(32).toString('hex');
    const fullKey = `svc_live_${publicPart}.${secretPart}`;
    return { publicPart, secretPart, fullKey };
  }

  private hashSecret(secretPart: string): string {
    return crypto.createHash('sha256').update(secretPart).digest('hex');
  }

  async listServices(userId: string, projectId: string): Promise<ServiceResponse[]> {
    await projectService.assertOwnership(userId, projectId);
    const services = await serviceRepo.findByProject(projectId);
    return services.map((s) => ({
      id: s._id.toString(),
      projectId: s.projectId.toString(),
      name: s.name,
      publicPart: s.publicPart,
      revoked: s.revokedAt != null,
      createdAt: s.createdAt,
    }));
  }

  async createService(
    userId: string,
    projectId: string,
    dto: CreateServiceDto
  ): Promise<CreatedServiceResponse> {
    await projectService.assertOwnership(userId, projectId);

    const existing = await serviceRepo.findByNameAndProject(dto.name, projectId);
    if (existing) {
      throw new ValidationError('Servis adı zaten kullanımda');
    }

    const { publicPart, secretPart, fullKey } = this.generateKey();
    const keyHash = this.hashSecret(secretPart);

    const service = await serviceRepo.create({ projectId, name: dto.name, keyHash, publicPart });

    return {
      id: service._id.toString(),
      projectId: service.projectId.toString(),
      name: service.name,
      publicPart,
      revoked: false,
      createdAt: service.createdAt,
      key: fullKey,
    };
  }

  async revokeService(userId: string, projectId: string, serviceId: string): Promise<void> {
    await projectService.assertOwnership(userId, projectId);

    const service = await serviceRepo.findByIdAndProject(serviceId, projectId);
    if (!service) {
      throw new NotFoundError('Servis bulunamadı');
    }
    if (service.revokedAt != null) {
      throw new ForbiddenError('Bu servis zaten iptal edilmiş');
    }

    await serviceRepo.revoke(serviceId, projectId);
    await redis.del(`svckey:${service.keyHash}`);
  }

  async rotateService(
    userId: string,
    projectId: string,
    serviceId: string
  ): Promise<CreatedServiceResponse> {
    await projectService.assertOwnership(userId, projectId);

    const existing = await serviceRepo.findByIdAndProject(serviceId, projectId);
    if (!existing) {
      throw new NotFoundError('Servis bulunamadı');
    }
    if (existing.revokedAt != null) {
      throw new ForbiddenError('Revoke edilmiş servis rotate edilemez');
    }

    const { publicPart, secretPart, fullKey } = this.generateKey();
    const keyHash = this.hashSecret(secretPart);

    const newService = await serviceRepo.create({
      projectId,
      name: existing.name,
      keyHash,
      publicPart,
    });

    // Eski service'i revoke et ve cache'ini temizle
    await serviceRepo.revoke(serviceId, projectId);
    await redis.del(`svckey:${existing.keyHash}`);

    return {
      id: newService._id.toString(),
      projectId: newService.projectId.toString(),
      name: newService.name,
      publicPart,
      revoked: false,
      createdAt: newService.createdAt,
      key: fullKey,
    };
  }
}
