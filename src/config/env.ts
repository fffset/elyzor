import 'dotenv/config';
import type { SignOptions } from 'jsonwebtoken';

export const env = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/elyzor',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET ?? 'dev_secret_change_in_production',
  jwtExpiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as SignOptions['expiresIn'],
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX) || 100,
  rateLimitWindowSeconds: Number(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60,
};
