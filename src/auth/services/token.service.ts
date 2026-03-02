import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

interface TokenUser {
  id: string;
  email: string;
}

export function generateAccessToken(user: TokenUser): string {
  return jwt.sign({ userId: user.id, email: user.email, tokenType: 'access' }, env.jwt.secret, {
    expiresIn: env.jwt.accessExpiresIn,
    algorithm: 'HS256',
  });
}
