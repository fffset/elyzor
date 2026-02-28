import request from 'supertest';
import app from '../../src/app';

// Integration testleri gercek MongoDB + Redis gerektirir.
// CI'da docker-compose ile ayaga kaldirilir.
// npm run test:integration

describe('POST /v1/verify', () => {
  it('Authorization header olmadan 401 dondurur', async () => {
    const res = await request(app).post('/v1/verify');
    expect(res.status).toBe(401);
    expect(res.body.valid).toBe(false);
    expect(res.body.error).toBe('invalid_key');
  });

  it('gecersiz key formatiyla 401 dondurur', async () => {
    const res = await request(app)
      .post('/v1/verify')
      .set('Authorization', 'Bearer not_a_valid_key');
    expect(res.status).toBe(401);
    expect(res.body.valid).toBe(false);
    expect(res.body.error).toBe('invalid_key');
  });

  it('sk_live_ prefix\'i olmayan key ile 401 dondurur', async () => {
    const res = await request(app)
      .post('/v1/verify')
      .set('Authorization', 'Bearer abc123.xyz789');
    expect(res.status).toBe(401);
    expect(res.body.valid).toBe(false);
    expect(res.body.error).toBe('invalid_key');
  });

  it('nokta ayiricisi olmayan key ile 401 dondurur', async () => {
    const res = await request(app)
      .post('/v1/verify')
      .set('Authorization', 'Bearer sk_live_nodot');
    expect(res.status).toBe(401);
    expect(res.body.valid).toBe(false);
    expect(res.body.error).toBe('invalid_key');
  });

  it('DB\'de bulunmayan gecerli formattaki key ile 401 dondurur', async () => {
    const res = await request(app)
      .post('/v1/verify')
      .set('Authorization', 'Bearer sk_live_abc12345.secret9876xyz');
    expect(res.status).toBe(401);
    expect(res.body.valid).toBe(false);
    expect(res.body.error).toBe('invalid_key');
  });

  it('response body her zaman valid field icerir', async () => {
    const res = await request(app)
      .post('/v1/verify')
      .set('Authorization', 'Bearer sk_live_test.invalid');
    expect(res.body).toHaveProperty('valid');
    expect(typeof res.body.valid).toBe('boolean');
  });

  it('gecersiz key\'de error field string\'dir', async () => {
    const res = await request(app)
      .post('/v1/verify')
      .set('Authorization', 'Bearer sk_live_test.invalid');
    expect(res.body).toHaveProperty('error');
    expect(typeof res.body.error).toBe('string');
  });

  it('Basic auth ile 401 dondurur', async () => {
    const res = await request(app)
      .post('/v1/verify')
      .set('Authorization', 'Basic dXNlcjpwYXNz');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_key');
  });
});
