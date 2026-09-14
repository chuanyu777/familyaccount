import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { createTestDb } from '../db/connection';
import type { Db } from '../db/connection';
import { ensureSeeded } from '../db/seed';
import { transactionRoutes } from './transaction.routes';
import { categoryRoutes } from './category.routes';
import { errorHandler } from '../middleware/error';

function makeApp(db: Db): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/transactions', transactionRoutes(db));
  app.use('/api/categories', categoryRoutes(db));
  app.use(errorHandler);
  return app;
}

describe('category routes', () => {
  let db: Db;
  let app: Express;

  beforeEach(() => {
    db = createTestDb();
    ensureSeeded(db);
    app = makeApp(db);
  });

  it('GET /api/categories?kind=expense 返回数组', async () => {
    const res = await request(app).get('/api/categories?kind=expense').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/categories 创建返回 CategoryRow', async () => {
    const res = await request(app)
      .post('/api/categories')
      .send({ kind: 'expense', name: '餐饮' })
      .expect(200);
    expect(res.body).toMatchObject({ kind: 'expense', name: '餐饮' });
    expect(typeof res.body.id).toBe('number');
  });

  it('重复 POST 同名返回同一 id', async () => {
    const a = await request(app)
      .post('/api/categories')
      .send({ kind: 'expense', name: '餐饮' })
      .expect(200);
    const b = await request(app)
      .post('/api/categories')
      .send({ kind: 'expense', name: '餐饮' })
      .expect(200);
    expect(b.body.id).toBe(a.body.id);
  });

  it('kind 非法 → 400', async () => {
    const res = await request(app).post('/api/categories').send({ kind: 'bad', name: 'x' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('GET kind 缺失 → 400', async () => {
    const res = await request(app).get('/api/categories').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
