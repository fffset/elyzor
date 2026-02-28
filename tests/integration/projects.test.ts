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

async function getPlatformToken(): Promise<string> {
  await request(app)
    .post('/v1/auth/register')
    .send({ email: 'owner@example.com', password: 'password123' });

  const res = await request(app)
    .post('/v1/auth/login')
    .send({ email: 'owner@example.com', password: 'password123' });

  return res.body.accessToken as string;
}

// ── Create Project ────────────────────────────────────────────────────────────

describe('POST /v1/projects', () => {
  it('basarili proje olusturma 201 dondurur', async () => {
    const token = await getPlatformToken();

    const res = await request(app)
      .post('/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'my-api' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('my-api');
    expect(typeof res.body._id).toBe('string');
  });

  it('token olmadan 401 dondurur', async () => {
    const res = await request(app)
      .post('/v1/projects')
      .send({ name: 'my-api' });

    expect(res.status).toBe(401);
  });

  it('bos isim ile 400 dondurur', async () => {
    const token = await getPlatformToken();

    const res = await request(app)
      .post('/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('isim alanı eksik 400 dondurur', async () => {
    const token = await getPlatformToken();

    const res = await request(app)
      .post('/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

// ── List Projects ─────────────────────────────────────────────────────────────

describe('GET /v1/projects', () => {
  it('yeni kullanicinin proje listesi bos doner', async () => {
    const token = await getPlatformToken();

    const res = await request(app)
      .get('/v1/projects')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('olusturulan proje listede gorunur', async () => {
    const token = await getPlatformToken();

    await request(app)
      .post('/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'my-api' });

    const res = await request(app)
      .get('/v1/projects')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('my-api');
  });

  it('bir kullanici diger kullanicinin projelerini goremez', async () => {
    const token1 = await getPlatformToken();

    // İkinci kullanici
    await request(app)
      .post('/v1/auth/register')
      .send({ email: 'other@example.com', password: 'password123' });
    const loginRes2 = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'other@example.com', password: 'password123' });
    const token2 = loginRes2.body.accessToken as string;

    // İlk kullanici proje olusturur
    await request(app)
      .post('/v1/projects')
      .set('Authorization', `Bearer ${token1}`)
      .send({ name: 'secret-project' });

    // İkinci kullanici projeleri gorememeli
    const res = await request(app)
      .get('/v1/projects')
      .set('Authorization', `Bearer ${token2}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('token olmadan 401 dondurur', async () => {
    const res = await request(app).get('/v1/projects');
    expect(res.status).toBe(401);
  });
});

// ── Delete Project ────────────────────────────────────────────────────────────

describe('DELETE /v1/projects/:id', () => {
  it('basarili silme 204 dondurur', async () => {
    const token = await getPlatformToken();

    const createRes = await request(app)
      .post('/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'to-delete' });

    const projectId = createRes.body._id as string;

    const res = await request(app)
      .delete(`/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });

  it('silme sonrasi proje listede gorünmez', async () => {
    const token = await getPlatformToken();

    const createRes = await request(app)
      .post('/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'to-delete' });

    const projectId = createRes.body._id as string;

    await request(app)
      .delete(`/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`);

    const listRes = await request(app)
      .get('/v1/projects')
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.body).toHaveLength(0);
  });

  it('baskasinin projesini silmeye calisinca 404 dondurur', async () => {
    const token1 = await getPlatformToken();

    await request(app)
      .post('/v1/auth/register')
      .send({ email: 'attacker@example.com', password: 'password123' });
    const attackerRes = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'attacker@example.com', password: 'password123' });
    const token2 = attackerRes.body.accessToken as string;

    const createRes = await request(app)
      .post('/v1/projects')
      .set('Authorization', `Bearer ${token1}`)
      .send({ name: 'victim-project' });

    const projectId = createRes.body._id as string;

    const res = await request(app)
      .delete(`/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${token2}`);

    expect(res.status).toBe(404);
  });
});
