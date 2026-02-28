import { AuthService } from '../../src/auth/auth.service';
import { UserRepository } from '../../src/users/users.repository';
import { AuthRepository } from '../../src/auth/auth.repository';
import bcrypt from 'bcrypt';
import redis from '../../src/config/redis';
import { ValidationError, UnauthorizedError } from '../../src/errors';

jest.mock('../../src/users/users.repository');
jest.mock('../../src/auth/auth.repository');
jest.mock('../../src/config/redis', () => ({
  __esModule: true,
  default: { get: jest.fn(), setex: jest.fn(), del: jest.fn() },
}));
jest.mock('../../src/auth/services/token.service', () => ({
  generateAccessToken: jest.fn().mockReturnValue('mock_access_token'),
}));
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn(),
}));

const mockRedis = redis as jest.Mocked<typeof redis>;

const mockUser = {
  _id: { toString: () => 'user123' },
  email: 'test@test.com',
  passwordHash: 'hashed_password',
};

// Module yuklenince AuthService modulu kendi repo singleton'larini olusturur.
// jest.mock auto-mock ile siniflari mocklar; instances[0] o singleton'lardir.
const userRepo = (UserRepository as jest.MockedClass<typeof UserRepository>).mock.instances[0] as jest.Mocked<UserRepository>;
const authRepo = (AuthRepository as jest.MockedClass<typeof AuthRepository>).mock.instances[0] as jest.Mocked<AuthRepository>;

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Her beforeEach'te yeni service → yeni repo instance'lari
    service = new AuthService();
    authRepo.createRefreshToken.mockResolvedValue({} as never);
  });

  describe('register', () => {
    it('email zaten kullanımdaysa ValidationError firlatir', async () => {
      userRepo.findByEmail.mockResolvedValue(mockUser as never);
      await expect(
        service.register({ email: 'test@test.com', password: 'password123' })
      ).rejects.toThrow(ValidationError);
    });

    it('basarili kayıtta user ve token dondurur', async () => {
      userRepo.findByEmail.mockResolvedValue(null);
      userRepo.create.mockResolvedValue(mockUser as never);

      const result = await service.register({ email: 'test@test.com', password: 'password123' });

      expect(result.user.id).toBe('user123');
      expect(result.user.email).toBe('test@test.com');
      expect(result.token.accessToken).toBe('mock_access_token');
      expect(result.token.refreshToken.length).toBeGreaterThan(0);
    });

    it('basarili kayıtta refresh token MongoDB\'ye yazilir', async () => {
      userRepo.findByEmail.mockResolvedValue(null);
      userRepo.create.mockResolvedValue(mockUser as never);

      await service.register({ email: 'test@test.com', password: 'password123' });

      expect(authRepo.createRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user123' })
      );
    });
  });

  describe('login', () => {
    it('kullanici bulunamazsa UnauthorizedError firlatir', async () => {
      userRepo.findByEmail.mockResolvedValue(null);
      await expect(
        service.login({ email: 'test@test.com', password: 'password123' })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('sifre yanlissa UnauthorizedError firlatir', async () => {
      userRepo.findByEmail.mockResolvedValue(mockUser as never);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(
        service.login({ email: 'test@test.com', password: 'wrong' })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('basarili giriste accessToken ve refreshToken dondurur', async () => {
      userRepo.findByEmail.mockResolvedValue(mockUser as never);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({ email: 'test@test.com', password: 'password123' });

      expect(result.response.accessToken).toBe('mock_access_token');
      expect(result.refreshToken.length).toBeGreaterThan(0);
    });

    it('basarili giriste refresh token MongoDB\'ye yazilir', async () => {
      userRepo.findByEmail.mockResolvedValue(mockUser as never);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login({ email: 'test@test.com', password: 'password123' });

      expect(authRepo.createRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user123' })
      );
    });
  });

  describe('refresh', () => {
    it('refresh token yoksa UnauthorizedError firlatir', async () => {
      await expect(service.refresh(undefined)).rejects.toThrow(UnauthorizedError);
    });

    it('token DB\'de yoksa UnauthorizedError firlatir', async () => {
      (mockRedis.get as jest.Mock).mockResolvedValue(null);
      authRepo.findRefreshToken.mockResolvedValue(null);
      await expect(service.refresh('some_token')).rejects.toThrow(UnauthorizedError);
    });

    it('token suresi dolmussa UnauthorizedError firlatir', async () => {
      (mockRedis.get as jest.Mock).mockResolvedValue(null);
      authRepo.findRefreshToken.mockResolvedValue({
        userId: { toString: () => 'user123' },
        expiresAt: new Date(Date.now() - 1000),
      } as never);
      await expect(service.refresh('some_token')).rejects.toThrow(UnauthorizedError);
    });

    it('Redis cache hit\'te MongoDB\'ye gitmez', async () => {
      (mockRedis.get as jest.Mock).mockResolvedValue('user123');
      userRepo.findById.mockResolvedValue(mockUser as never);

      await service.refresh('some_token');

      expect(authRepo.findRefreshToken).not.toHaveBeenCalled();
    });

    it('gecerli token ile yeni accessToken dondurur', async () => {
      (mockRedis.get as jest.Mock).mockResolvedValue(null);
      authRepo.findRefreshToken.mockResolvedValue({
        userId: { toString: () => 'user123' },
        expiresAt: new Date(Date.now() + 86400000),
      } as never);
      userRepo.findById.mockResolvedValue(mockUser as never);
      (mockRedis.setex as jest.Mock).mockResolvedValue('OK');

      const result = await service.refresh('some_token');
      expect(result.accessToken).toBe('mock_access_token');
    });
  });

  describe('logout', () => {
    it('refresh token verilirse MongoDB\'den silinir', async () => {
      authRepo.revokeRefreshToken.mockResolvedValue(undefined as never);
      (mockRedis.del as jest.Mock).mockResolvedValue(1);

      await service.logout('some_access_token', 'some_refresh_token');

      expect(authRepo.revokeRefreshToken).toHaveBeenCalled();
    });

    it('refresh token verilmezse revokeRefreshToken cagirilmaz', async () => {
      await service.logout('some_access_token', undefined);
      expect(authRepo.revokeRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('logoutAll', () => {
    it('kullanicinin tum refresh token\'lari silinir', async () => {
      authRepo.revokeAllUserTokens.mockResolvedValue(undefined as never);

      await service.logoutAll('user123', 'some_access_token');

      expect(authRepo.revokeAllUserTokens).toHaveBeenCalledWith('user123');
    });
  });
});
