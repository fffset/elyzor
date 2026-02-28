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

async function setupPlatformContext(): Promise<{ platformToken: string; projectId: string }> {
  await request(app)
    .post('/v1/auth/register')
    .send({ email: 'xyz-backend@example.com', password: 'password123' });

  const loginRes = await request(app)
    .post('/v1/auth/login')
    .send({ email: 'xyz-backend@example.com', password: 'password123' });

  const platformToken = loginRes.body.accessToken as string;

  const projectRes = await request(app)
    .post('/v1/projects')
    .set('Authorization', `Bearer ${platformToken}`)
    .send({ name: 'xyz-app' });

  return { platformToken, projectId: projectRes.body._id as string };
}

// ── Register Project User ─────────────────────────────────────────────────────

describe('POST /v1/projects/:projectId/auth/register', () => {
  it('basarili kayit 201 dondurur — user + accessToken', async () => {
    const { platformToken, projectId } = await setupPlatformContext();

    const res = await request(app)
      .post(`/v1/projects/${projectId}/auth/register`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ email: 'alice@example.com', password: 'alicepass123' });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('alice@example.com');
    expect(res.body.user.projectId).toBe(projectId);
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('kayit sonrasi refreshToken HTTP-only cookie set edilir', async () => {
    const { platformToken, projectId } = await setupPlatformContext();

    const res = await request(app)
      .post(`/v1/projects/${projectId}/auth/register`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ email: 'alice@example.com', password: 'alicepass123' });

    const cookies = (res.headers['set-cookie'] as unknown) as string[];
    expect(cookies.some((c) => c.startsWith('refreshToken='))).toBe(true);
    expect(cookies.some((c) => c.includes('HttpOnly'))).toBe(true);
  });

  it('platform token olmadan 401 dondurur', async () => {
    const { projectId } = await setupPlatformContext();

    const res = await request(app)
      .post(`/v1/projects/${projectId}/auth/register`)
      .send({ email: 'alice@example.com', password: 'alicepass123' });

    expect(res.status).toBe(401);
  });

  it('ayni email ayni projede iki kez kaydedilemez — enumeration mesaji sizmaz', async () => {
    const { platformToken, projectId } = await setupPlatformContext();

    await request(app)
      .post(`/v1/projects/${projectId}/auth/register`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ email: 'alice@example.com', password: 'alicepass123' });

    const res = await request(app)
      .post(`/v1/projects/${projectId}/auth/register`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ email: 'alice@example.com', password: 'alicepass123' });

    expect(res.status).toBe(400);
    // Generic mesaj — kullanici varligini teyit etmemeli
    expect(res.body.message).not.toContain('kayıtlı');
    expect(res.body.message).not.toContain('mevcut');
    expect(res.body.message).not.toContain('exist');
  });

  it('ayni email farkli projelere kayit olabilir (compound unique index)', async () => {
    const { platformToken, projectId: projectId1 } = await setupPlatformContext();

    // İkinci proje olustur
    const project2Res = await request(app)
      .post('/v1/projects')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'second-app' });
    const projectId2 = project2Res.body._id as string;

    // Ayni email her iki projede de kayit olabilmeli
    const res1 = await request(app)
      .post(`/v1/projects/${projectId1}/auth/register`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ email: 'alice@example.com', password: 'alicepass123' });

    const res2 = await request(app)
      .post(`/v1/projects/${projectId2}/auth/register`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ email: 'alice@example.com', password: 'alicepass123' });

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
  });

  it('baskasinin projesine kullanici ekleyemez', async () => {
    const { projectId } = await setupPlatformContext();

    // Farkli platform kullanicisi
    await request(app)
      .post('/v1/auth/register')
      .send({ email: 'other-backend@example.com', password: 'password123' });
    const otherLogin = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'other-backend@example.com', password: 'password123' });
    const otherToken = otherLogin.body.accessToken as string;

    const res = await request(app)
      .post(`/v1/projects/${projectId}/auth/register`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ email: 'alice@example.com', password: 'alicepass123' });

    expect(res.status).toBe(404);
  });

  it('gecersiz email formati 400 dondurur', async () => {
    const { platformToken, projectId } = await setupPlatformContext();

    const res = await request(app)
      .post(`/v1/projects/${projectId}/auth/register`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ email: 'not-an-email', password: 'alicepass123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });
});

// ── Login Project User ────────────────────────────────────────────────────────

describe('POST /v1/projects/:projectId/auth/login', () => {
  it('basarili giris 200 ve accessToken dondurur', async () => {
    const ctx = await setupPlatformContext();
    await request(app)
      .post(`/v1/projects/${ctx.projectId}/auth/register`)
      .set('Authorization', `Bearer ${ctx.platformToken}`)
      .send({ email: 'alice@example.com', password: 'alicepass123' });

    const res = await request(app)
      .post(`/v1/projects/${ctx.projectId}/auth/login`)
      .set('Authorization', `Bearer ${ctx.platformToken}`)
      .send({ email: 'alice@example.com', password: 'alicepass123' });

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('giris sonrasi refreshToken HTTP-only cookie set edilir', async () => {
    const ctx = await setupPlatformContext();
    await request(app)
      .post(`/v1/projects/${ctx.projectId}/auth/register`)
      .set('Authorization', `Bearer ${ctx.platformToken}`)
      .send({ email: 'alice@example.com', password: 'alicepass123' });

    const res = await request(app)
      .post(`/v1/projects/${ctx.projectId}/auth/login`)
      .set('Authorization', `Bearer ${ctx.platformToken}`)
      .send({ email: 'alice@example.com', password: 'alicepass123' });

    const cookies = (res.headers['set-cookie'] as unknown) as string[];
    expect(cookies.some((c) => c.startsWith('refreshToken='))).toBe(true);
  });

  it('yanlis sifre 401 dondurur', async () => {
    const ctx = await setupPlatformContext();
    await request(app)
      .post(`/v1/projects/${ctx.projectId}/auth/register`)
      .set('Authorization', `Bearer ${ctx.platformToken}`)
      .send({ email: 'alice@example.com', password: 'alicepass123' });

    const res = await request(app)
      .post(`/v1/projects/${ctx.projectId}/auth/login`)
      .set('Authorization', `Bearer ${ctx.platformToken}`)
      .send({ email: 'alice@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });

  it('platform token olmadan login 401 dondurur', async () => {
    const ctx = await setupPlatformContext();
    await request(app)
      .post(`/v1/projects/${ctx.projectId}/auth/register`)
      .set('Authorization', `Bearer ${ctx.platformToken}`)
      .send({ email: 'alice@example.com', password: 'alicepass123' });

    const res = await request(app)
      .post(`/v1/projects/${ctx.projectId}/auth/login`)
      .send({ email: 'alice@example.com', password: 'alicepass123' });

    expect(res.status).toBe(401);
  });
});

// ── Token Type Isolation ──────────────────────────────────────────────────────

describe('Token tipi izolasyonu', () => {
  it('project user accessToken ile platform endpoint erisilemez', async () => {
    const ctx = await setupPlatformContext();

    const registerRes = await request(app)
      .post(`/v1/projects/${ctx.projectId}/auth/register`)
      .set('Authorization', `Bearer ${ctx.platformToken}`)
      .send({ email: 'alice@example.com', password: 'alicepass123' });

    const projectToken = registerRes.body.accessToken as string;

    // Project token ile platform endpoint'i — platformGuard reddetmeli
    const res = await request(app)
      .get('/v1/projects')
      .set('Authorization', `Bearer ${projectToken}`);

    expect(res.status).toBe(401);
  });

  it('platform token ile project user endpoint erisilemez (eger projectGuard olsaydi)', async () => {
    // Bu test platformGuard'in project token'lari reddettigini dogrular.
    // project-users router'i platformGuard kullanir, yani bu endpoint platform token ister.
    // Dolayisiyla platform token ile 201 almak beklenir — bu testin amaci farkli bir seyi dogrulamak.

    // Amac: baskasinin platform tokeni ile baskasinin projesine erisim → 404 (ownership)
    const ctx1 = await setupPlatformContext();

    await request(app)
      .post('/v1/auth/register')
      .send({ email: 'attacker@example.com', password: 'password123' });
    const attackerLogin = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'attacker@example.com', password: 'password123' });
    const attackerToken = attackerLogin.body.accessToken as string;

    // Attacker, baskasinin projesine kullanici kaydetmeye calisiyor
    const res = await request(app)
      .post(`/v1/projects/${ctx1.projectId}/auth/register`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({ email: 'malicious@example.com', password: 'password123' });

    expect(res.status).toBe(404);
  });
});
