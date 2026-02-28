import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../errors';
import { env } from '../config/env';
import redis from '../config/redis';

interface JwtPayload {
  userId: string;
  email: string;
}

export function authGuard(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new UnauthorizedError('Authorization header eksik'));
    return;
  }

  const token = authHeader.slice(7);

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, env.jwt.secret, { algorithms: ['HS256'] }) as JwtPayload;
  } catch {
    next(new UnauthorizedError('Geçersiz veya süresi dolmuş token'));
    return;
  }

  redis.get(`blacklist:${token}`).then((blacklisted) => {
    if (blacklisted) {
      next(new UnauthorizedError('Token iptal edilmiş'));
      return;
    }
    req.userId = payload.userId;
    req.userEmail = payload.email;
    next();
  }).catch(() => {
    next(new UnauthorizedError('Yetkilendirme hatası'));
  });
}
