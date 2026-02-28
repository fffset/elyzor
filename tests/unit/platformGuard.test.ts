import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import redis from '../../src/config/redis';
import { UnauthorizedError } from '../../src/errors';

jest.mock('../../src/config/redis', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock('../../src/config/env', () => ({
  env: {
    jwt: { secret: 'test_secret_for_unit_tests' },
  },
}));

import { platformGuard } from '../../src/middleware/platformGuard';

const mockRedis = redis as jest.Mocked<typeof redis>;

function makeToken(payload: object, secret = 'test_secret_for_unit_tests'): string {
  return jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '15m' });
}

function mockReq(authHeader?: string): Request {
  return { headers: { authorization: authHeader }, cookies: {} } as unknown as Request;
}

function mockRes(): Response {
  return {} as Response;
}

describe('platformGuard', () => {
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
  });

  it('Authorization header yoksa UnauthorizedError iletir', () => {
    platformGuard(mockReq(undefined), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('Bearer formati yanlissa UnauthorizedError iletir', () => {
    platformGuard(mockReq('Basic abc123'), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('gecersiz token imzasiyla UnauthorizedError iletir', () => {
    const token = makeToken({ userId: 'u1', email: 'test@test.com', userType: 'platform' }, 'wrong_secret');
    platformGuard(mockReq(`Bearer ${token}`), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    expect(mockRedis.get).not.toHaveBeenCalled();
  });

  it('none algoritmasiyla imzalanmis token reddedilir (algorithm confusion)', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ userId: 'u1', email: 'x@x.com', userType: 'platform', exp: Math.floor(Date.now() / 1000) + 900 })).toString('base64url');
    const noneToken = `${header}.${payload}.`;
    platformGuard(mockReq(`Bearer ${noneToken}`), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('userType project olan token reddedilir', (done) => {
    const token = makeToken({ userId: 'u1', email: 'test@test.com', userType: 'project', projectId: 'proj1' });
    (mockRedis.get as jest.Mock).mockResolvedValue(null);

    platformGuard(mockReq(`Bearer ${token}`), mockRes(), (err) => {
      expect(err).toBeInstanceOf(UnauthorizedError);
      done();
    });
  });

  it('userType eksik olan token reddedilir', (done) => {
    const token = makeToken({ userId: 'u1', email: 'test@test.com' });
    (mockRedis.get as jest.Mock).mockResolvedValue(null);

    platformGuard(mockReq(`Bearer ${token}`), mockRes(), (err) => {
      expect(err).toBeInstanceOf(UnauthorizedError);
      done();
    });
  });

  it('Redis blacklist\'te olan token reddedilir', (done) => {
    const token = makeToken({ userId: 'u1', email: 'test@test.com', userType: 'platform' });
    (mockRedis.get as jest.Mock).mockResolvedValue('1');

    platformGuard(mockReq(`Bearer ${token}`), mockRes(), (err) => {
      expect(err).toBeInstanceOf(UnauthorizedError);
      done();
    });
  });

  it('gecerli platform token ile req.userId, req.userEmail ve req.userType set edilir', (done) => {
    const token = makeToken({ userId: 'user123', email: 'test@test.com', userType: 'platform' });
    (mockRedis.get as jest.Mock).mockResolvedValue(null);

    const req = mockReq(`Bearer ${token}`);
    platformGuard(req, mockRes(), (err) => {
      expect(err).toBeUndefined();
      expect(req.userId).toBe('user123');
      expect(req.userEmail).toBe('test@test.com');
      expect(req.userType).toBe('platform');
      done();
    });
  });

  it('Redis hatasi olursa UnauthorizedError iletir (fail closed)', (done) => {
    const token = makeToken({ userId: 'u1', email: 'test@test.com', userType: 'platform' });
    (mockRedis.get as jest.Mock).mockRejectedValue(new Error('Redis down'));

    platformGuard(mockReq(`Bearer ${token}`), mockRes(), (err) => {
      expect(err).toBeInstanceOf(UnauthorizedError);
      done();
    });
  });
});
