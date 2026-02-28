import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../errors';
import { env } from '../config/env';
import redis from '../config/redis';

interface PlatformJwtPayload {
  userId: string;
  email: string;
  userType: 'platform';
  tokenType: 'access';
}

export function platformGuard(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new UnauthorizedError('Authorization header eksik'));
    return;
  }

  const token = authHeader.slice(7);

  let payload: PlatformJwtPayload;
  try {
    const decoded = jwt.verify(token, env.jwt.secret, { algorithms: ['HS256'] }) as Record<string, unknown>;
    if (decoded['userType'] !== 'platform') {
      next(new UnauthorizedError('Bu endpoint yalnızca platform kullanıcıları için erişilebilir'));
      return;
    }
    if (typeof decoded['userId'] !== 'string' || typeof decoded['email'] !== 'string') {
      next(new UnauthorizedError('Geçersiz token payload'));
      return;
    }
    payload = decoded as unknown as PlatformJwtPayload;
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
    req.userType = 'platform';
    next();
  }).catch(() => {
    next(new UnauthorizedError('Yetkilendirme hatası'));
  });
}
