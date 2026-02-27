import { UsageModel } from './usage.model';
import { IUsage, UsageLogDto } from './usage.types';

export class UsageRepository {
  async create(dto: UsageLogDto): Promise<IUsage> {
    return UsageModel.create(dto);
  }
}
