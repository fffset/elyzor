import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

interface TokenUser {
  id: string;
  email: string;
}

export function generateProjectUserAccessToken(user: TokenUser & { projectId: string }): string {
  return jwt.sign(
    { userId: user.id, email: user.email, userType: 'project', projectId: user.projectId, tokenType: 'access' },
    env.jwt.secret,
    { expiresIn: env.jwt.accessExpiresIn, algorithm: 'HS256' }
  );
}

export function generateAccessToken(user: TokenUser): string {
  return jwt.sign(
    { userId: user.id, email: user.email, userType: 'platform', tokenType: 'access' },
    env.jwt.secret,
    { expiresIn: env.jwt.accessExpiresIn, algorithm: 'HS256' }
  );
}
