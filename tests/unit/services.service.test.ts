import { ServicesService } from '../../src/services/services.service';
import { ServiceRepository } from '../../src/services/services.repository';
import { ProjectService } from '../../src/projects/projects.service';
import { NotFoundError, ForbiddenError, ValidationError } from '../../src/errors';

jest.mock('../../src/services/services.repository');
jest.mock('../../src/projects/projects.service');
jest.mock('../../src/config/redis', () => ({
  __esModule: true,
  default: { del: jest.fn() },
}));

import redis from '../../src/config/redis';

const mockRedis = redis as jest.Mocked<typeof redis>;

const repo = (ServiceRepository as jest.MockedClass<typeof ServiceRepository>)
  .mock.instances[0] as jest.Mocked<ServiceRepository>;
const projectSvc = (ProjectService as jest.MockedClass<typeof ProjectService>)
  .mock.instances[0] as jest.Mocked<ProjectService>;

const baseService = {
  _id: { toString: () => 'svc1' },
  projectId: { toString: () => 'proj1' },
  name: 'api-gateway',
  publicPart: 'abcdef12',
  keyHash: 'abc123hash',
  revokedAt: undefined,
  createdAt: new Date(),
};

describe('ServicesService', () => {
  let service: ServicesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ServicesService();
    projectSvc.assertOwnership.mockResolvedValue({} as never);
    (mockRedis.del as jest.Mock).mockResolvedValue(1);
  });

  // ── listServices ──────────────────────────────────────────────────────────────

  describe('listServices', () => {
    it('proje sahiplik kontrolu yapilir', async () => {
      repo.findByProject.mockResolvedValue([]);
      await service.listServices('user1', 'proj1');
      expect(projectSvc.assertOwnership).toHaveBeenCalledWith('user1', 'proj1');
    });

    it('servis listesini dondurur', async () => {
      repo.findByProject.mockResolvedValue([
        { ...baseService },
        { ...baseService, _id: { toString: () => 'svc2' }, name: 'billing-service' },
      ] as never);

      const result = await service.listServices('user1', 'proj1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('svc1');
      expect(result[1].name).toBe('billing-service');
    });

    it('response\'da keyHash yoktur', async () => {
      repo.findByProject.mockResolvedValue([{ ...baseService, keyHash: 'secret_hash' }] as never);
      const result = await service.listServices('user1', 'proj1');
      expect(result[0]).not.toHaveProperty('keyHash');
    });

    it('assertOwnership hata firlatirsa listServices de hata firlatir', async () => {
      projectSvc.assertOwnership.mockRejectedValue(new NotFoundError('Proje bulunamadi'));
      await expect(service.listServices('user1', 'bad-proj')).rejects.toThrow(NotFoundError);
    });
  });

  // ── createService ─────────────────────────────────────────────────────────────

  describe('createService', () => {
    it('svc_live_ prefix ile key olusturur', async () => {
      repo.findByNameAndProject.mockResolvedValue(null);
      repo.create.mockResolvedValue(baseService as never);

      const result = await service.createService('user1', 'proj1', { name: 'api-gateway' });
      expect(result.key).toMatch(/^svc_live_/);
    });

    it('key formati svc_live_<publicPart>.<secretPart> seklindedir', async () => {
      repo.findByNameAndProject.mockResolvedValue(null);
      repo.create.mockResolvedValue(baseService as never);

      const result = await service.createService('user1', 'proj1', { name: 'api-gateway' });
      const parts = result.key.replace('svc_live_', '').split('.');
      expect(parts).toHaveLength(2);
      expect(parts[0].length).toBeGreaterThan(0);
      expect(parts[1].length).toBeGreaterThan(0);
    });

    it('DB\'ye keyHash kaydedilir, plaintext kaydedilmez', async () => {
      repo.findByNameAndProject.mockResolvedValue(null);
      repo.create.mockResolvedValue(baseService as never);

      await service.createService('user1', 'proj1', { name: 'api-gateway' });

      const createCall = repo.create.mock.calls[0][0];
      expect(createCall).toHaveProperty('keyHash');
      expect(createCall).not.toHaveProperty('secretPart');
      expect(createCall).not.toHaveProperty('key');
    });

    it('her cagrida farkli key uretilir', async () => {
      repo.findByNameAndProject.mockResolvedValue(null);
      repo.create.mockResolvedValue(baseService as never);

      const r1 = await service.createService('user1', 'proj1', { name: 'svc-a' });
      const r2 = await service.createService('user1', 'proj1', { name: 'svc-b' });
      expect(r1.key).not.toBe(r2.key);
    });

    it('duplicate name -> ValidationError firlatir', async () => {
      repo.findByNameAndProject.mockResolvedValue(baseService as never);

      await expect(
        service.createService('user1', 'proj1', { name: 'api-gateway' })
      ).rejects.toThrow(ValidationError);
    });

    it('assertOwnership hata firlatirsa createService de hata firlatir', async () => {
      projectSvc.assertOwnership.mockRejectedValue(new NotFoundError('Proje bulunamadi'));

      await expect(
        service.createService('user1', 'bad-proj', { name: 'api-gateway' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ── revokeService ─────────────────────────────────────────────────────────────

  describe('revokeService', () => {
    it('servis bulunamazsa NotFoundError firlatir', async () => {
      repo.findByIdAndProject.mockResolvedValue(null);

      await expect(service.revokeService('user1', 'proj1', 'svc1')).rejects.toThrow(NotFoundError);
    });

    it('servis zaten revoke edilmisse ForbiddenError firlatir', async () => {
      repo.findByIdAndProject.mockResolvedValue({
        ...baseService,
        revokedAt: new Date(),
      } as never);

      await expect(service.revokeService('user1', 'proj1', 'svc1')).rejects.toThrow(ForbiddenError);
    });

    it('basarili revocation\'da repo.revoke cagirilir', async () => {
      repo.findByIdAndProject.mockResolvedValue(baseService as never);
      repo.revoke.mockResolvedValue(undefined as never);

      await service.revokeService('user1', 'proj1', 'svc1');
      expect(repo.revoke).toHaveBeenCalledWith('svc1', 'proj1');
    });

    it('Redis cache temizlenir', async () => {
      repo.findByIdAndProject.mockResolvedValue(baseService as never);
      repo.revoke.mockResolvedValue(undefined as never);

      await service.revokeService('user1', 'proj1', 'svc1');
      expect(mockRedis.del).toHaveBeenCalledWith(`svckey:${baseService.keyHash}`);
    });

    it('proje sahiplik kontrolu yapilir', async () => {
      repo.findByIdAndProject.mockResolvedValue(baseService as never);
      repo.revoke.mockResolvedValue(undefined as never);

      await service.revokeService('user1', 'proj1', 'svc1');
      expect(projectSvc.assertOwnership).toHaveBeenCalledWith('user1', 'proj1');
    });
  });
});
