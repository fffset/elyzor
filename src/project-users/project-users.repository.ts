import { ProjectUserModel } from './project-users.model';
import { IProjectUser } from './project-users.types';

export class ProjectUserRepository {
  async findByEmailAndProject(email: string, projectId: string): Promise<IProjectUser | null> {
    return ProjectUserModel.findOne({ email, projectId });
  }

  async findById(id: string): Promise<IProjectUser | null> {
    return ProjectUserModel.findById(id);
  }

  async create(data: {
    projectId: string;
    email: string;
    passwordHash: string;
  }): Promise<IProjectUser> {
    return ProjectUserModel.create(data);
  }
}
