import { ApiKeyService } from '../../src/apikeys/apikeys.service';
import { ApiKeyRepository } from '../../src/apikeys/apikeys.repository';
import { ProjectService } from '../../src/projects/projects.service';
import { NotFoundError, ForbiddenError } from '../../src/errors';

jest.mock('../../src/apikeys/apikeys.repository');
jest.mock('../../src/projects/projects.service');

const mockAssertOwnership = jest.fn();
(ProjectService as jest.MockedClass<typeof ProjectService>).mockImplementation(() => ({
  listProjects: jest.fn(),
  createProject: jest.fn(),
  deleteProject: jest.fn(),
  assertOwnership: mockAssertOwnership,
}));

const mockFindByIdAndProject = jest.fn();
const mockRevoke = jest.fn();
const mockCreate = jest.fn();
const mockFindByProject = jest.fn();

(ApiKeyRepository as jest.MockedClass<typeof ApiKeyRepository>).mockImplementation(() => ({
  findByProject: mockFindByProject,
  findByIdAndProject: mockFindByIdAndProject,
  findBySecretHash: jest.fn(),
  create: mockCreate,
  revoke: mockRevoke,
}));

describe('ApiKeyService', () => {
  let service: ApiKeyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ApiKeyService();
  });

  describe('revokeKey', () => {
    it('key bulunamazsa NotFoundError fırlatır', async () => {
      mockAssertOwnership.mockResolvedValue({});
      mockFindByIdAndProject.mockResolvedValue(null);

      await expect(service.revokeKey('user1', 'proj1', 'key1')).rejects.toThrow(NotFoundError);
    });

    it('key zaten revoke edilmişse ForbiddenError fırlatır', async () => {
      mockAssertOwnership.mockResolvedValue({});
      mockFindByIdAndProject.mockResolvedValue({ revoked: true });

      await expect(service.revokeKey('user1', 'proj1', 'key1')).rejects.toThrow(ForbiddenError);
    });

    it('başarılı revocation\'da revoke çağrılır', async () => {
      mockAssertOwnership.mockResolvedValue({});
      mockFindByIdAndProject.mockResolvedValue({ revoked: false });
      mockRevoke.mockResolvedValue(undefined);

      await service.revokeKey('user1', 'proj1', 'key1');
      expect(mockRevoke).toHaveBeenCalledWith('key1', 'proj1');
    });
  });

  describe('createKey', () => {
    it('sk_live_ prefix ile key oluşturur', async () => {
      mockAssertOwnership.mockResolvedValue({});
      mockCreate.mockResolvedValue({
        _id: { toString: () => 'newkeyid' },
        projectId: { toString: () => 'proj1' },
        publicPart: 'abcdef12',
        label: '',
        revoked: false,
        createdAt: new Date(),
      });

      const result = await service.createKey('user1', 'proj1', { label: 'test' });
      expect(result.key).toMatch(/^sk_live_/);
    });
  });
});
