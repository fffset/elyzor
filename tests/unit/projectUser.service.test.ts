import { ProjectUserService } from '../../src/project-users/project-users.service';
import { ProjectUserRepository } from '../../src/project-users/project-users.repository';
import { AuthRepository } from '../../src/auth/auth.repository';
import { ProjectService } from '../../src/projects/projects.service';
import { ValidationError, UnauthorizedError } from '../../src/errors';
import bcrypt from 'bcrypt';

jest.mock('../../src/project-users/project-users.repository');
jest.mock('../../src/auth/auth.repository');
jest.mock('../../src/projects/projects.service');
jest.mock('../../src/config/redis', () => ({
  __esModule: true,
  default: { get: jest.fn(), setex: jest.fn() },
}));
jest.mock('../../src/auth/services/token.service', () => ({
  generateProjectUserAccessToken: jest.fn().mockReturnValue('mock_project_access_token'),
}));
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn(),
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
});
