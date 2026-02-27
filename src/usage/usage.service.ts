import { UsageRepository } from './usage.repository';
import { UsageLogDto } from './usage.types';

const usageRepo = new UsageRepository();

export class UsageService {
  log(dto: UsageLogDto): void {
    usageRepo.create(dto).catch((err: Error) => {
      console.error('Kullanım logu kaydedilemedi:', err.message);
    });
  }
}
