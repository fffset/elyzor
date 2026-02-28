import 'dotenv/config';
import type { SignOptions } from 'jsonwebtoken';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: requireEnv('MONGO_URI'),
  redisUrl: requireEnv('REDIS_URL'),
  jwt: {
    secret: requireEnv('JWT_SECRET'),
    accessExpiresIn: requireEnv('JWT_ACCESS_EXPIRES_IN') as SignOptions['expiresIn'],
    refreshExpiresIn: requireEnv('JWT_REFRESH_EXPIRES_IN') as SignOptions['expiresIn'],
  },
  rateLimit: {
    ip: {
      max: Number(requireEnv('RATE_LIMIT_IP_MAX')),
      windowSeconds: Number(requireEnv('RATE_LIMIT_IP_WINDOW_SECONDS')),
    },
    key: {
      max: Number(requireEnv('RATE_LIMIT_KEY_MAX')),
      windowSeconds: Number(requireEnv('RATE_LIMIT_KEY_WINDOW_SECONDS')),
    },
  },
  bcryptRounds: Number(requireEnv('BCRYPT_ROUNDS')),
};
