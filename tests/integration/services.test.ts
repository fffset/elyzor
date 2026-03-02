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

// ── Create Service ─────────────────────────────────────────────────────────────

describe('POST /v1/projects/:projectId/services', () => {
  it('basarili servis olusturma 201 ve svc_live_ key dondurur', async () => {
    const { token, projectId } = await setupPlatformUser();

    const res = await request(app)
      .post(`/v1/projects/${projectId}/services`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'billing-service' });

    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/^svc_live_/);
    expect(typeof res.body.id).toBe('string');
    expect(res.body.name).toBe('billing-service');
    expect(res.body.revoked).toBe(false);
  });

  it('key formati svc_live_<publicPart>.<secretPart> seklindedir', async () => {
    const { token, projectId } = await setupPlatformUser();

    const res = await request(app)
      .post(`/v1/projects/${projectId}/services`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'order-service' });

    const key: string = res.body.key;
    expect(key.startsWith('svc_live_')).toBe(true);
    expect(key.includes('.')).toBe(true);
    const parts = key.replace('svc_live_', '').split('.');
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });

  it('response body plaintext key icerir ama keyHash icermez', async () => {
    const { token, projectId } = await setupPlatformUser();

    const res = await request(app)
      .post(`/v1/projects/${projectId}/services`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'payment-service' });

    expect(res.body.key).toBeDefined();
    expect(res.body.keyHash).toBeUndefined();
  });

  it('token olmadan 401 dondurur', async () => {
    const { projectId } = await setupPlatformUser();

    const res = await request(app)
      .post(`/v1/projects/${projectId}/services`)
      .send({ name: 'billing-service' });

    expect(res.status).toBe(401);
  });

  it('baskasinin projesine servis ekleyemez', async () => {
    const { projectId } = await setupPlatformUser();

    await request(app)
      .post('/v1/auth/register')
      .send({ email: 'attacker@example.com', password: 'password123' });
    const attackerLogin = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'attacker@example.com', password: 'password123' });
    const attackerToken = attackerLogin.body.accessToken as string;

    const res = await request(app)
      .post(`/v1/projects/${projectId}/services`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({ name: 'evil-service' });

    expect(res.status).toBe(404);
  });

  it('ayni isimle ikinci servis olusturulamaz — 400 dondurur', async () => {
    const { token, projectId } = await setupPlatformUser();

    await request(app)
      .post(`/v1/projects/${projectId}/services`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'billing-service' });

    const res = await request(app)
      .post(`/v1/projects/${projectId}/services`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'billing-service' });

    expect(res.status).toBe(400);
  });

  it('gecersiz isim formati 400 dondurur (buyuk harf)', async () => {
    const { token, projectId } = await setupPlatformUser();

    const res = await request(app)
      .post(`/v1/projects/${projectId}/services`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'BillingService' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('farkli projelerde ayni isimde servis olusturulabilir', async () => {
    const { token, projectId: projectId1 } = await setupPlatformUser();

    const projectRes2 = await request(app)
      .post('/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'project-two' });
    const projectId2 = projectRes2.body._id as string;

    const res1 = await request(app)
      .post(`/v1/projects/${projectId1}/services`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'billing-service' });

    const res2 = await request(app)
      .post(`/v1/projects/${projectId2}/services`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'billing-service' });

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
  });
});

// ── List Services ──────────────────────────────────────────────────────────────

describe('GET /v1/projects/:projectId/services', () => {
  it('yeni projede servis listesi bos doner', async () => {
    const { token, projectId } = await setupPlatformUser();

    const res = await request(app)
      .get(`/v1/projects/${projectId}/services`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('olusturulan servis listede gorunur', async () => {
    const { token, projectId } = await setupPlatformUser();

    await request(app)
      .post(`/v1/projects/${projectId}/services`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'billing-service' });

    const res = await request(app)
      .get(`/v1/projects/${projectId}/services`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('billing-service');
  });

  it('liste response body plaintext key icermez', async () => {
    const { token, projectId } = await setupPlatformUser();

    await request(app)
      .post(`/v1/projects/${projectId}/services`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'billing-service' });

    const res = await request(app)
      .get(`/v1/projects/${projectId}/services`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body[0].key).toBeUndefined();
    expect(res.body[0].keyHash).toBeUndefined();
  });
});

// ── Revoke Service ─────────────────────────────────────────────────────────────

describe('DELETE /v1/projects/:projectId/services/:serviceId', () => {
  it('basarili revocation 204 dondurur', async () => {
    const { token, projectId } = await setupPlatformUser();

    const createRes = await request(app)
      .post(`/v1/projects/${projectId}/services`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'billing-service' });

    const serviceId = createRes.body.id as string;

    const res = await request(app)
      .delete(`/v1/projects/${projectId}/services/${serviceId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });

  it('revoke edilen servis listede revoked: true olarak gozukur', async () => {
    const { token, projectId } = await setupPlatformUser();

    const createRes = await request(app)
      .post(`/v1/projects/${projectId}/services`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'billing-service' });

    const serviceId = createRes.body.id as string;

    await request(app)
      .delete(`/v1/projects/${projectId}/services/${serviceId}`)
      .set('Authorization', `Bearer ${token}`);

    const listRes = await request(app)
      .get(`/v1/projects/${projectId}/services`)
      .set('Authorization', `Bearer ${token}`);

    const revokedService = listRes.body.find((s: { id: string }) => s.id === serviceId);
    expect(revokedService).toBeDefined();
    expect(revokedService.revoked).toBe(true);
  });

  it('ayni servisi iki kez revoke etmeye calismak 403 dondurur', async () => {
    const { token, projectId } = await setupPlatformUser();

    const createRes = await request(app)
      .post(`/v1/projects/${projectId}/services`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'billing-service' });

    const serviceId = createRes.body.id as string;

    await request(app)
      .delete(`/v1/projects/${projectId}/services/${serviceId}`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .delete(`/v1/projects/${projectId}/services/${serviceId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('var olmayan servis 404 dondurur', async () => {
    const { token, projectId } = await setupPlatformUser();

    const res = await request(app)
      .delete(`/v1/projects/${projectId}/services/000000000000000000000001`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('baskasinin servisini revoke edemez', async () => {
    const { token: ownerToken, projectId } = await setupPlatformUser();

    const createRes = await request(app)
      .post(`/v1/projects/${projectId}/services`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'billing-service' });

    const serviceId = createRes.body.id as string;

    await request(app)
      .post('/v1/auth/register')
      .send({ email: 'attacker@example.com', password: 'password123' });
    const attackerLogin = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'attacker@example.com', password: 'password123' });
    const attackerToken = attackerLogin.body.accessToken as string;

    const res = await request(app)
      .delete(`/v1/projects/${projectId}/services/${serviceId}`)
      .set('Authorization', `Bearer ${attackerToken}`);

    expect(res.status).toBe(404);
  });
});
