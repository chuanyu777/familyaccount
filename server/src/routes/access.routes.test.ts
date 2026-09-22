import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { readAccessConfig } from '../auth/config';
import { createApp } from '../app';
import { createTestDb, type Db } from '../db/connection';

const enabledTestConfig = readAccessConfig({
  FAMILY_ACCESS_CODE: 'house-code',
  SESSION_SECRET: 'x'.repeat(48),
});

const productionTestConfig = readAccessConfig({
  NODE_ENV: 'production',
  FAMILY_ACCESS_CODE: 'house-code',
  SESSION_SECRET: 'x'.repeat(48),
});

describe('access routes', () => {
  let db: Db;

  beforeEach(() => {
    db = createTestDb();
  });

  it('requires a valid access session before serving protected APIs', async () => {
    const app = createApp(db, { accessConfig: enabledTestConfig });

    const denied = await request(app).get('/api/family').expect(401);
    expect(denied.body).toEqual({
      error: { code: 'ACCESS_REQUIRED', message: '需要家庭访问口令' },
    });

    const unlock = await request(app)
      .post('/api/access/unlock')
      .send({ code: 'house-code' })
      .expect(204);
    const cookie = unlock.headers['set-cookie']![0]!;

    await request(app).get('/api/access/session').set('Cookie', cookie).expect(204);
    await request(app).get('/api/family').set('Cookie', cookie).expect(200);

    const lock = await request(app).post('/api/access/lock').set('Cookie', cookie).expect(204);
    expect(lock.headers['set-cookie']![0]).toContain('Max-Age=0');
    await request(app).get('/api/access/session').set('Cookie', lock.headers['set-cookie']![0]!).expect(401);
  });

  it('rejects incorrect codes and the sixth failed attempt', async () => {
    const app = createApp(db, { accessConfig: enabledTestConfig });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app).post('/api/access/unlock').send({ code: 'wrong-code' }).expect(401);
    }

    await request(app).post('/api/access/unlock').send({ code: 'wrong-code' }).expect(429);
  });

  it('rejects an invalid cookie from both session and protected endpoints', async () => {
    const app = createApp(db, { accessConfig: enabledTestConfig });

    await request(app).get('/api/access/session').set('Cookie', 'family_access=invalid').expect(401);
    await request(app).get('/api/family').set('Cookie', 'family_access=invalid').expect(401);
  });

  it('sets a Secure access cookie in production', async () => {
    const app = createApp(db, { accessConfig: productionTestConfig });

    const unlock = await request(app)
      .post('/api/access/unlock')
      .send({ code: 'house-code' })
      .expect(204);

    expect(unlock.headers['set-cookie']![0]).toContain('Secure');
  });

  it('configures Express with the explicit proxy hop count', () => {
    const app = createApp(db, {
      accessConfig: readAccessConfig({
        FAMILY_ACCESS_CODE: 'house-code',
        SESSION_SECRET: 'x'.repeat(48),
        TRUST_PROXY_HOPS: '1',
      }),
    });

    expect(app.get('trust proxy')).toBe(1);
  });

  it('keeps access disabled when createApp is called without access configuration', async () => {
    const app = createApp(db);

    await request(app).get('/api/family').expect(200);
  });
});
