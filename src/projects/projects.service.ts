import { ProjectRepository } from './projects.repository';
import { IProject, CreateProjectDto } from './projects.types';
import { NotFoundError, ValidationError } from '../errors';

const projectRepo = new ProjectRepository();

export class ProjectService {
  async listProjects(userId: string): Promise<IProject[]> {
    return projectRepo.findAllByUser(userId);
  }

  async createProject(userId: string, dto: CreateProjectDto): Promise<IProject> {
    if (!dto.name || !dto.name.trim()) {
      throw new ValidationError('Proje adı zorunludur');
    }
    return projectRepo.create({ userId, name: dto.name.trim() });
  }

  async deleteProject(userId: string, projectId: string): Promise<void> {
    const project = await projectRepo.findByIdAndUser(projectId, userId);
    if (!project) {
      throw new NotFoundError('Proje bulunamadı');
    }
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
