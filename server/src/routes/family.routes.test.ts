import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestDb } from '../db/connection';
import type { Db } from '../db/connection';
import { createApp } from '../app';
import type { Express } from 'express';

describe('family routes', () => {
  let db: Db;
  let app: Express;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db);
  });

  it('GET /api/family 返回已 seeded 的家庭', async () => {
    const res = await request(app).get('/api/family').expect(200);
    expect(res.body).toMatchObject({ id: 1, name: '我的家' });
  });

  it('PUT /api/family 更新并返回新名称', async () => {
    const res = await request(app).put('/api/family').send({ name: '新家名' }).expect(200);
    expect(res.body).toMatchObject({ id: 1, name: '新家名' });
    const again = await request(app).get('/api/family').expect(200);
    expect(again.body.name).toBe('新家名');
  });

  it('PUT /api/family 缺 name → 400 校验失败', async () => {
    const res = await request(app).put('/api/family').send({}).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('PUT /api/family name 为空串 → 400', async () => {
    const res = await request(app).put('/api/family').send({ name: '  ' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
