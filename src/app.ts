import express from 'express';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import authRouter from './auth/auth.router';
import projectsRouter from './projects/projects.router';
import apiKeysRouter from './apikeys/apikeys.router';
import verificationRouter from './verification/verification.router';
import projectUsersRouter from './project-users/project-users.router';
import { errorHandler } from './middleware/errorHandler';
import { swaggerOptions } from './config/swagger';

const app = express();

app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/v1/auth', authRouter);
app.use('/v1/projects', projectsRouter);
app.use('/v1/projects/:projectId/keys', apiKeysRouter);
app.use('/v1/projects/:projectId/auth', projectUsersRouter);
app.use('/v1/verify', verificationRouter);

app.get('/v1/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

export default app;
