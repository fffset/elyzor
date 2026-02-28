import request from 'supertest';
import app from '../../src/app';
import { setupIntegration, teardownIntegration, clearCollections } from './helpers/db';

// Docker gerektiren testler: docker compose up -d
// npm run test:integration

beforeAll(async () => {
  await setupIntegration();
});

afterAll(async () => {
  await teardownIntegration();
});

beforeEach(async () => {
  await clearCollections();
});

const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'password123';

async function registerAndLogin(): Promise<{ accessToken: string; refreshCookie: string }> {
  await request(app)
    .post('/v1/auth/register')
    .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

  const res = await request(app)
    .post('/v1/auth/login')
    .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

  const setCookie = (res.headers['set-cookie'] as unknown) as string[];
  const refreshCookie = setCookie?.find((c) => c.startsWith('refreshToken=')) ?? '';
  return { accessToken: res.body.accessToken as string, refreshCookie };
}

// ── Register ────────────────────────────────────────────────────────────────

describe('POST /v1/auth/register', () => {
  it('basarili kayit 201 ve user + accessToken dondurur', async () => {
    const res = await request(app)
      .post('/v1/auth/register')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(TEST_EMAIL);
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('kayit sonrasi refreshToken cookie set edilir', async () => {
    const res = await request(app)
      .post('/v1/auth/register')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    const cookies = (res.headers['set-cookie'] as unknown) as string[];
    expect(cookies.some((c) => c.startsWith('refreshToken='))).toBe(true);
    expect(cookies.some((c) => c.includes('HttpOnly'))).toBe(true);
  });

  it('ayni email ile ikinci kayit 400 dondurur', async () => {
    await request(app)
      .post('/v1/auth/register')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    const res = await request(app)
      .post('/v1/auth/register')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(res.status).toBe(400);
  });

  it('gecersiz email formati 400 dondurur', async () => {
    const res = await request(app)
      .post('/v1/auth/register')
      .send({ email: 'not-an-email', password: TEST_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('kisa sifre 400 dondurur', async () => {
    const res = await request(app)
      .post('/v1/auth/register')
      .send({ email: TEST_EMAIL, password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('kayit hata mesaji email varligini sizdirmaz', async () => {
    await request(app)
      .post('/v1/auth/register')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    const res = await request(app)
      .post('/v1/auth/register')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(res.body.message).not.toContain('kayıtlı');
    expect(res.body.message).not.toContain('mevcut');
    expect(res.body.message).not.toContain('exist');
  });
});

// ── Login ───────────────────────────────────────────────────────────────────

describe('POST /v1/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/v1/auth/register')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
  });

  it('basarili giris 200 ve accessToken dondurur', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('giris sonrasi refreshToken cookie set edilir', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    const cookies = (res.headers['set-cookie'] as unknown) as string[];
    expect(cookies.some((c) => c.startsWith('refreshToken='))).toBe(true);
  });

  it('yanlis sifre 401 dondurur', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: TEST_EMAIL, password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });

  it('var olmayan email 401 dondurur', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'nobody@example.com', password: TEST_PASSWORD });

    expect(res.status).toBe(401);
  });
});

// ── Refresh ──────────────────────────────────────────────────────────────────

describe('POST /v1/auth/refresh', () => {
  it('gecerli refresh token ile yeni accessToken alir', async () => {
    const { refreshCookie } = await registerAndLogin();

    const res = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', refreshCookie);

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('her refresh sonrasi yeni refreshToken cookie set edilir (rotation)', async () => {
    const { refreshCookie } = await registerAndLogin();

    const res = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', refreshCookie);

    const cookies = (res.headers['set-cookie'] as unknown) as string[];
    const newCookie = cookies?.find((c) => c.startsWith('refreshToken='));
    expect(newCookie).toBeDefined();
    // Yeni cookie eski cookie'den farkli olmali
    expect(newCookie).not.toBe(refreshCookie);
  });

  it('eski refresh token ikinci kez kullanilamaz (rotation)', async () => {
    const { refreshCookie } = await registerAndLogin();

    // İlk kullanim — geçerli
    await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', refreshCookie);

    // Ayni token ikinci kez — reddedilmeli
    const res = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', refreshCookie);

    expect(res.status).toBe(401);
  });

  it('cookie olmadan 401 dondurur', async () => {
    const res = await request(app).post('/v1/auth/refresh');
    expect(res.status).toBe(401);
  });
});

// ── Logout ───────────────────────────────────────────────────────────────────

describe('POST /v1/auth/logout', () => {
  it('basarili logout 204 dondurur', async () => {
    const { accessToken, refreshCookie } = await registerAndLogin();

    const res = await request(app)
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', refreshCookie);

    expect(res.status).toBe(204);
  });

  it('logout sonrasi ayni access token reddedilir (blacklist)', async () => {
    const { accessToken, refreshCookie } = await registerAndLogin();

    await request(app)
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', refreshCookie);

    // Blacklist'teki token ile korunan endpoint'e erisim
    const res = await request(app)
      .get('/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(401);
  });

  it('logout sonrasi refresh token de gecersizlenir', async () => {
    const { accessToken, refreshCookie } = await registerAndLogin();

    await request(app)
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', refreshCookie);

    const res = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', refreshCookie);

    expect(res.status).toBe(401);
  });

  it('token olmadan logout 401 dondurur', async () => {
    const res = await request(app).post('/v1/auth/logout');
    expect(res.status).toBe(401);
  });
});

// ── Logout All ────────────────────────────────────────────────────────────────

describe('POST /v1/auth/logout-all', () => {
  it('logout-all tum refresh tokenlari gecersizlestirir', async () => {
    const { accessToken, refreshCookie } = await registerAndLogin();

    // Ikinci oturum acalim
    const loginRes2 = await request(app)
      .post('/v1/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    const cookies2 = (loginRes2.headers['set-cookie'] as unknown) as string[];
    const refreshCookie2 = cookies2?.find((c) => c.startsWith('refreshToken=')) ?? '';

    await request(app)
      .post('/v1/auth/logout-all')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', refreshCookie);

    // Her iki refresh token da gecersiz olmali
    const res1 = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', refreshCookie);
    expect(res1.status).toBe(401);

    const res2 = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', refreshCookie2);
    expect(res2.status).toBe(401);
  });
});
