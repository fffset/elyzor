import mongoose from 'mongoose';
import { connectMongo } from '../../../src/config/db';
import redis from '../../../src/config/redis';

export async function setupIntegration(): Promise<void> {
  await connectMongo();
  await redis.connect();
}

export async function teardownIntegration(): Promise<void> {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await redis.flushdb();
  await redis.quit();
}

export async function clearCollections(): Promise<void> {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  await redis.flushdb();
}
