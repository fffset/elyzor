import request from 'supertest';
import app from '../../src/app';
import { setupIntegration, teardownIntegration } from './helpers/db';

beforeAll(async () => {
  await setupIntegration();
});

afterAll(async () => {
  await teardownIntegration();
});

// ── GET /v1/health ────────────────────────────────────────────────────────────

describe('GET /v1/health', () => {
  it('Docker servisleri ayakta iken 200 ve status ok dondurur', async () => {
    const res = await request(app).get('/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('response mongo ve redis field larini icerir', async () => {
    const res = await request(app).get('/v1/health');

    expect(res.body).toHaveProperty('mongo');
    expect(res.body).toHaveProperty('redis');
  });

  it('mongo ve redis ok olarak doner (servisler ayakta)', async () => {
    const res = await request(app).get('/v1/health');

    expect(res.body.mongo).toBe('ok');
    expect(res.body.redis).toBe('ok');
  });

  it('JWT veya API key gerektirmez', async () => {
    // Authorization header olmadan istek
    const res = await request(app).get('/v1/health');

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
