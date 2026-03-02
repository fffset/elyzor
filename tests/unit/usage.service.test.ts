import { UsageRepository } from '../../src/usage/usage.repository';

jest.mock('../../src/usage/usage.repository');

import { UsageService } from '../../src/usage/usage.service';

// UsageService modülü yüklenince usageRepo bir kez new'lenir (modül-level const).
// jest.clearAllMocks() instances'ı temizler, bu yüzden afterEach'te değil
// modül yüklendikten hemen sonra yakala.
// Not: clearAllMocks kullanamazsak mockClear() ile sadece çağrı geçmişini sıfırlarız.
const usageRepo = (UsageRepository as jest.MockedClass<typeof UsageRepository>)
  .mock.instances[0] as jest.Mocked<UsageRepository>;

const mockDto = {
  projectId: 'proj1',
  apiKeyId: 'key1',
  result: 'success' as const,
  latencyMs: 5,
  ip: '127.0.0.1',
};

describe('UsageService', () => {
  let service: UsageService;

  beforeEach(() => {
    // clearAllMocks instances'ı temizler — onun yerine mock methodları tek tek sıfırla
    usageRepo.create.mockReset();
    service = new UsageService();
  });

  it('log() → usageRepo.create çağrılır (fire and forget)', () => {
    usageRepo.create.mockResolvedValue(undefined as never);
    service.log(mockDto);
    expect(usageRepo.create).toHaveBeenCalledWith(mockDto);
  });

  it('log() → repo hata fırlatırsa console.error çağrılır ama exception fırlatmaz', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    usageRepo.create.mockRejectedValue(new Error('DB down'));

    service.log(mockDto);

    // fire-and-forget — promise resolve olmasını bekle
    await new Promise((resolve) => setImmediate(resolve));

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('log() senkron dönüş yapar — void döner', () => {
    usageRepo.create.mockResolvedValue(undefined as never);
    const result = service.log(mockDto);
    expect(result).toBeUndefined();
  });
});
