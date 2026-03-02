import { ServiceModel } from './services.model';
import { IService } from './services.types';

export class ServiceRepository {
  async findByProject(projectId: string): Promise<IService[]> {
    return ServiceModel.find({ projectId }, { keyHash: 0 });
  }

  async findByKeyHash(keyHash: string): Promise<IService | null> {
    return ServiceModel.findOne({ keyHash });
  }

  async findByIdAndProject(id: string, projectId: string): Promise<IService | null> {
    return ServiceModel.findOne({ _id: id, projectId });
  }

  async findByNameAndProject(name: string, projectId: string): Promise<IService | null> {
    return ServiceModel.findOne({ name, projectId });
  }

  async create(data: {
    projectId: string;
    name: string;
    keyHash: string;
    publicPart: string;
  }): Promise<IService> {
    return ServiceModel.create(data);
  }

  async revoke(id: string, projectId: string): Promise<void> {
    await ServiceModel.updateOne({ _id: id, projectId }, { revokedAt: new Date() });
  }

  async deleteByProject(projectId: string): Promise<void> {
    await ServiceModel.deleteMany({ projectId });
  }
}
