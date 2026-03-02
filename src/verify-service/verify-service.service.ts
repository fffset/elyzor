import crypto from 'crypto';
import { ServiceRepository } from '../services/services.repository';
import { UsageService } from '../usage/usage.service';
import redis from '../config/redis';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { VerifyServiceResult, CachedServiceData } from './verify-service.types';

const serviceRepo = new ServiceRepository();
const usageService = new UsageService();

const CACHE_TTL = 300;

export class VerifyServiceService {
  private extractKey(authHeader: string | undefined): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const key = authHeader.slice(7).trim();
    if (!key || key.length > 200) return null;
    return key;
  }

  private parseKey(fullKey: string): { publicPart: string; secretPart: string } | null {
    if (!fullKey.startsWith('svc_live_')) return null;
    const withoutPrefix = fullKey.slice('svc_live_'.length);
    const dotIndex = withoutPrefix.indexOf('.');
    if (dotIndex === -1) return null;
    const publicPart = withoutPrefix.slice(0, dotIndex);
    const secretPart = withoutPrefix.slice(dotIndex + 1);
    if (!publicPart || !secretPart) return null;
    return { publicPart, secretPart };
  }

  private hashSecret(secretPart: string): string {
    return crypto.createHash('sha256').update(secretPart).digest('hex');
  }

  private timingSafeCompare(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  }

  private cacheKey(keyHash: string): string {
    return `svckey:${keyHash}`;
  }

  private async lookupFromDb(keyHash: string): Promise<CachedServiceData | null> {
    const service = await serviceRepo.findByKeyHash(keyHash);
    if (!service) return null;

    if (!this.timingSafeCompare(keyHash, service.keyHash)) return null;

    const cached: CachedServiceData = {
      id: service._id.toString(),
      name: service.name,
      projectId: service.projectId.toString(),
      revokedAt: service.revokedAt?.toISOString(),
    };

    await redis.setex(this.cacheKey(keyHash), CACHE_TTL, JSON.stringify(cached));
    return cached;
  }

  private async checkRateLimit(
    projectId: string
  ): Promise<{ exceeded: boolean; remaining: number; retryAfter: number }> {
    const rateLimitKey = `ratelimit:svc:${projectId}`;
    const { max, windowSeconds } = env.rateLimit.key;

    const current = await redis.incr(rateLimitKey);
    if (current === 1) {
      await redis.expire(rateLimitKey, windowSeconds);
    }

    const ttl = await redis.ttl(rateLimitKey);
    const remaining = Math.max(0, max - current);

    return { exceeded: current > max, remaining, retryAfter: ttl };
  }

  async verify(authHeader: string | undefined, ip: string): Promise<VerifyServiceResult> {
    const start = Date.now();

    const fullKey = this.extractKey(authHeader);
    if (!fullKey) return { valid: false, error: 'invalid_key' };

    const parsed = this.parseKey(fullKey);
    if (!parsed) return { valid: false, error: 'invalid_key' };

    const keyHash = this.hashSecret(parsed.secretPart);

    let serviceData: CachedServiceData | null;
    try {
      const cached = await redis.get(this.cacheKey(keyHash));
      serviceData = cached
        ? (JSON.parse(cached) as CachedServiceData)
        : await this.lookupFromDb(keyHash);
    } catch (err) {
      logger.error({ err }, 'Service verification error');
      return { valid: false, error: 'invalid_key' };
    }

    if (!serviceData) {
      return { valid: false, error: 'invalid_key' };
    }

    if (serviceData.revokedAt != null) {
      usageService.log({
        projectId: serviceData.projectId,
        serviceId: serviceData.id,
        result: 'revoked',
        latencyMs: Date.now() - start,
        ip,
      });
      return { valid: false, error: 'service_revoked' };
    }

    let rateLimit: { exceeded: boolean; remaining: number; retryAfter: number };
    try {
      rateLimit = await this.checkRateLimit(serviceData.projectId);
    } catch (err) {
      logger.error({ err }, 'Service rate limit error');
      return { valid: false, error: 'invalid_key' };
    }

    if (rateLimit.exceeded) {
      usageService.log({
        projectId: serviceData.projectId,
        serviceId: serviceData.id,
        result: 'rate_limited',
        latencyMs: Date.now() - start,
        ip,
      });
      return { valid: false, error: 'rate_limit_exceeded', retryAfter: rateLimit.retryAfter };
    }

    usageService.log({
      projectId: serviceData.projectId,
      serviceId: serviceData.id,
      result: 'success',
      latencyMs: Date.now() - start,
      ip,
    });

    return {
      valid: true,
      projectId: serviceData.projectId,
      service: { id: serviceData.id, name: serviceData.name },
      rateLimitRemaining: rateLimit.remaining,
    };
  }
}
