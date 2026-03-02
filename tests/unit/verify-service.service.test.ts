import { VerifyServiceService } from '../../src/verify-service/verify-service.service';
import { ServiceRepository } from '../../src/services/services.repository';
import { UsageService } from '../../src/usage/usage.service';

jest.mock('../../src/services/services.repository');
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

import redis from '../../src/config/redis';

const mockRedis = redis as jest.Mocked<typeof redis>;

// Gecerli bir svc_live_ key
const VALID_HEADER = 'Bearer svc_live_abc12345.secret9876';

function setupRateLimit(current = 5, ttl = 55): void {
  (mockRedis.incr as jest.Mock).mockResolvedValue(current);
  (mockRedis.expire as jest.Mock).mockResolvedValue(1);
  (mockRedis.ttl as jest.Mock).mockResolvedValue(ttl);
}

const serviceRepo = (ServiceRepository as jest.MockedClass<typeof ServiceRepository>)
  .mock.instances[0] as jest.Mocked<ServiceRepository>;
const usageSvc = (UsageService as jest.MockedClass<typeof UsageService>)
  .mock.instances[0] as jest.Mocked<UsageService>;

describe('VerifyServiceService', () => {
  let service: VerifyServiceService;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    service = new VerifyServiceService();
    usageSvc.log.mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // ── Format hatalari ──────────────────────────────────────────────────────────

  describe('format hatalari', () => {
    it('Authorization header yoksa invalid_key dondurur', async () => {
      const result = await service.verify(undefined, '127.0.0.1');
      expect(result).toEqual({ valid: false, error: 'invalid_key' });
    });

    it('Bearer formati yanlissa invalid_key dondurur', async () => {
      const result = await service.verify('Basic abc123', '127.0.0.1');
      expect(result).toEqual({ valid: false, error: 'invalid_key' });
    });

    it('sk_live_ prefix\'li key reddedilir — sadece svc_live_ kabul edilir', async () => {
      const result = await service.verify('Bearer sk_live_abc12345.secret9876', '127.0.0.1');
      expect(result).toEqual({ valid: false, error: 'invalid_key' });
      expect(serviceRepo.findByKeyHash).not.toHaveBeenCalled();
    });

    it('nokta ayirici yoksa invalid_key dondurur', async () => {
      const result = await service.verify('Bearer svc_live_nodothere', '127.0.0.1');
      expect(result).toEqual({ valid: false, error: 'invalid_key' });
    });
  });

  // ── Cache miss → DB lookup ───────────────────────────────────────────────────

  describe('cache miss DB lookup', () => {
    it('Redis\'te yoksa DB\'ye bakar', async () => {
      (mockRedis.get as jest.Mock).mockResolvedValue(null);
      serviceRepo.findByKeyHash.mockResolvedValue(null);

      const result = await service.verify(VALID_HEADER, '127.0.0.1');
      expect(result).toEqual({ valid: false, error: 'invalid_key' });
      expect(serviceRepo.findByKeyHash).toHaveBeenCalled();
    });

    it('DB\'de servis yoksa setex cagirilmaz', async () => {
      (mockRedis.get as jest.Mock).mockResolvedValue(null);
      serviceRepo.findByKeyHash.mockResolvedValue(null);

      await service.verify(VALID_HEADER, '127.0.0.1');

      expect(mockRedis.setex).not.toHaveBeenCalled();
    });
  });

  // ── Cache hit ────────────────────────────────────────────────────────────────

  describe('cache hit', () => {
    it('servis revoke edilmisse service_revoked dondurur', async () => {
      const svcData = {
        id: 'svc1',
        name: 'api-gateway',
        projectId: 'proj1',
        revokedAt: new Date().toISOString(),
      };
      (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(svcData));

      const result = await service.verify(VALID_HEADER, '127.0.0.1');
      expect(result).toEqual({ valid: false, error: 'service_revoked' });
    });

    it('service_revoked durumunda DB\'ye gidilmez', async () => {
      const svcData = { id: 'svc1', name: 'api-gateway', projectId: 'proj1', revokedAt: new Date().toISOString() };
      (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(svcData));

      await service.verify(VALID_HEADER, '127.0.0.1');
      expect(serviceRepo.findByKeyHash).not.toHaveBeenCalled();
    });

    it('rate limit asilmissa rate_limit_exceeded dondurur', async () => {
      const svcData = { id: 'svc1', name: 'api-gateway', projectId: 'proj1' };
      (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(svcData));
      setupRateLimit(101, 42);

      const result = await service.verify(VALID_HEADER, '127.0.0.1');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('rate_limit_exceeded');
      expect(result.retryAfter).toBe(42);
    });

    it('gecerli key icin valid:true ve service objesi dondurur', async () => {
      const svcData = { id: 'svc1', name: 'api-gateway', projectId: 'proj1' };
      (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(svcData));
      setupRateLimit(5, 55);

      const result = await service.verify(VALID_HEADER, '127.0.0.1');
      expect(result.valid).toBe(true);
      expect(result.projectId).toBe('proj1');
      expect(result.service).toEqual({ id: 'svc1', name: 'api-gateway' });
      expect(result.rateLimitRemaining).toBeDefined();
    });
  });

  // ── Usage logging ─────────────────────────────────────────────────────────────

  describe('usage log', () => {
    it('service_revoked durumunda usage log serviceId ile cagirilir', async () => {
      const svcData = { id: 'svc1', name: 'api-gateway', projectId: 'proj1', revokedAt: new Date().toISOString() };
      (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(svcData));

      await service.verify(VALID_HEADER, '127.0.0.1');
      expect(usageSvc.log).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'revoked', projectId: 'proj1', serviceId: 'svc1' })
      );
    });

    it('basarili dogrulamada usage log serviceId ile cagirilir, apiKeyId olmaz', async () => {
      const svcData = { id: 'svc1', name: 'api-gateway', projectId: 'proj1' };
      (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(svcData));
      setupRateLimit();

      await service.verify(VALID_HEADER, '127.0.0.1');
      const logCall = usageSvc.log.mock.calls[0][0];
      expect(logCall.serviceId).toBe('svc1');
      expect(logCall).not.toHaveProperty('apiKeyId');
    });
  });

  // ── Hata senaryolari ──────────────────────────────────────────────────────────

  describe('hata senaryolari', () => {
    it('Redis cokerse invalid_key dondurur (fail closed)', async () => {
      (mockRedis.get as jest.Mock).mockRejectedValue(new Error('Redis connection refused'));

      const result = await service.verify(VALID_HEADER, '127.0.0.1');
      expect(result).toEqual({ valid: false, error: 'invalid_key' });
    });

    it('rate limit Redis hatasi varsa invalid_key dondurur (fail closed)', async () => {
      const svcData = { id: 'svc1', name: 'api-gateway', projectId: 'proj1' };
      (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(svcData));
      (mockRedis.incr as jest.Mock).mockRejectedValue(new Error('Redis timeout'));

      const result = await service.verify(VALID_HEADER, '127.0.0.1');
      expect(result).toEqual({ valid: false, error: 'invalid_key' });
    });
  });
});
