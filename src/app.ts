import express from 'express';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import authRouter from './auth/auth.router';
import projectsRouter from './projects/projects.router';
import apiKeysRouter from './apikeys/apikeys.router';
import servicesRouter from './services/services.router';
import statsRouter from './stats/stats.router';
import verificationRouter from './verification/verification.router';
import verifyServiceRouter from './verify-service/verify-service.router';
import { errorHandler } from './middleware/errorHandler';
import { ipRateLimiter } from './middleware/rateLimiter';
import { swaggerOptions } from './config/swagger';
import redis from './config/redis';

const app = express();

app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());

if (process.env.NODE_ENV !== 'production') {
  const swaggerSpec = swaggerJsdoc(swaggerOptions);
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

app.use('/v1/auth', authRouter);
app.use('/v1/projects', projectsRouter);
app.use('/v1/projects/:projectId/keys', apiKeysRouter);
app.use('/v1/projects/:projectId/services', servicesRouter);
app.use('/v1/projects/:projectId/stats', statsRouter);
app.use('/v1/verify', ipRateLimiter);
app.use('/v1/verify/service', verifyServiceRouter);
app.use('/v1/verify', verificationRouter);

app.get('/v1/health', async (_req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  let redisOk = false;
  try {
    await redis.ping();
    redisOk = true;
  } catch {
    redisOk = false;
  }

  const allOk = mongoOk && redisOk;
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    mongo: mongoOk ? 'ok' : 'error',
    redis: redisOk ? 'ok' : 'error',
  });
});

app.use(errorHandler);

export default app;
