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

async function setupKeyLifecycle(): Promise<{ apiKey: string; keyId: string; projectId: string; platformToken: string }> {
  await request(app)
    .post('/v1/auth/register')
    .send({ email: 'owner@example.com', password: 'password123' });

  const loginRes = await request(app)
    .post('/v1/auth/login')
    .send({ email: 'owner@example.com', password: 'password123' });

  const platformToken = loginRes.body.accessToken as string;

  const projectRes = await request(app)
    .post('/v1/projects')
    .set('Authorization', `Bearer ${platformToken}`)
    .send({ name: 'test-project' });

  const projectId = projectRes.body._id as string;

  const keyRes = await request(app)
    .post(`/v1/projects/${projectId}/keys`)
    .set('Authorization', `Bearer ${platformToken}`)
    .send({ label: 'test-key' });

  return {
    apiKey: keyRes.body.key as string,
    keyId: keyRes.body.id as string,
    projectId,
    platformToken,
  };
}

// ── Format validasyonu (DB gerektirmez) ───────────────────────────────────────

describe('POST /v1/verify — format validasyonu', () => {
  it('Authorization header olmadan 401 ve valid: false dondurur', async () => {
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
  });

  it('nokta ayiricisi olmayan key ile 401 dondurur', async () => {
    const res = await request(app)
      .post('/v1/verify')
      .set('Authorization', 'Bearer sk_live_nodot');
    expect(res.status).toBe(401);
    expect(res.body.valid).toBe(false);
  });

  it('Basic auth ile 401 dondurur', async () => {
    const res = await request(app)
      .post('/v1/verify')
      .set('Authorization', 'Basic dXNlcjpwYXNz');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_key');
  });

  it('response body her zaman valid field icerir', async () => {
    const res = await request(app)
      .post('/v1/verify')
      .set('Authorization', 'Bearer sk_live_test.invalid');
    expect(res.body).toHaveProperty('valid');
    expect(typeof res.body.valid).toBe('boolean');
  });
});

// ── Lifecycle: olustur → dogrula → revoke → tekrar dogrula ───────────────────

describe('POST /v1/verify — key lifecycle', () => {
  it('gecerli key ile valid: true ve projectId dondurur', async () => {
    const { apiKey, projectId } = await setupKeyLifecycle();

    const res = await request(app)
      .post('/v1/verify')
      .set('Authorization', `Bearer ${apiKey}`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.projectId).toBe(projectId);
    expect(typeof res.body.rateLimitRemaining).toBe('number');
  });

  it('DB\'de bulunmayan gecerli formattaki key ile valid: false dondurur', async () => {
    const res = await request(app)
      .post('/v1/verify')
      .set('Authorization', 'Bearer sk_live_abc12345.secret9876xyz');
    expect(res.status).toBe(401);
    expect(res.body.valid).toBe(false);
  });

  it('revoke edilen key valid: false ve error: key_revoked dondurur', async () => {
    const { apiKey, keyId, projectId, platformToken } = await setupKeyLifecycle();

    // Gecerli dogrulama
    const beforeRevoke = await request(app)
      .post('/v1/verify')
      .set('Authorization', `Bearer ${apiKey}`);
    expect(beforeRevoke.body.valid).toBe(true);

    // Key revoke et
    await request(app)
      .delete(`/v1/projects/${projectId}/keys/${keyId}`)
      .set('Authorization', `Bearer ${platformToken}`);

    // Revoke sonrasi dogrulama
    const afterRevoke = await request(app)
      .post('/v1/verify')
      .set('Authorization', `Bearer ${apiKey}`);

    expect(afterRevoke.status).toBe(403);
    expect(afterRevoke.body.valid).toBe(false);
    expect(afterRevoke.body.error).toBe('key_revoked');
  });

  it('her basarili dogrulamada rateLimitRemaining azalir', async () => {
    const { apiKey } = await setupKeyLifecycle();

    const res1 = await request(app)
      .post('/v1/verify')
      .set('Authorization', `Bearer ${apiKey}`);

    const res2 = await request(app)
      .post('/v1/verify')
      .set('Authorization', `Bearer ${apiKey}`);

    expect(res1.body.rateLimitRemaining).toBeGreaterThan(res2.body.rateLimitRemaining);
  });

  it('farkli projeden key ile dogrulama dogru projectId dondurur', async () => {
    const ctx1 = await setupKeyLifecycle();

    // İkinci kullanici + proje + key
    await request(app)
      .post('/v1/auth/register')
      .send({ email: 'second@example.com', password: 'password123' });
    const loginRes2 = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'second@example.com', password: 'password123' });
    const token2 = loginRes2.body.accessToken as string;

    const project2 = await request(app)
      .post('/v1/projects')
      .set('Authorization', `Bearer ${token2}`)
      .send({ name: 'project-two' });
    const projectId2 = project2.body._id as string;

    const key2Res = await request(app)
      .post(`/v1/projects/${projectId2}/keys`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ label: 'key-two' });
    const apiKey2 = key2Res.body.key as string;

    // Her key kendi projectId'sini dondurur
    const verify1 = await request(app)
      .post('/v1/verify')
      .set('Authorization', `Bearer ${ctx1.apiKey}`);
    expect(verify1.body.projectId).toBe(ctx1.projectId);

    const verify2 = await request(app)
      .post('/v1/verify')
      .set('Authorization', `Bearer ${apiKey2}`);
    expect(verify2.body.projectId).toBe(projectId2);
  });
});
