import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

const redis = new Redis(env.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

redis.on('error', (err: Error) => {
  logger.error({ err }, 'Redis connection error');
});

export default redis;
