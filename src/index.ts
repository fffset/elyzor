import app from './app';
import { connectMongo } from './config/db';
import redis from './config/redis';
import { env } from './config/env';

async function start(): Promise<void> {
  await connectMongo();
  await redis.connect();

  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.warn(`Elyzor çalışıyor: http://localhost:${env.port}`);
  });
}

start().catch((err: Error) => {
  console.error('Sunucu başlatılamadı:', err.message);
  process.exit(1);
});
