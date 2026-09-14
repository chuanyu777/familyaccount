import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { createTestDb } from '../db/connection';
import type { Db } from '../db/connection';
import { errorHandler } from '../middleware/error';
import { ensureSeeded } from '../db/seed';
import { liabilityRoutes } from './liability.routes';

function makeApp(db: Db): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/liabilities', liabilityRoutes(db));
  app.use(errorHandler);
  return app;
}

describe('liability routes', () => {
  let db: Db;
  let app: Express;

  beforeEach(() => {
    db = createTestDb();
    ensureSeeded(db);
    app = makeApp(db);
  });

  it('GET /api/liabilities 初始为空数组', async () => {
    const res = await request(app).get('/api/liabilities').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('POST /api/liabilities 创建成功返回 201 与元字符串', async () => {
    const res = await request(app)
      .post('/api/liabilities')
      .send({ name: '房贷', remaining: 1200, monthlyPayment: 50 })
      .expect(201);
    expect(res.body).toMatchObject({ name: '房贷', remaining: '1200.00', monthlyPayment: '50.00' });
    expect(res.body.remaining_cents).toBe(120000);
  });

  it('POST /api/liabilities 缺 name → 400', async () => {
    const res = await request(app).post('/api/liabilities').send({ remaining: 100 }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST /api/liabilities 负本金 → 400', async () => {
    const res = await request(app)
      .post('/api/liabilities')
      .send({ name: 'X', remaining: -5 })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST /api/liabilities 非法还款日 → 400', async () => {
    const res = await request(app)
      .post('/api/liabilities')
      .send({ name: 'X', remaining: 100, paymentDay: 40 })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('PATCH /api/liabilities/:id 改名返回 200', async () => {
    const liab = await request(app)
      .post('/api/liabilities')
      .send({ name: 'A', remaining: 100 })
      .expect(201);
    const res = await request(app)
      .patch(`/api/liabilities/${liab.body.id}`)
      .send({ name: 'B' })
      .expect(200);
    expect(res.body.name).toBe('B');
  });

  it('PATCH /api/liabilities/999 不存在 → 404', async () => {
    const res = await request(app).patch('/api/liabilities/999').send({ name: 'x' }).expect(404);
    expect(res.body.error.code).toBe('LIABILITY_NOT_FOUND');
  });

  it('PATCH /api/liabilities/abc 非数字 id → 400', async () => {
    const res = await request(app).patch('/api/liabilities/abc').send({ name: 'x' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('DELETE /api/liabilities/:id 返回 200 {ok:true}', async () => {
    const liab = await request(app)
      .post('/api/liabilities')
      .send({ name: 'A', remaining: 100 })
      .expect(201);
    const res = await request(app).delete(`/api/liabilities/${liab.body.id}`).expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('DELETE /api/liabilities/999 不存在 → 404', async () => {
    const res = await request(app).delete('/api/liabilities/999').expect(404);
    expect(res.body.error.code).toBe('LIABILITY_NOT_FOUND');
  });

  it('DELETE /api/liabilities/abc 非数字 id → 400', async () => {
    const res = await request(app).delete('/api/liabilities/abc').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
