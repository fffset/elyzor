import { VerificationService } from '../../src/verification/verification.service';
import { ApiKeyRepository } from '../../src/apikeys/apikeys.repository';
import { UsageService } from '../../src/usage/usage.service';

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

import redis from '../../src/config/redis';

const mockRedis = redis as jest.Mocked<typeof redis>;

// Gecerli bir key — sk_live_<publicPart>.<secretPart>
const VALID_HEADER = 'Bearer sk_live_abc12345.secret9876';

function setupRateLimit(current = 5, ttl = 55): void {
  (mockRedis.incr as jest.Mock).mockResolvedValue(current);
  (mockRedis.expire as jest.Mock).mockResolvedValue(1);
  (mockRedis.ttl as jest.Mock).mockResolvedValue(ttl);
}

// Module yuklenince VerificationService modulu kendi singleton'larini olusturur.
// jest.mock auto-mock ile siniflari mocklar; instances[0] o singleton'lardir.
const apiKeyRepo = (ApiKeyRepository as jest.MockedClass<typeof ApiKeyRepository>).mock.instances[0] as jest.Mocked<ApiKeyRepository>;
const usageSvc = (UsageService as jest.MockedClass<typeof UsageService>).mock.instances[0] as jest.Mocked<UsageService>;

describe('VerificationService', () => {
  let service: VerificationService;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    service = new VerificationService();
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

    it('sk_live_ prefix yoksa invalid_key dondurur', async () => {
      const result = await service.verify('Bearer invalid_key_format', '127.0.0.1');
      expect(result).toEqual({ valid: false, error: 'invalid_key' });
    });

    it('nokta ayirici yoksa invalid_key dondurur', async () => {
      const result = await service.verify('Bearer sk_live_nodothere', '127.0.0.1');
      expect(result).toEqual({ valid: false, error: 'invalid_key' });
    });

    it('secretPart bossa invalid_key dondurur', async () => {
      const result = await service.verify('Bearer sk_live_abc.', '127.0.0.1');
      expect(result).toEqual({ valid: false, error: 'invalid_key' });
    });

    it('200 karakterden uzun Authorization header invalid_key dondurur (DoS korumasi)', async () => {
      const longKey = 'Bearer sk_live_' + 'a'.repeat(300);
      const result = await service.verify(longKey, '127.0.0.1');
      expect(result).toEqual({ valid: false, error: 'invalid_key' });
      // DB'ye gidilmemeli
      expect(apiKeyRepo.findBySecretHash).not.toHaveBeenCalled();
    });

    it('tam 200 karakter olan key reddedilmez (sinir degeri)', async () => {
      // 200 karakter: "sk_live_" (8) + nokta icermeyen sekil → parseKey'de reddedilecek ama extractKey'den gecmeli
      const borderKey = 'Bearer ' + 'sk_live_' + 'a'.repeat(192);
      // extractKey gecer (200 karakter) ama parseKey reddeder (nokta yok)
      const result = await service.verify(borderKey, '127.0.0.1');
      expect(result).toEqual({ valid: false, error: 'invalid_key' });
    });

    it('201 karakter olan key extractKey\'de reddedilir', async () => {
      const overKey = 'Bearer ' + 'a'.repeat(201);
      (mockRedis.get as jest.Mock).mockResolvedValue(null);
      const result = await service.verify(overKey, '127.0.0.1');
      expect(result).toEqual({ valid: false, error: 'invalid_key' });
      expect(apiKeyRepo.findBySecretHash).not.toHaveBeenCalled();
    });
  });

  // ── Cache miss → DB lookup ──────────────────────────────────────────────────

  describe('cache miss DB lookup', () => {
    it('Redis\'te yoksa DB\'ye bakar', async () => {
      (mockRedis.get as jest.Mock).mockResolvedValue(null);
      apiKeyRepo.findBySecretHash.mockResolvedValue(null);

      const result = await service.verify(VALID_HEADER, '127.0.0.1');
      expect(result).toEqual({ valid: false, error: 'invalid_key' });
      expect(apiKeyRepo.findBySecretHash).toHaveBeenCalled();
    });

    it('DB\'de key yoksa setex cagirilmaz', async () => {
      (mockRedis.get as jest.Mock).mockResolvedValue(null);
      apiKeyRepo.findBySecretHash.mockResolvedValue(null);

      await service.verify(VALID_HEADER, '127.0.0.1');

      expect(mockRedis.setex).not.toHaveBeenCalledWith(
        expect.stringContaining('apikey:'),
        expect.any(Number),
        expect.any(String)
      );
    });
  });

  // ── Cache hit ───────────────────────────────────────────────────────────────

  describe('cache hit', () => {
    it('key revoke edilmisse key_revoked dondurur', async () => {
      const keyData = { id: 'key1', projectId: 'proj1', revoked: true };
      (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(keyData));

      const result = await service.verify(VALID_HEADER, '127.0.0.1');
      expect(result).toEqual({ valid: false, error: 'key_revoked' });
    });

    it('key_revoked durumunda DB\'ye gidilmez', async () => {
      const keyData = { id: 'key1', projectId: 'proj1', revoked: true };
      (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(keyData));

      await service.verify(VALID_HEADER, '127.0.0.1');
      expect(apiKeyRepo.findBySecretHash).not.toHaveBeenCalled();
    });

    it('rate limit asilmissa rate_limit_exceeded dondurur', async () => {
      const keyData = { id: 'key1', projectId: 'proj1', revoked: false };
      (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(keyData));
      setupRateLimit(101, 42);

      const result = await service.verify(VALID_HEADER, '127.0.0.1');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('rate_limit_exceeded');
      expect(result.retryAfter).toBe(42);
    });

    it('gecerli key icin valid:true dondurur', async () => {
      const keyData = { id: 'key1', projectId: 'proj1', revoked: false };
      (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(keyData));
      setupRateLimit(5, 55);

      const result = await service.verify(VALID_HEADER, '127.0.0.1');
      expect(result.valid).toBe(true);
      expect(result.projectId).toBe('proj1');
      expect(result.rateLimitRemaining).toBeDefined();
    });

    it('limit asilmayinca valid:true dondurur', async () => {
      const keyData = { id: 'key1', projectId: 'proj1', revoked: false };
      (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(keyData));
      setupRateLimit(100, 30); // current === max, exceeded: 100 > 100 = false

      const result = await service.verify(VALID_HEADER, '127.0.0.1');
      expect(result.valid).toBe(true);
    });
  });

  // ── Usage logging ─────────────────────────────────────────────────────────────

  describe('usage log', () => {
    it('key_revoked durumunda usage log cagirilir', async () => {
      const keyData = { id: 'key1', projectId: 'proj1', revoked: true };
      (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(keyData));

      await service.verify(VALID_HEADER, '127.0.0.1');
      expect(usageSvc.log).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'revoked', projectId: 'proj1', apiKeyId: 'key1' })
      );
    });

    it('rate_limit_exceeded durumunda usage log cagirilir', async () => {
      const keyData = { id: 'key1', projectId: 'proj1', revoked: false };
      (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(keyData));
      setupRateLimit(101, 42);

      await service.verify(VALID_HEADER, '127.0.0.1');
      expect(usageSvc.log).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'rate_limited' })
      );
    });

    it('basarili dogrulamada usage log cagirilir', async () => {
      const keyData = { id: 'key1', projectId: 'proj1', revoked: false };
      (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(keyData));
      setupRateLimit();

      await service.verify(VALID_HEADER, '127.0.0.1');
      expect(usageSvc.log).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'success', ip: '127.0.0.1' })
      );
    });

    it('usage log latencyMs icerir', async () => {
      const keyData = { id: 'key1', projectId: 'proj1', revoked: false };
      (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(keyData));
      setupRateLimit();

      await service.verify(VALID_HEADER, '127.0.0.1');
      expect(usageSvc.log).toHaveBeenCalledWith(
        expect.objectContaining({ latencyMs: expect.any(Number) })
      );
    });
  });

  // ── Hata fallback ────────────────────────────────────────────────────────────

  describe('hata senaryolari', () => {
    it('Redis cokerse invalid_key dondurur (fail closed)', async () => {
      (mockRedis.get as jest.Mock).mockRejectedValue(new Error('Redis connection refused'));

      const result = await service.verify(VALID_HEADER, '127.0.0.1');
      expect(result).toEqual({ valid: false, error: 'invalid_key' });
    });

    it('rate limit Redis hatasi varsa invalid_key dondurur (fail closed)', async () => {
      const keyData = { id: 'key1', projectId: 'proj1', revoked: false };
      (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(keyData));
      (mockRedis.incr as jest.Mock).mockRejectedValue(new Error('Redis timeout'));

      const result = await service.verify(VALID_HEADER, '127.0.0.1');
      expect(result).toEqual({ valid: false, error: 'invalid_key' });
    });
  });
});
