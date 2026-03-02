import request from 'supertest';
import app from '../../src/app';
import { setupIntegration, teardownIntegration, clearCollections } from './helpers/db';

beforeAll(async () => {
  await setupIntegration();
});

afterAll(async () => {
  await teardownIntegration();
});

beforeEach(async () => {
  await clearCollections();
});

async function setupPlatformUser(): Promise<{ token: string; projectId: string }> {
  await request(app)
    .post('/v1/auth/register')
    .send({ email: 'owner@example.com', password: 'password123' });

  const loginRes = await request(app)
    .post('/v1/auth/login')
    .send({ email: 'owner@example.com', password: 'password123' });

  const token = loginRes.body.accessToken as string;

  const projectRes = await request(app)
    .post('/v1/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'test-project' });

  return { token, projectId: projectRes.body._id as string };
}

// ── GET /v1/projects/:projectId/stats ─────────────────────────────────────────

describe('GET /v1/projects/:projectId/stats', () => {
  it('bos projede sifir degerlerle 200 dondurur', async () => {
    const { token, projectId } = await setupPlatformUser();

    const res = await request(app)
      .get(`/v1/projects/${projectId}/stats`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.totalRequests).toBe(0);
    expect(res.body.successRate).toBe(0);
    expect(Array.isArray(res.body.topKeys)).toBe(true);
    expect(Array.isArray(res.body.requestsByDay)).toBe(true);
    expect(typeof res.body.rateLimitHits).toBe('number');
    expect(typeof res.body.avgLatencyMs).toBe('number');
  });

  it('dogrulama yapildiktan sonra totalRequests artar', async () => {
    const { token, projectId } = await setupPlatformUser();

    // API key oluştur ve doğrulama yap
    const keyRes = await request(app)
      .post(`/v1/projects/${projectId}/keys`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'test-key' });

    const apiKey = keyRes.body.key as string;

    await request(app)
      .post('/v1/verify')
      .set('Authorization', `Bearer ${apiKey}`);

    // Kısa bekleme: usage log fire-and-forget, yazma tamamlanması için
    await new Promise((resolve) => setTimeout(resolve, 100));

    const res = await request(app)
      .get(`/v1/projects/${projectId}/stats`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.totalRequests).toBeGreaterThanOrEqual(1);
  });

  it('basarili dogrulama successRate arttirir', async () => {
    const { token, projectId } = await setupPlatformUser();

    const keyRes = await request(app)
      .post(`/v1/projects/${projectId}/keys`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'test-key' });

    const apiKey = keyRes.body.key as string;

    await request(app)
      .post('/v1/verify')
      .set('Authorization', `Bearer ${apiKey}`);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const res = await request(app)
      .get(`/v1/projects/${projectId}/stats`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.successRate).toBeGreaterThan(0);
  });

  it('varsayilan range 7d olarak calisir', async () => {
    const { token, projectId } = await setupPlatformUser();

    const res = await request(app)
      .get(`/v1/projects/${projectId}/stats`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('range=1d parametresi ile calisir', async () => {
    const { token, projectId } = await setupPlatformUser();

    const res = await request(app)
      .get(`/v1/projects/${projectId}/stats?range=1d`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('range=30d parametresi ile calisir', async () => {
    const { token, projectId } = await setupPlatformUser();

    const res = await request(app)
      .get(`/v1/projects/${projectId}/stats?range=30d`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('gecersiz range degeri 7d olarak ele alinir, 400 donmez', async () => {
    const { token, projectId } = await setupPlatformUser();

    const res = await request(app)
      .get(`/v1/projects/${projectId}/stats?range=999d`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('token olmadan 401 dondurur', async () => {
    const { projectId } = await setupPlatformUser();

    const res = await request(app).get(`/v1/projects/${projectId}/stats`);

    expect(res.status).toBe(401);
  });

  it('baskasinin projesine erisim 404 dondurur', async () => {
    const { projectId } = await setupPlatformUser();

    await request(app)
      .post('/v1/auth/register')
      .send({ email: 'attacker@example.com', password: 'password123' });
    const attackerLogin = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'attacker@example.com', password: 'password123' });
    const attackerToken = attackerLogin.body.accessToken as string;

    const res = await request(app)
      .get(`/v1/projects/${projectId}/stats`)
      .set('Authorization', `Bearer ${attackerToken}`);

    expect(res.status).toBe(404);
  });
});
