import Redis from 'ioredis';
import { env } from './env';

const redis = new Redis(env.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

redis.on('error', (err: Error) => {
  console.error('Redis bağlantı hatası:', err.message);
});

export default redis;
