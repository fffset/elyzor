import { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../../src/middleware/errorHandler';
import { NotFoundError, UnauthorizedError, ForbiddenError, ValidationError } from '../../src/errors';

function mockRes(): { status: jest.Mock; json: jest.Mock } {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('errorHandler', () => {
  const req = {} as Request;
  const next = jest.fn() as unknown as NextFunction;

  beforeEach(() => jest.clearAllMocks());

  it('NotFoundError → 404 + not_found kodu döner', () => {
    const res = mockRes();
    errorHandler(new NotFoundError('Bulunamadı'), req, res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'not_found', message: 'Bulunamadı' });
  });

  it('UnauthorizedError → 401 döner', () => {
    const res = mockRes();
    errorHandler(new UnauthorizedError('Token eksik'), req, res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'unauthorized', message: 'Token eksik' });
  });

  it('ForbiddenError → 403 döner', () => {
    const res = mockRes();
    errorHandler(new ForbiddenError('Erişim yok'), req, res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'forbidden', message: 'Erişim yok' });
  });

  it('ValidationError → 400 döner', () => {
    const res = mockRes();
    errorHandler(new ValidationError('Geçersiz input'), req, res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'validation_error', message: 'Geçersiz input' });
  });

  it('bilinmeyen hata → 500 + internal_error döner', () => {
    const res = mockRes();
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    errorHandler(new Error('beklenmedik hata'), req, res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'internal_error' });
    consoleSpy.mockRestore();
  });
});
