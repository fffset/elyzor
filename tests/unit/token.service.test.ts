import jwt from 'jsonwebtoken';

jest.mock('../../src/config/env', () => ({
  env: {
    jwt: {
      secret: 'test_secret',
      accessExpiresIn: '15m',
    },
  },
}));

import { generateAccessToken } from '../../src/auth/services/token.service';

describe('generateAccessToken', () => {
  it('userId, email ve tokenType: access içeren geçerli JWT üretir', () => {
    const token = generateAccessToken({ id: 'user1', email: 'test@test.com' });
    const decoded = jwt.verify(token, 'test_secret') as Record<string, unknown>;

    expect(decoded['userId']).toBe('user1');
    expect(decoded['email']).toBe('test@test.com');
    expect(decoded['tokenType']).toBe('access');
  });

  it('HS256 algoritmasıyla imzalar', () => {
    const token = generateAccessToken({ id: 'user1', email: 'test@test.com' });
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());

    expect(header['alg']).toBe('HS256');
  });

  it('yanlış secret ile verify edilemez', () => {
    const token = generateAccessToken({ id: 'user1', email: 'test@test.com' });

    expect(() => jwt.verify(token, 'wrong_secret')).toThrow();
  });
});
