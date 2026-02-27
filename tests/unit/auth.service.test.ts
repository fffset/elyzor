import { AuthService } from '../../src/auth/auth.service';
import { UserRepository } from '../../src/users/users.repository';
import { ValidationError, UnauthorizedError } from '../../src/errors';

jest.mock('../../src/users/users.repository');

const mockFindByEmail = jest.fn();
const mockCreate = jest.fn();

(UserRepository as jest.MockedClass<typeof UserRepository>).mockImplementation(() => ({
  findByEmail: mockFindByEmail,
  findById: jest.fn(),
  create: mockCreate,
}));

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService();
  });

  describe('register', () => {
    it('email ve şifre yoksa ValidationError fırlatır', async () => {
      await expect(service.register({ email: '', password: '' })).rejects.toThrow(ValidationError);
    });

    it('şifre 8 karakterden kısaysa ValidationError fırlatır', async () => {
      await expect(service.register({ email: 'test@test.com', password: '123' })).rejects.toThrow(
        ValidationError
      );
    });

    it('email zaten varsa ValidationError fırlatır', async () => {
      mockFindByEmail.mockResolvedValue({ email: 'test@test.com' });
      await expect(
        service.register({ email: 'test@test.com', password: 'password123' })
      ).rejects.toThrow(ValidationError);
    });

    it('başarılı kayıtta kullanıcı döndürür', async () => {
      mockFindByEmail.mockResolvedValue(null);
      mockCreate.mockResolvedValue({ _id: { toString: () => '123' }, email: 'test@test.com' });

      const result = await service.register({ email: 'test@test.com', password: 'password123' });
      expect(result.email).toBe('test@test.com');
      expect(result.id).toBe('123');
    });
  });

  describe('login', () => {
    it('kullanıcı bulunamazsa UnauthorizedError fırlatır', async () => {
      mockFindByEmail.mockResolvedValue(null);
      await expect(
        service.login({ email: 'test@test.com', password: 'password123' })
      ).rejects.toThrow(UnauthorizedError);
    });
  });
});
