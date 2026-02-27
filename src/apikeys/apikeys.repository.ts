import { ApiKeyModel } from './apikeys.model';
import { IApiKey } from './apikeys.types';

export class ApiKeyRepository {
  async findByProject(projectId: string): Promise<IApiKey[]> {
    return ApiKeyModel.find({ projectId }, { secretHash: 0 });
  }

  async findByIdAndProject(id: string, projectId: string): Promise<IApiKey | null> {
    return ApiKeyModel.findOne({ _id: id, projectId });
  }

  async findBySecretHash(secretHash: string): Promise<IApiKey | null> {
    return ApiKeyModel.findOne({ secretHash });
  }

  async create(data: {
    projectId: string;
    publicPart: string;
    secretHash: string;
    label: string;
  }): Promise<IApiKey> {
    return ApiKeyModel.create(data);
  }

  async revoke(id: string, projectId: string): Promise<void> {
    await ApiKeyModel.updateOne({ _id: id, projectId }, { revoked: true });
  }
}
