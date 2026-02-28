import { ApiKeyService } from '../../src/apikeys/apikeys.service';
import { ApiKeyRepository } from '../../src/apikeys/apikeys.repository';
import { ProjectService } from '../../src/projects/projects.service';
import { NotFoundError, ForbiddenError } from '../../src/errors';

jest.mock('../../src/apikeys/apikeys.repository');
jest.mock('../../src/projects/projects.service');

const baseKey = {
  _id: { toString: () => 'newkeyid' },
  projectId: { toString: () => 'proj1' },
  publicPart: 'abcdef12',
  label: '',
  revoked: false,
  createdAt: new Date(),
};

// Module yuklenince ApiKeyService modulu kendi singleton'larini olusturur.
// jest.mock auto-mock ile siniflari mocklar; instances[0] o singleton'lardir.
const repo = (ApiKeyRepository as jest.MockedClass<typeof ApiKeyRepository>).mock.instances[0] as jest.Mocked<ApiKeyRepository>;
const projectSvc = (ProjectService as jest.MockedClass<typeof ProjectService>).mock.instances[0] as jest.Mocked<ProjectService>;

describe('ApiKeyService', () => {
  let service: ApiKeyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ApiKeyService();
    projectSvc.assertOwnership.mockResolvedValue({} as never);
  });

  describe('listKeys', () => {
    it('proje sahiplik kontrolu yapilir', async () => {
      repo.findByProject.mockResolvedValue([]);
      await service.listKeys('user1', 'proj1');
      expect(projectSvc.assertOwnership).toHaveBeenCalledWith('user1', 'proj1');
    });

    it('key listesini dondurur', async () => {
      repo.findByProject.mockResolvedValue([
        { ...baseKey, label: 'prod' },
        { ...baseKey, _id: { toString: () => 'key2' }, label: 'staging' },
      ] as never);

      const result = await service.listKeys('user1', 'proj1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('newkeyid');
      expect(result[1].id).toBe('key2');
    });

    it('response\'da secretHash yoktur', async () => {
      repo.findByProject.mockResolvedValue([{ ...baseKey, secretHash: 'hidden' }] as never);
      const result = await service.listKeys('user1', 'proj1');
      expect(result[0]).not.toHaveProperty('secretHash');
    });

    it('assertOwnership hata firlatirsa listKeys de hata firlatir', async () => {
      projectSvc.assertOwnership.mockRejectedValue(new NotFoundError('Proje bulunamadi'));
      await expect(service.listKeys('user1', 'nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('createKey', () => {
    it('sk_live_ prefix ile key olusturur', async () => {
      repo.create.mockResolvedValue(baseKey as never);
      const result = await service.createKey('user1', 'proj1', { label: 'test' });
      expect(result.key).toMatch(/^sk_live_/);
    });

    it('key formati sk_live_<publicPart>.<secretPart> seklindedir', async () => {
      repo.create.mockResolvedValue(baseKey as never);
      const result = await service.createKey('user1', 'proj1', {});
      const parts = result.key.replace('sk_live_', '').split('.');
      expect(parts).toHaveLength(2);
      expect(parts[0].length).toBeGreaterThan(0);
      expect(parts[1].length).toBeGreaterThan(0);
    });

    it('DB\'ye secretHash kaydedilir, plaintext kaydedilmez', async () => {
      repo.create.mockResolvedValue(baseKey as never);
      await service.createKey('user1', 'proj1', {});

      const createCall = repo.create.mock.calls[0][0];
      expect(createCall).toHaveProperty('secretHash');
      expect(createCall).not.toHaveProperty('secretPart');
      expect(createCall).not.toHaveProperty('key');
    });

    it('her cagrida farkli key uretilir', async () => {
      repo.create.mockResolvedValue(baseKey as never);
      const r1 = await service.createKey('user1', 'proj1', {});
      const r2 = await service.createKey('user1', 'proj1', {});
      expect(r1.key).not.toBe(r2.key);
    });

    it('label undefined ise bos string kaydedilir', async () => {
      repo.create.mockResolvedValue(baseKey as never);
      await service.createKey('user1', 'proj1', {});
      expect(repo.create.mock.calls[0][0].label).toBe('');
    });
  });

  describe('revokeKey', () => {
    it('key bulunamazsa NotFoundError firlatir', async () => {
      repo.findByIdAndProject.mockResolvedValue(null);
      await expect(service.revokeKey('user1', 'proj1', 'key1')).rejects.toThrow(NotFoundError);
    });

    it('key zaten revoke edilmisse ForbiddenError firlatir', async () => {
      repo.findByIdAndProject.mockResolvedValue({ revoked: true } as never);
      await expect(service.revokeKey('user1', 'proj1', 'key1')).rejects.toThrow(ForbiddenError);
    });

    it('basarili revocation\'da revoke cagirilir', async () => {
      repo.findByIdAndProject.mockResolvedValue({ revoked: false } as never);
      repo.revoke.mockResolvedValue(undefined as never);

      await service.revokeKey('user1', 'proj1', 'key1');
      expect(repo.revoke).toHaveBeenCalledWith('key1', 'proj1');
    });

    it('proje sahiplik kontrolu yapilir', async () => {
      repo.findByIdAndProject.mockResolvedValue({ revoked: false } as never);
      repo.revoke.mockResolvedValue(undefined as never);

      await service.revokeKey('user1', 'proj1', 'key1');
      expect(projectSvc.assertOwnership).toHaveBeenCalledWith('user1', 'proj1');
    });
  });
});
