import { UsageRepository } from './usage.repository';
import { UsageLogDto } from './usage.types';
import { logger } from '../config/logger';

const usageRepo = new UsageRepository();

export class UsageService {
  log(dto: UsageLogDto): void {
    usageRepo.create(dto).catch((err: Error) => {
      logger.error({ err }, 'Usage log write failed');
    });
  }
}
