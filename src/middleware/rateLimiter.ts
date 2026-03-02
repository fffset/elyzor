import { Request, Response, NextFunction } from 'express';
import redis from '../config/redis';
import { env } from '../config/env';

export async function ipRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const rateLimitKey = `ratelimit:ip:${ip}`;
  const { max, windowSeconds } = env.rateLimit.ip;

  let current: number;
  try {
    current = await redis.incr(rateLimitKey);
    if (current === 1) {
      await redis.expire(rateLimitKey, windowSeconds);
    }
  } catch {
    // Fail open: Redis hatası IP limitini durdurmaz
    // Key/service rate limit service katmanında fail closed'dır (güvenlik kritik)
    next();
    return;
  }

  if (current > max) {
    const ttl = await redis.ttl(rateLimitKey).catch(() => windowSeconds);
    res.status(429).json({ valid: false, error: 'rate_limit_exceeded', retryAfter: ttl });
    return;
  }

  next();
}
