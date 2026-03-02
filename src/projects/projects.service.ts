import { ProjectRepository } from './projects.repository';
import { IProject } from './projects.types';
import { CreateProjectDto } from './dtos/create-project.dto';
import { NotFoundError } from '../errors';
import { ApiKeyRepository } from '../apikeys/apikeys.repository';
import { ServiceRepository } from '../services/services.repository';
import { UsageRepository } from '../usage/usage.repository';

const projectRepo = new ProjectRepository();
const apiKeyRepo = new ApiKeyRepository();
const serviceRepo = new ServiceRepository();
const usageRepo = new UsageRepository();

export class ProjectService {
  async listProjects(userId: string): Promise<IProject[]> {
    return projectRepo.findAllByUser(userId);
  }

  async createProject(userId: string, dto: CreateProjectDto): Promise<IProject> {
    return projectRepo.create({ userId, name: dto.name.trim() });
  }

  async deleteProject(userId: string, projectId: string): Promise<void> {
    const project = await projectRepo.findByIdAndUser(projectId, userId);
    if (!project) {
      throw new NotFoundError('Proje bulunamadı');
    }
    // Önce cascade: key, servis ve kullanım loglarını sil
    await Promise.all([
      apiKeyRepo.deleteByProject(projectId),
      serviceRepo.deleteByProject(projectId),
      usageRepo.deleteByProject(projectId),
    ]);
    await projectRepo.deleteByIdAndUser(projectId, userId);
  }

  async assertOwnership(userId: string, projectId: string): Promise<IProject> {
    const project = await projectRepo.findByIdAndUser(projectId, userId);
    if (!project) {
      throw new NotFoundError('Proje bulunamadı');
    }
    return project;
  }
}
