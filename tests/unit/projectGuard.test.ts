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

import { projectGuard } from '../../src/middleware/projectGuard';

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

describe('projectGuard', () => {
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
  });

  it('Authorization header yoksa UnauthorizedError iletir', () => {
    projectGuard(mockReq(undefined), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('Bearer formati yanlissa UnauthorizedError iletir', () => {
    projectGuard(mockReq('Basic abc123'), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('gecersiz token imzasiyla UnauthorizedError iletir', () => {
    const token = makeToken({ userId: 'u1', email: 'test@test.com', userType: 'project', projectId: 'proj1' }, 'wrong_secret');
    projectGuard(mockReq(`Bearer ${token}`), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    expect(mockRedis.get).not.toHaveBeenCalled();
  });

  it('userType platform olan token reddedilir (kritik izolasyon testi)', (done) => {
    const token = makeToken({ userId: 'u1', email: 'test@test.com', userType: 'platform' });
    (mockRedis.get as jest.Mock).mockResolvedValue(null);

    projectGuard(mockReq(`Bearer ${token}`), mockRes(), (err) => {
      expect(err).toBeInstanceOf(UnauthorizedError);
      done();
    });
  });

  it('userType eksik olan token reddedilir', (done) => {
    const token = makeToken({ userId: 'u1', email: 'test@test.com', projectId: 'proj1' });
    (mockRedis.get as jest.Mock).mockResolvedValue(null);

    projectGuard(mockReq(`Bearer ${token}`), mockRes(), (err) => {
      expect(err).toBeInstanceOf(UnauthorizedError);
      done();
    });
  });

  it('projectId eksik olan token reddedilir', () => {
    const token = makeToken({ userId: 'u1', email: 'test@test.com', userType: 'project' });
    projectGuard(mockReq(`Bearer ${token}`), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('Redis blacklist\'te olan token reddedilir', (done) => {
    const token = makeToken({ userId: 'u1', email: 'test@test.com', userType: 'project', projectId: 'proj1' });
    (mockRedis.get as jest.Mock).mockResolvedValue('1');

    projectGuard(mockReq(`Bearer ${token}`), mockRes(), (err) => {
      expect(err).toBeInstanceOf(UnauthorizedError);
      done();
    });
  });

  it('gecerli project token ile req.userId, req.userEmail, req.userType ve req.projectId set edilir', (done) => {
    const token = makeToken({ userId: 'user123', email: 'test@test.com', userType: 'project', projectId: 'proj456' });
    (mockRedis.get as jest.Mock).mockResolvedValue(null);

    const req = mockReq(`Bearer ${token}`);
    projectGuard(req, mockRes(), (err) => {
      expect(err).toBeUndefined();
      expect(req.userId).toBe('user123');
      expect(req.userEmail).toBe('test@test.com');
      expect(req.userType).toBe('project');
      expect(req.projectId).toBe('proj456');
      done();
    });
  });

  it('Redis hatasi olursa UnauthorizedError iletir (fail closed)', (done) => {
    const token = makeToken({ userId: 'u1', email: 'test@test.com', userType: 'project', projectId: 'proj1' });
    (mockRedis.get as jest.Mock).mockRejectedValue(new Error('Redis down'));

    projectGuard(mockReq(`Bearer ${token}`), mockRes(), (err) => {
      expect(err).toBeInstanceOf(UnauthorizedError);
      done();
    });
  });
});
