import crypto from 'crypto';
import { ApiKeyRepository } from '../apikeys/apikeys.repository';
import { UsageService } from '../usage/usage.service';
import redis from '../config/redis';
import { env } from '../config/env';
import { VerifyResult, CachedKeyData } from './verification.types';

const apiKeyRepo = new ApiKeyRepository();
const usageService = new UsageService();

const CACHE_TTL = 300;

export class VerificationService {
  private extractKey(authHeader: string | undefined): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.slice(7).trim() || null;
  }

  private parseKey(fullKey: string): { publicPart: string; secretPart: string } | null {
    if (!fullKey.startsWith('sk_live_')) return null;
    const withoutPrefix = fullKey.slice('sk_live_'.length);
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

  private cacheKey(secretHash: string): string {
    return `apikey:${secretHash}`;
  }

  private async lookupFromDb(secretHash: string): Promise<CachedKeyData | null> {
    const key = await apiKeyRepo.findBySecretHash(secretHash);
    if (!key) return null;

    const cached: CachedKeyData = {
      id: key._id.toString(),
      projectId: key.projectId.toString(),
      revoked: key.revoked,
    };

    await redis.setex(this.cacheKey(secretHash), CACHE_TTL, JSON.stringify(cached));
    return cached;
  }

  private async checkRateLimit(
    projectId: string
  ): Promise<{ exceeded: boolean; remaining: number; retryAfter: number }> {
    const rateLimitKey = `ratelimit:${projectId}`;
    const { rateLimitMax, rateLimitWindowSeconds } = env;

    const current = await redis.incr(rateLimitKey);
    if (current === 1) {
      await redis.expire(rateLimitKey, rateLimitWindowSeconds);
    }

    const ttl = await redis.ttl(rateLimitKey);
    const remaining = Math.max(0, rateLimitMax - current);

    return { exceeded: current > rateLimitMax, remaining, retryAfter: ttl };
  }

  async verify(authHeader: string | undefined, ip: string): Promise<VerifyResult> {
    const start = Date.now();

    const fullKey = this.extractKey(authHeader);
    if (!fullKey) {
      return { valid: false, error: 'invalid_key' };
    }

    const parsed = this.parseKey(fullKey);
    if (!parsed) {
      return { valid: false, error: 'invalid_key' };
    }

    const secretHash = this.hashSecret(parsed.secretPart);

    let keyData: CachedKeyData | null;
    try {
      const cached = await redis.get(this.cacheKey(secretHash));
      keyData = cached ? (JSON.parse(cached) as CachedKeyData) : await this.lookupFromDb(secretHash);
    } catch (err) {
      console.error('Verification altyapı hatası:', (err as Error).message);
      return { valid: false, error: 'invalid_key' };
    }

    if (!keyData) {
      return { valid: false, error: 'invalid_key' };
    }

    if (keyData.revoked) {
      usageService.log({
        projectId: keyData.projectId,
        apiKeyId: keyData.id,
        result: 'revoked',
        latencyMs: Date.now() - start,
        ip,
      });
      return { valid: false, error: 'key_revoked' };
    }

    let rateLimit: { exceeded: boolean; remaining: number; retryAfter: number };
    try {
      rateLimit = await this.checkRateLimit(keyData.projectId);
    } catch (err) {
      console.error('Rate limit hatası:', (err as Error).message);
      return { valid: false, error: 'invalid_key' };
    }

    if (rateLimit.exceeded) {
      usageService.log({
        projectId: keyData.projectId,
        apiKeyId: keyData.id,
        result: 'rate_limited',
        latencyMs: Date.now() - start,
        ip,
      });
      return { valid: false, error: 'rate_limit_exceeded', retryAfter: rateLimit.retryAfter };
    }

    usageService.log({
      projectId: keyData.projectId,
      apiKeyId: keyData.id,
      result: 'success',
      latencyMs: Date.now() - start,
      ip,
    });

    return {
      valid: true,
      projectId: keyData.projectId,
      rateLimitRemaining: rateLimit.remaining,
    };
  }
}
