import 'dotenv/config';
import type { SignOptions } from 'jsonwebtoken';

export const env = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/elyzor',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev_secret_change_in_production',
    accessExpiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ?? '15m') as SignOptions['expiresIn'],
    refreshExpiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ?? '7d') as SignOptions['expiresIn'],
  },
  rateLimit: {
    ip: {
      max: Number(process.env.RATE_LIMIT_IP_MAX) || 60,
      windowSeconds: Number(process.env.RATE_LIMIT_IP_WINDOW_SECONDS) || 60,
    },
    key: {
      max: Number(process.env.RATE_LIMIT_KEY_MAX) || 100,
      windowSeconds: Number(process.env.RATE_LIMIT_KEY_WINDOW_SECONDS) || 60,
    },
  },
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 12,
};
