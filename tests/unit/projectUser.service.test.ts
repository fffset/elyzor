import { ProjectUserService } from '../../src/project-users/project-users.service';
import { ProjectUserRepository } from '../../src/project-users/project-users.repository';
import { AuthRepository } from '../../src/auth/auth.repository';
import { ProjectService } from '../../src/projects/projects.service';
import { ValidationError, UnauthorizedError, NotFoundError, ForbiddenError } from '../../src/errors';
import bcrypt from 'bcrypt';

jest.mock('../../src/project-users/project-users.repository');
jest.mock('../../src/auth/auth.repository');
jest.mock('../../src/projects/projects.service');
jest.mock('../../src/config/redis', () => ({
  __esModule: true,
  default: { get: jest.fn(), setex: jest.fn(), del: jest.fn() },
}));
jest.mock('../../src/auth/services/token.service', () => ({
  generateProjectUserAccessToken: jest.fn().mockReturnValue('mock_project_access_token'),
}));
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn(),
}));
jest.mock('jsonwebtoken', () => ({
  decode: jest.fn().mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 900 }),
}));

const projectUserRepo = (ProjectUserRepository as jest.MockedClass<typeof ProjectUserRepository>).mock.instances[0] as jest.Mocked<ProjectUserRepository>;
const authRepo = (AuthRepository as jest.MockedClass<typeof AuthRepository>).mock.instances[0] as jest.Mocked<AuthRepository>;
const projectSvc = (ProjectService as jest.MockedClass<typeof ProjectService>).mock.instances[0] as jest.Mocked<ProjectService>;

const mockProjectUser = {
  _id: { toString: () => 'projectuser123' },
  email: 'alice@test.com',
  projectId: { toString: () => 'proj1' },
  passwordHash: 'hashed_password',
};

const mockStoredToken = {
  userId: { toString: () => 'projectuser123' },
  tokenHash: 'somehash',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  revokedAt: null,
  userType: 'project' as const,
};

describe('ProjectUserService', () => {
  let service: ProjectUserService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProjectUserService();
    authRepo.createRefreshToken.mockResolvedValue({} as never);
  });

  describe('register', () => {
    it('ownership check basarisizsa hata firlatir', async () => {
      projectSvc.assertOwnership.mockRejectedValue(new Error('Proje bulunamadı'));

      await expect(
        service.register('platform123', 'proj1', { email: 'alice@test.com', password: 'password123' })
      ).rejects.toThrow();
    });

    it('email zaten kayitliysa ValidationError firlatir', async () => {
      projectSvc.assertOwnership.mockResolvedValue(undefined as never);
      projectUserRepo.findByEmailAndProject.mockResolvedValue(mockProjectUser as never);

      await expect(
        service.register('platform123', 'proj1', { email: 'alice@test.com', password: 'password123' })
      ).rejects.toThrow(ValidationError);
    });

    it('basarili kayitta user + accessToken + refreshToken dondurur', async () => {
      projectSvc.assertOwnership.mockResolvedValue(undefined as never);
      projectUserRepo.findByEmailAndProject.mockResolvedValue(null);
      projectUserRepo.create.mockResolvedValue(mockProjectUser as never);

      const result = await service.register('platform123', 'proj1', { email: 'alice@test.com', password: 'password123' });

      expect(result.response.user.id).toBe('projectuser123');
      expect(result.response.user.email).toBe('alice@test.com');
      expect(result.response.user.projectId).toBe('proj1');
      expect(result.response.accessToken).toBe('mock_project_access_token');
      expect(result.refreshToken.length).toBeGreaterThan(0);
    });

    it('refresh token MongoDB\'ye userType: project ile yazilir', async () => {
      projectSvc.assertOwnership.mockResolvedValue(undefined as never);
      projectUserRepo.findByEmailAndProject.mockResolvedValue(null);
      projectUserRepo.create.mockResolvedValue(mockProjectUser as never);

      await service.register('platform123', 'proj1', { email: 'alice@test.com', password: 'password123' });

      expect(authRepo.createRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({ userType: 'project', userId: 'projectuser123' })
      );
    });

    it('ValidationError mesaji kullanici varligini sizdirmaz', async () => {
      projectSvc.assertOwnership.mockResolvedValue(undefined as never);
      projectUserRepo.findByEmailAndProject.mockResolvedValue(mockProjectUser as never);

      await expect(
        service.register('platform123', 'proj1', { email: 'alice@test.com', password: 'password123' })
      ).rejects.toThrow('Kayıt tamamlanamadı');
    });
  });

  describe('login', () => {
    it('ownership check basarisizsa hata firlatir', async () => {
      projectSvc.assertOwnership.mockRejectedValue(new Error('Proje bulunamadı'));

      await expect(
        service.login('platform123', 'proj1', { email: 'alice@test.com', password: 'password123' })
      ).rejects.toThrow();
    });

    it('kullanici bulunamazsa UnauthorizedError firlatir', async () => {
      projectSvc.assertOwnership.mockResolvedValue(undefined as never);
      projectUserRepo.findByEmailAndProject.mockResolvedValue(null);

      await expect(
        service.login('platform123', 'proj1', { email: 'alice@test.com', password: 'password123' })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('sifre yanlissa UnauthorizedError firlatir', async () => {
      projectSvc.assertOwnership.mockResolvedValue(undefined as never);
      projectUserRepo.findByEmailAndProject.mockResolvedValue(mockProjectUser as never);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login('platform123', 'proj1', { email: 'alice@test.com', password: 'wrong' })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('basarili giriste accessToken ve refreshToken dondurur', async () => {
      projectSvc.assertOwnership.mockResolvedValue(undefined as never);
      projectUserRepo.findByEmailAndProject.mockResolvedValue(mockProjectUser as never);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login('platform123', 'proj1', { email: 'alice@test.com', password: 'password123' });

      expect(result.response.accessToken).toBe('mock_project_access_token');
      expect(result.refreshToken.length).toBeGreaterThan(0);
    });

    it('basarili giriste refresh token MongoDB\'ye userType: project ile yazilir', async () => {
      projectSvc.assertOwnership.mockResolvedValue(undefined as never);
      projectUserRepo.findByEmailAndProject.mockResolvedValue(mockProjectUser as never);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login('platform123', 'proj1', { email: 'alice@test.com', password: 'password123' });

      expect(authRepo.createRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({ userType: 'project' })
      );
    });
  });

  describe('refresh', () => {
    it('rawRefreshToken yoksa UnauthorizedError firlatir', async () => {
      await expect(service.refresh(undefined, 'proj1')).rejects.toThrow(UnauthorizedError);
    });

    it('DB\'de token bulunamazsa UnauthorizedError firlatir', async () => {
      authRepo.findRefreshTokenAny.mockResolvedValue(null);

      await expect(service.refresh('sometoken', 'proj1')).rejects.toThrow(UnauthorizedError);
    });

    it('token suresi dolmussa UnauthorizedError firlatir', async () => {
      authRepo.findRefreshTokenAny.mockResolvedValue({
        ...mockStoredToken,
        expiresAt: new Date(Date.now() - 1000),
      } as never);

      await expect(service.refresh('sometoken', 'proj1')).rejects.toThrow(UnauthorizedError);
    });

    it('revoke edilmis token gelirse token theft → revokeAllUserTokens ve UnauthorizedError', async () => {
      authRepo.findRefreshTokenAny.mockResolvedValue({
        ...mockStoredToken,
        revokedAt: new Date(),
      } as never);
      authRepo.revokeAllUserTokens.mockResolvedValue(undefined as never);

      await expect(service.refresh('sometoken', 'proj1')).rejects.toThrow(UnauthorizedError);
      expect(authRepo.revokeAllUserTokens).toHaveBeenCalledWith('projectuser123');
    });

    it('userType platform olan token icin UnauthorizedError firlatir', async () => {
      authRepo.findRefreshTokenAny.mockResolvedValue({
        ...mockStoredToken,
        userType: 'platform',
      } as never);

      await expect(service.refresh('sometoken', 'proj1')).rejects.toThrow(UnauthorizedError);
    });

    it('project user bulunamazsa UnauthorizedError firlatir', async () => {
      authRepo.findRefreshTokenAny.mockResolvedValue(mockStoredToken as never);
      projectUserRepo.findById.mockResolvedValue(null);

      await expect(service.refresh('sometoken', 'proj1')).rejects.toThrow(UnauthorizedError);
    });

    it('token farkli projeye aitse UnauthorizedError firlatir', async () => {
      authRepo.findRefreshTokenAny.mockResolvedValue(mockStoredToken as never);
      projectUserRepo.findById.mockResolvedValue({
        ...mockProjectUser,
        projectId: { toString: () => 'OTHER_PROJECT' },
      } as never);

      await expect(service.refresh('sometoken', 'proj1')).rejects.toThrow(UnauthorizedError);
    });

    it('basarili refresh → eski token revoke edilir, yeni token cifti doner', async () => {
      authRepo.findRefreshTokenAny.mockResolvedValue(mockStoredToken as never);
      projectUserRepo.findById.mockResolvedValue(mockProjectUser as never);
      authRepo.revokeRefreshToken.mockResolvedValue(undefined as never);

      const result = await service.refresh('sometoken', 'proj1');

      expect(authRepo.revokeRefreshToken).toHaveBeenCalled();
      expect(authRepo.createRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({ userType: 'project', userId: 'projectuser123' })
      );
      expect(result.accessToken).toBe('mock_project_access_token');
      expect(result.refreshToken.length).toBeGreaterThan(0);
    });
  });

  describe('logout', () => {
    it('access token blacklist\'e eklenir', async () => {
      const redis = (await import('../../src/config/redis')).default as jest.Mocked<typeof import('../../src/config/redis').default>;

      await service.logout('mock_access_token', undefined);

      expect(redis.setex).toHaveBeenCalled();
    });

    it('refresh token varsa revoke edilir', async () => {
      authRepo.revokeRefreshToken.mockResolvedValue(undefined as never);

      await service.logout('mock_access_token', 'somerefreshtoken');

      expect(authRepo.revokeRefreshToken).toHaveBeenCalled();
    });

    it('refresh token yoksa revokeRefreshToken cagirilmaz', async () => {
      await service.logout('mock_access_token', undefined);

      expect(authRepo.revokeRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('logoutAll', () => {
    it('ownership check basarisizsa hata firlatir', async () => {
      projectSvc.assertOwnership.mockRejectedValue(new Error('Proje bulunamadı'));

      await expect(
        service.logoutAll('platform123', 'proj1', 'projectuser123', 'mock_access_token')
      ).rejects.toThrow();
    });

    it('project user bulunamazsa NotFoundError firlatir', async () => {
      projectSvc.assertOwnership.mockResolvedValue(undefined as never);
      projectUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.logoutAll('platform123', 'proj1', 'projectuser123', 'mock_access_token')
      ).rejects.toThrow(NotFoundError);
    });

    it('kullanici baska projeye aitse ForbiddenError firlatir', async () => {
      projectSvc.assertOwnership.mockResolvedValue(undefined as never);
      projectUserRepo.findById.mockResolvedValue({
        ...mockProjectUser,
        projectId: { toString: () => 'OTHER_PROJECT' },
      } as never);

      await expect(
        service.logoutAll('platform123', 'proj1', 'projectuser123', 'mock_access_token')
      ).rejects.toThrow(ForbiddenError);
    });

    it('basarili logoutAll → access token blacklist\'e eklenir ve tum tokenlar revoke edilir', async () => {
      projectSvc.assertOwnership.mockResolvedValue(undefined as never);
      projectUserRepo.findById.mockResolvedValue(mockProjectUser as never);
      authRepo.revokeAllUserTokens.mockResolvedValue(undefined as never);
      const redis = (await import('../../src/config/redis')).default as jest.Mocked<typeof import('../../src/config/redis').default>;

      await service.logoutAll('platform123', 'proj1', 'projectuser123', 'mock_access_token');

      expect(redis.setex).toHaveBeenCalled();
      expect(authRepo.revokeAllUserTokens).toHaveBeenCalledWith('projectuser123');
    });

    it('cross-project korumasi: baska projedeki kullanici reddedilir', async () => {
      projectSvc.assertOwnership.mockResolvedValue(undefined as never);
      projectUserRepo.findById.mockResolvedValue({
        ...mockProjectUser,
        projectId: { toString: () => 'proj2' },
      } as never);

      await expect(
        service.logoutAll('platform123', 'proj1', 'projectuser123', 'mock_access_token')
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
