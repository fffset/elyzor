import { VerificationService } from '../../src/verification/verification.service';
import { ApiKeyRepository } from '../../src/apikeys/apikeys.repository';
import { UsageService } from '../../src/usage/usage.service';
import redis from '../../src/config/redis';

jest.mock('../../src/apikeys/apikeys.repository');
jest.mock('../../src/usage/usage.service');
jest.mock('../../src/config/redis', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    setex: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
  },
}));

const mockFindBySecretHash = jest.fn();
(ApiKeyRepository as jest.MockedClass<typeof ApiKeyRepository>).mockImplementation(() => ({
  findByProject: jest.fn(),
  findByIdAndProject: jest.fn(),
  findBySecretHash: mockFindBySecretHash,
  create: jest.fn(),
  revoke: jest.fn(),
}));

const mockLog = jest.fn();
(UsageService as jest.MockedClass<typeof UsageService>).mockImplementation(() => ({
  log: mockLog,
}));

const mockRedis = redis as jest.Mocked<typeof redis>;

describe('VerificationService', () => {
  let service: VerificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VerificationService();
  });

  it('Authorization header yoksa invalid_key döndürür', async () => {
    const result = await service.verify(undefined, '127.0.0.1');
    expect(result).toEqual({ valid: false, error: 'invalid_key' });
  });

  it('Bearer formatı yanlışsa invalid_key döndürür', async () => {
    const result = await service.verify('Basic abc123', '127.0.0.1');
    expect(result).toEqual({ valid: false, error: 'invalid_key' });
  });

  it('sk_live_ prefix yoksa invalid_key döndürür', async () => {
    const result = await service.verify('Bearer invalid_key_format', '127.0.0.1');
    expect(result).toEqual({ valid: false, error: 'invalid_key' });
  });

  it('key DB\'de bulunamazsa invalid_key döndürür', async () => {
    (mockRedis.get as jest.Mock).mockResolvedValue(null);
    mockFindBySecretHash.mockResolvedValue(null);

    const result = await service.verify('Bearer sk_live_abc123.secret456', '127.0.0.1');
    expect(result).toEqual({ valid: false, error: 'invalid_key' });
  });

  it('key revoke edilmişse key_revoked döndürür', async () => {
    const keyData = { id: 'key1', projectId: 'proj1', revoked: true };
    (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(keyData));

    const result = await service.verify('Bearer sk_live_abc123.secret456', '127.0.0.1');
    expect(result).toEqual({ valid: false, error: 'key_revoked' });
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'revoked' })
    );
  });

  it('rate limit aşılmışsa rate_limit_exceeded döndürür', async () => {
    const keyData = { id: 'key1', projectId: 'proj1', revoked: false };
    (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(keyData));
    (mockRedis.incr as jest.Mock).mockResolvedValue(101);
    (mockRedis.ttl as jest.Mock).mockResolvedValue(42);

    const result = await service.verify('Bearer sk_live_abc123.secret456', '127.0.0.1');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('rate_limit_exceeded');
  });

  it('geçerli key için valid:true döndürür', async () => {
    const keyData = { id: 'key1', projectId: 'proj1', revoked: false };
    (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(keyData));
    (mockRedis.incr as jest.Mock).mockResolvedValue(5);
    (mockRedis.ttl as jest.Mock).mockResolvedValue(55);

    const result = await service.verify('Bearer sk_live_abc123.secret456', '127.0.0.1');
    expect(result.valid).toBe(true);
    expect(result.projectId).toBe('proj1');
  });
});
