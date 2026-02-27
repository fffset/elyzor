import { ProjectModel } from './projects.model';
import { IProject } from './projects.types';

export class ProjectRepository {
  async findAllByUser(userId: string): Promise<IProject[]> {
    return ProjectModel.find({ userId });
  }

  async findByIdAndUser(id: string, userId: string): Promise<IProject | null> {
    return ProjectModel.findOne({ _id: id, userId });
  }

  async create(data: { name: string; userId: string }): Promise<IProject> {
    return ProjectModel.create(data);
  }

  async deleteByIdAndUser(id: string, userId: string): Promise<void> {
    await ProjectModel.findOneAndDelete({ _id: id, userId });
  }
}
