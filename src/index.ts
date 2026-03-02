import http from 'http';
import mongoose from 'mongoose';
import app from './app';
import { connectMongo } from './config/db';
import redis from './config/redis';
import { env } from './config/env';
import { logger } from './config/logger';

async function start(): Promise<void> {
  await connectMongo();
  await redis.connect();

  const server = http.createServer(app);

  server.listen(env.port, () => {
    logger.info(`Elyzor running on http://localhost:${env.port}`);
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info(`${signal} received — graceful shutdown starting`);

    server.close(async () => {
      try {
        await mongoose.disconnect();
        await redis.quit();
        logger.info('Server closed');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Shutdown error');
        process.exit(1);
      }
    });

    setTimeout(() => {
      logger.error('Graceful shutdown timeout — force exit');
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
  logger.error({ err }, 'Server startup failed');
  process.exit(1);
});
