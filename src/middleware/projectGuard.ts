import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../errors';
import { env } from '../config/env';
import redis from '../config/redis';

interface ProjectJwtPayload {
  userId: string;
  email: string;
  userType: 'project';
  projectId: string;
  tokenType: 'access';
}

export function projectGuard(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new UnauthorizedError('Authorization header eksik'));
    return;
  }

  const token = authHeader.slice(7);

  let payload: ProjectJwtPayload;
  try {
    const decoded = jwt.verify(token, env.jwt.secret, { algorithms: ['HS256'] }) as Record<string, unknown>;
    if (decoded['userType'] !== 'project') {
      next(new UnauthorizedError('Bu endpoint yalnızca proje kullanıcıları için erişilebilir'));
      return;
    }
    if (
      typeof decoded['userId'] !== 'string' ||
      typeof decoded['email'] !== 'string' ||
      typeof decoded['projectId'] !== 'string'
    ) {
      next(new UnauthorizedError('Geçersiz token payload'));
      return;
    }
    payload = decoded as unknown as ProjectJwtPayload;
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
    req.userType = 'project';
    req.projectId = payload.projectId;
    next();
  }).catch(() => {
    next(new UnauthorizedError('Yetkilendirme hatası'));
  });
}
