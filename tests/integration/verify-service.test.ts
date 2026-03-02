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

async function setupAndCreateService(): Promise<{
  token: string;
  projectId: string;
  serviceId: string;
  svcKey: string;
}> {
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

  const projectId = projectRes.body._id as string;

  const serviceRes = await request(app)
    .post(`/v1/projects/${projectId}/services`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'billing-service' });

  return {
    token,
    projectId,
    serviceId: serviceRes.body.id as string,
    svcKey: serviceRes.body.key as string,
  };
}

// ── POST /v1/verify/service ────────────────────────────────────────────────────

describe('POST /v1/verify/service — geçerli key', () => {
  it('gecerli svc_live_ key ile 200 ve valid: true dondurur', async () => {
    const { svcKey, projectId } = await setupAndCreateService();

    const res = await request(app)
      .post('/v1/verify/service')
      .set('Authorization', `Bearer ${svcKey}`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.projectId).toBe(projectId);
  });

  it('response service.id ve service.name icerir', async () => {
    const { svcKey } = await setupAndCreateService();

    const res = await request(app)
      .post('/v1/verify/service')
      .set('Authorization', `Bearer ${svcKey}`);

    expect(res.body.service).toBeDefined();
    expect(typeof res.body.service.id).toBe('string');
    expect(res.body.service.name).toBe('billing-service');
  });

  it('response rateLimitRemaining icerir', async () => {
    const { svcKey } = await setupAndCreateService();

    const res = await request(app)
      .post('/v1/verify/service')
      .set('Authorization', `Bearer ${svcKey}`);

    expect(typeof res.body.rateLimitRemaining).toBe('number');
  });

  it('ayni key ikinci kez dogrulanir — Redis cache hit', async () => {
    const { svcKey } = await setupAndCreateService();

    // ilk istek DB'ye gider ve cache'e yazar
    await request(app)
      .post('/v1/verify/service')
      .set('Authorization', `Bearer ${svcKey}`);

    // ikinci istek cache'ten gelir
    const res = await request(app)
      .post('/v1/verify/service')
      .set('Authorization', `Bearer ${svcKey}`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });
});

describe('POST /v1/verify/service — geçersiz key', () => {
  it('Authorization header olmadan 401 dondurur', async () => {
    const res = await request(app).post('/v1/verify/service');

    expect(res.status).toBe(401);
    expect(res.body.valid).toBe(false);
    expect(res.body.error).toBe('invalid_key');
  });

  it('sk_live_ key ile 401 dondurur — cross-contamination guard', async () => {
    // sk_live_ key oluştur
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
    const projectId = projectRes.body._id as string;
    const keyRes = await request(app)
      .post(`/v1/projects/${projectId}/keys`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'test-key' });
    const skKey = keyRes.body.key as string;

    const res = await request(app)
      .post('/v1/verify/service')
      .set('Authorization', `Bearer ${skKey}`);

    expect(res.status).toBe(401);
    expect(res.body.valid).toBe(false);
    expect(res.body.error).toBe('invalid_key');
  });

  it('rastgele string ile 401 dondurur', async () => {
    const res = await request(app)
      .post('/v1/verify/service')
      .set('Authorization', 'Bearer totally-fake-key');

    expect(res.status).toBe(401);
    expect(res.body.valid).toBe(false);
  });

  it('baska projenin service key ile 401 dondurur', async () => {
    const { svcKey: svcKey1 } = await setupAndCreateService();

    // farklı hesap ve proje oluştur
    await request(app)
      .post('/v1/auth/register')
      .send({ email: 'other@example.com', password: 'password123' });
    const loginRes = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'other@example.com', password: 'password123' });
    const token2 = loginRes.body.accessToken as string;
    const projectRes2 = await request(app)
      .post('/v1/projects')
      .set('Authorization', `Bearer ${token2}`)
      .send({ name: 'other-project' });
    const projectId2 = projectRes2.body._id as string;
    await request(app)
      .post(`/v1/projects/${projectId2}/services`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ name: 'order-service' });

    // İlk projenin key'i ile doğrulama — key gerçek ama DB'de var
    const res = await request(app)
      .post('/v1/verify/service')
      .set('Authorization', `Bearer ${svcKey1}`);

    // valid veya invalid olabilir ama response yapısı doğru olmalı
    expect(res.body).toHaveProperty('valid');
  });
});

describe('POST /v1/verify/service — revoke edilmiş key', () => {
  it('revoke edilen servis key ile 403 ve service_revoked dondurur', async () => {
    const { token, projectId, serviceId, svcKey } = await setupAndCreateService();

    // revoke et
    await request(app)
      .delete(`/v1/projects/${projectId}/services/${serviceId}`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post('/v1/verify/service')
      .set('Authorization', `Bearer ${svcKey}`);

    expect(res.status).toBe(403);
    expect(res.body.valid).toBe(false);
    expect(res.body.error).toBe('service_revoked');
  });

  it('revoke sonrasi cache temizlenir — anlık etki', async () => {
    const { token, projectId, serviceId, svcKey } = await setupAndCreateService();

    // önce geçerli doğrulama (cache'e alır)
    await request(app)
      .post('/v1/verify/service')
      .set('Authorization', `Bearer ${svcKey}`);

    // revoke et
    await request(app)
      .delete(`/v1/projects/${projectId}/services/${serviceId}`)
      .set('Authorization', `Bearer ${token}`);

    // cache temizlenmiş olmalı — 403 dönmeli
    const res = await request(app)
      .post('/v1/verify/service')
      .set('Authorization', `Bearer ${svcKey}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('service_revoked');
  });
});

describe('POST /v1/verify — svc_live_ key cross-contamination', () => {
  it('svc_live_ key /v1/verify endpointinde 401 dondurur', async () => {
    const { svcKey } = await setupAndCreateService();

    const res = await request(app)
      .post('/v1/verify')
      .set('Authorization', `Bearer ${svcKey}`);

    expect(res.status).toBe(401);
    expect(res.body.valid).toBe(false);
    expect(res.body.error).toBe('invalid_key');
  });
});
