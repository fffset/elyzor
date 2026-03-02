import http from 'http';
import mongoose from 'mongoose';
import app from './app';
import { connectMongo } from './config/db';
import redis from './config/redis';
import { env } from './config/env';

async function start(): Promise<void> {
  await connectMongo();
  await redis.connect();

  const server = http.createServer(app);

  server.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.warn(`Elyzor çalışıyor: http://localhost:${env.port}`);
  });

  async function shutdown(signal: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.warn(`${signal} alındı — graceful shutdown başlıyor`);

    server.close(async () => {
      try {
        await mongoose.disconnect();
        await redis.quit();
        // eslint-disable-next-line no-console
        console.warn('Kapatıldı.');
        process.exit(0);
      } catch (err) {
        console.error('Shutdown sırasında hata:', (err as Error).message);
        process.exit(1);
      }
    });

    // 10 saniye içinde kapanmazsa zorla kapat
    setTimeout(() => {
      console.error('Graceful shutdown zaman aşımı — zorla kapatılıyor');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

start().catch((err: Error) => {
  console.error('Sunucu başlatılamadı:', err.message);
  process.exit(1);
});
