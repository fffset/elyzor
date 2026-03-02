import { IsEmail, IsString, MinLength } from 'class-validator';
import { Request, Response, NextFunction } from 'express';
import { validateDto } from '../../src/middleware/validateDto';
import { ValidationError } from '../../src/errors';

class TestDto {
  @IsEmail({}, { message: 'Geçerli email giriniz' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'En az 8 karakter' })
  password!: string;
}

function makeReq(body: unknown): Request {
  return { body } as unknown as Request;
}

function makeRes(): Response {
  return {} as Response;
}

describe('validateDto', () => {
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    next = jest.fn();
  });

  it('geçerli DTO → next() çağrılır, hata iletilmez', async () => {
    const req = makeReq({ email: 'test@test.com', password: 'password123' });
    await validateDto(TestDto)(req, makeRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.body).toBeInstanceOf(TestDto);
  });

  it('geçersiz email → ValidationError iletilir', async () => {
    const req = makeReq({ email: 'not-an-email', password: 'password123' });
    await validateDto(TestDto)(req, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
  });

  it('kısa şifre → ValidationError iletilir', async () => {
    const req = makeReq({ email: 'test@test.com', password: '123' });
    await validateDto(TestDto)(req, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
  });

  it('eksik field → ValidationError iletilir', async () => {
    const req = makeReq({ email: 'test@test.com' });
    await validateDto(TestDto)(req, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
  });

  it('whitelist: true → bilinmeyen field temizlenir', async () => {
    const req = makeReq({ email: 'test@test.com', password: 'password123', unknown: 'field' });
    await validateDto(TestDto)(req, makeRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect((req.body as Record<string, unknown>)['unknown']).toBeUndefined();
  });
});
