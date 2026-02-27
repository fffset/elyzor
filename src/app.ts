import express from 'express';
import cookieParser from 'cookie-parser';
import authRouter from './auth/auth.router';
import projectsRouter from './projects/projects.router';
import apiKeysRouter from './apikeys/apikeys.router';
import verificationRouter from './verification/verification.router';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use('/v1/auth', authRouter);
app.use('/v1/projects', projectsRouter);
app.use('/v1/projects/:projectId/keys', apiKeysRouter);
app.use('/v1/verify', verificationRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

export default app;
