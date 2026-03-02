import { StatsService } from '../../src/stats/stats.service';
import { ProjectService } from '../../src/projects/projects.service';
import { UsageRepository } from '../../src/usage/usage.repository';
import { NotFoundError } from '../../src/errors';

jest.mock('../../src/projects/projects.service');
jest.mock('../../src/usage/usage.repository');

const projectSvc = (ProjectService as jest.MockedClass<typeof ProjectService>)
  .mock.instances[0] as jest.Mocked<ProjectService>;

const usageRepo = (UsageRepository as jest.MockedClass<typeof UsageRepository>)
  .mock.instances[0] as jest.Mocked<UsageRepository>;

const emptyStats = {
  totalRequests: 0,
  successCount: 0,
  rateLimitHits: 0,
  avgLatencyMs: 0,
  requestsByDay: [],
  topKeys: [],
};

describe('StatsService', () => {
  let service: StatsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StatsService();
    projectSvc.assertOwnership.mockResolvedValue({} as never);
  });

  // ── Ownership ────────────────────────────────────────────────────────────────

  describe('assertOwnership', () => {
    it('proje sahiplik kontrolu yapilir', async () => {
      usageRepo.getStats.mockResolvedValue(emptyStats);

      await service.getProjectStats('user1', 'proj1', '7d');

      expect(projectSvc.assertOwnership).toHaveBeenCalledWith('user1', 'proj1');
    });

    it('assertOwnership hata firlatirsa iletilir', async () => {
      projectSvc.assertOwnership.mockRejectedValue(new NotFoundError('Proje bulunamadı'));

      await expect(service.getProjectStats('user1', 'bad-proj', '7d')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  // ── successRate ───────────────────────────────────────────────────────────────

  describe('successRate hesaplama', () => {
    it('hic istek yoksa successRate 0 dondurur', async () => {
      usageRepo.getStats.mockResolvedValue(emptyStats);

      const result = await service.getProjectStats('user1', 'proj1', '7d');

      expect(result.successRate).toBe(0);
    });

    it('tum istekler basariliysa successRate 1 dondurur', async () => {
      usageRepo.getStats.mockResolvedValue({
        ...emptyStats,
        totalRequests: 100,
        successCount: 100,
      });

      const result = await service.getProjectStats('user1', 'proj1', '7d');

      expect(result.successRate).toBe(1);
    });

    it('successRate 3 ondalik basamakla yuvarlanir', async () => {
      usageRepo.getStats.mockResolvedValue({
        ...emptyStats,
        totalRequests: 3,
        successCount: 2,
      });

      const result = await service.getProjectStats('user1', 'proj1', '7d');

      // 2/3 = 0.6666... → 0.667
      expect(result.successRate).toBe(0.667);
    });
  });

  // ── range → since ────────────────────────────────────────────────────────────

  describe('range parametresi', () => {
    it('7d range icin ~7 gunluk since hesaplanir', async () => {
      usageRepo.getStats.mockResolvedValue(emptyStats);

      const before = Date.now();
      await service.getProjectStats('user1', 'proj1', '7d');
      const after = Date.now();

      const sincePassed = usageRepo.getStats.mock.calls[0][1] as Date;
      const diffMs = Date.now() - sincePassed.getTime();

      // 7 gun = 604800000 ms — küçük zaman farkına tolerans
      expect(diffMs).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000 - (after - before));
      expect(diffMs).toBeLessThan(7 * 24 * 60 * 60 * 1000 + 1000);
    });

    it('1d range icin ~1 gunluk since hesaplanir', async () => {
      usageRepo.getStats.mockResolvedValue(emptyStats);

      await service.getProjectStats('user1', 'proj1', '1d');

      const sincePassed = usageRepo.getStats.mock.calls[0][1] as Date;
      const diffMs = Date.now() - sincePassed.getTime();

      expect(diffMs).toBeLessThan(1 * 24 * 60 * 60 * 1000 + 1000);
    });

    it('30d range icin ~30 gunluk since hesaplanir', async () => {
      usageRepo.getStats.mockResolvedValue(emptyStats);

      await service.getProjectStats('user1', 'proj1', '30d');

      const sincePassed = usageRepo.getStats.mock.calls[0][1] as Date;
      const diffMs = Date.now() - sincePassed.getTime();

      expect(diffMs).toBeLessThan(30 * 24 * 60 * 60 * 1000 + 1000);
    });
  });

  // ── response mapping ──────────────────────────────────────────────────────────

  describe('response mapping', () => {
    it('usageRepo verisini dogru sekilde donusturur', async () => {
      usageRepo.getStats.mockResolvedValue({
        totalRequests: 500,
        successCount: 480,
        rateLimitHits: 8,
        avgLatencyMs: 3.5,
        requestsByDay: [{ date: '2026-03-01', count: 100, errors: 3 }],
        topKeys: [{ keyId: 'key1', keyType: 'api' as const, requests: 200 }],
      });

      const result = await service.getProjectStats('user1', 'proj1', '7d');

      expect(result.totalRequests).toBe(500);
      expect(result.rateLimitHits).toBe(8);
      expect(result.avgLatencyMs).toBe(3.5);
      expect(result.requestsByDay).toHaveLength(1);
      expect(result.requestsByDay[0].date).toBe('2026-03-01');
      expect(result.topKeys).toHaveLength(1);
      expect(result.topKeys[0].keyId).toBe('key1');
      expect(result.topKeys[0].keyType).toBe('api');
    });

    it('projectId usageRepo.getStats e iletilir', async () => {
      usageRepo.getStats.mockResolvedValue(emptyStats);

      await service.getProjectStats('user1', 'proj1', '7d');

      expect(usageRepo.getStats).toHaveBeenCalledWith('proj1', expect.any(Date));
    });
  });
});
