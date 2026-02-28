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

// ── Create Key ────────────────────────────────────────────────────────────────

describe('POST /v1/projects/:projectId/keys', () => {
  it('basarili key olusturma 201 ve plaintext key dondurur', async () => {
    const { token, projectId } = await setupPlatformUser();

    const res = await request(app)
      .post(`/v1/projects/${projectId}/keys`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'test-key' });

    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/^sk_live_/);
    expect(typeof res.body.id).toBe('string');
    expect(res.body.revoked).toBe(false);
  });

  it('olusturulan key sk_live_ prefix ve nokta icerir', async () => {
    const { token, projectId } = await setupPlatformUser();

    const res = await request(app)
      .post(`/v1/projects/${projectId}/keys`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'test-key' });

    const key: string = res.body.key;
    expect(key.startsWith('sk_live_')).toBe(true);
    expect(key.includes('.')).toBe(true);
  });

  it('token olmadan 401 dondurur', async () => {
    const { projectId } = await setupPlatformUser();

    const res = await request(app)
      .post(`/v1/projects/${projectId}/keys`)
      .send({ label: 'test-key' });

    expect(res.status).toBe(401);
  });

  it('baskasinin projesine key ekleyemez', async () => {
    const { projectId } = await setupPlatformUser();

    await request(app)
      .post('/v1/auth/register')
      .send({ email: 'attacker@example.com', password: 'password123' });
    const attackerLogin = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'attacker@example.com', password: 'password123' });
    const attackerToken = attackerLogin.body.accessToken as string;

    const res = await request(app)
      .post(`/v1/projects/${projectId}/keys`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({ label: 'stolen-key' });

    expect(res.status).toBe(404);
  });
});

// ── List Keys ─────────────────────────────────────────────────────────────────

describe('GET /v1/projects/:projectId/keys', () => {
  it('yeni projede key listesi bos doner', async () => {
    const { token, projectId } = await setupPlatformUser();

    const res = await request(app)
      .get(`/v1/projects/${projectId}/keys`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('olusturulan key listede gorunur', async () => {
    const { token, projectId } = await setupPlatformUser();

    await request(app)
      .post(`/v1/projects/${projectId}/keys`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'my-key' });

    const res = await request(app)
      .get(`/v1/projects/${projectId}/keys`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].label).toBe('my-key');
  });

  it('liste response body plaintext key icermez', async () => {
    const { token, projectId } = await setupPlatformUser();

    await request(app)
      .post(`/v1/projects/${projectId}/keys`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'my-key' });

    const res = await request(app)
      .get(`/v1/projects/${projectId}/keys`)
      .set('Authorization', `Bearer ${token}`);

    // Listede key field'i olmamali (plaintext asla tekrar dönmez)
    expect(res.body[0].key).toBeUndefined();
  });
});

// ── Revoke Key ────────────────────────────────────────────────────────────────

describe('DELETE /v1/projects/:projectId/keys/:keyId', () => {
  it('basarili revocation 204 dondurur', async () => {
    const { token, projectId } = await setupPlatformUser();

    const createRes = await request(app)
      .post(`/v1/projects/${projectId}/keys`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'to-revoke' });

    const keyId = createRes.body.id as string;

    const res = await request(app)
      .delete(`/v1/projects/${projectId}/keys/${keyId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });

  it('revoke edilen key listede revoked: true olarak gozukur', async () => {
    const { token, projectId } = await setupPlatformUser();

    const createRes = await request(app)
      .post(`/v1/projects/${projectId}/keys`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'to-revoke' });

    const keyId = createRes.body.id as string;

    await request(app)
      .delete(`/v1/projects/${projectId}/keys/${keyId}`)
      .set('Authorization', `Bearer ${token}`);

    const listRes = await request(app)
      .get(`/v1/projects/${projectId}/keys`)
      .set('Authorization', `Bearer ${token}`);

    const revokedKey = listRes.body.find((k: { id: string }) => k.id === keyId);
    expect(revokedKey).toBeDefined();
    expect(revokedKey.revoked).toBe(true);
  });

  it('baskasinin keyini revoke edemez', async () => {
    const { token: ownerToken, projectId } = await setupPlatformUser();

    const createRes = await request(app)
      .post(`/v1/projects/${projectId}/keys`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ label: 'victim-key' });

    const keyId = createRes.body.id as string;

    await request(app)
      .post('/v1/auth/register')
      .send({ email: 'attacker@example.com', password: 'password123' });
    const attackerLogin = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'attacker@example.com', password: 'password123' });
    const attackerToken = attackerLogin.body.accessToken as string;

    const res = await request(app)
      .delete(`/v1/projects/${projectId}/keys/${keyId}`)
      .set('Authorization', `Bearer ${attackerToken}`);

    expect(res.status).toBe(404);
  });
});
