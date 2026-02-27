import request from 'supertest';
import app from '../../src/app';

describe('POST /v1/verify', () => {
  it('Authorization header olmadan 401 döndürür', async () => {
    const res = await request(app).post('/v1/verify');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_key');
  });

  it('geçersiz key formatıyla 401 döndürür', async () => {
    const res = await request(app)
      .post('/v1/verify')
      .set('Authorization', 'Bearer not_a_valid_key');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_key');
  });
});
