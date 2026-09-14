import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { createTestDb } from '../db/connection';
import type { Db } from '../db/connection';
import { errorHandler } from '../middleware/error';
import { ensureSeeded, getDefaultAccount } from '../db/seed';
import { calibrateBalance } from '../services/accounts';
import { createLiability } from '../services/liabilities';
import { liabilityRoutes } from './liability.routes';
import { repaymentRoutes } from './repayment.routes';

function makeApp(db: Db): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/liabilities', liabilityRoutes(db));
  app.use('/api/repayments', repaymentRoutes(db));
  app.use(errorHandler);
  return app;
}

describe('repayment routes', () => {
  let db: Db;
  let app: Express;

  beforeEach(() => {
    db = createTestDb();
    ensureSeeded(db);
    app = makeApp(db);
  });

  async function seedLiability(remaining = 50, monthlyPayment = 10): Promise<number> {
    const acc = getDefaultAccount(db)!;
    calibrateBalance(db, acc.id, 100000);
    const liab = createLiability(db, { name: '房贷', remaining, monthlyPayment });
    return liab.id;
  }

  it('GET /api/repayments 初始为空数组', async () => {
    const res = await request(app).get('/api/repayments').expect(200);
    expect(res.body).toEqual([]);
  });

  it('GET /api/repayments?liabilityId= 按负债过滤', async () => {
    const id = await seedLiability();
    await request(app).post('/api/repayments').send({ liabilityId: id, amount: 5 }).expect(201);
    const res = await request(app).get(`/api/repayments?liabilityId=${id}`).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].liability_id).toBe(id);
  });

  it('GET /api/repayments?liabilityId=abc 非法 → 400', async () => {
    const res = await request(app).get('/api/repayments?liabilityId=abc').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST /api/repayments 创建成功返回 201 与还款记录', async () => {
    const id = await seedLiability();
    const res = await request(app)
      .post('/api/repayments')
      .send({ liabilityId: id, amount: 5 })
      .expect(201);
    expect(res.body).toMatchObject({ liability_id: id, amount_cents: 500 });
    expect(res.body.amount).toBe('5.00');
    expect(res.body.transaction_id).toBeTruthy();
  });

  it('POST /api/repayments 不传金额时自动用月供', async () => {
    const id = await seedLiability(50, 10);
    const res = await request(app).post('/api/repayments').send({ liabilityId: id }).expect(201);
    expect(res.body.amount_cents).toBe(1000);
  });

  it('POST /api/repayments 负债不存在 → 404', async () => {
    const res = await request(app)
      .post('/api/repayments')
      .send({ liabilityId: 999, amount: 5 })
      .expect(404);
    expect(res.body.error.code).toBe('LIABILITY_NOT_FOUND');
  });

  it('POST /api/repayments 金额超过本金 → 400', async () => {
    const id = await seedLiability(50, 10);
    const res = await request(app)
      .post('/api/repayments')
      .send({ liabilityId: id, amount: '50.01' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST /api/repayments 缺 liabilityId → 400', async () => {
    const res = await request(app).post('/api/repayments').send({ amount: 5 }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('DELETE /api/repayments/:id 返回 200 {ok:true}', async () => {
    const id = await seedLiability();
    const rep = await request(app).post('/api/repayments').send({ liabilityId: id, amount: 5 }).expect(201);
    const res = await request(app).delete(`/api/repayments/${rep.body.id}`).expect(200);
    expect(res.body).toEqual({ ok: true });
    // 余额与本金回到还款前（默认账户余额 1000 元 = 100000 分）
    const acc = getDefaultAccount(db)!;
    expect(acc.balance_cents).toBe(100000);
    const liabRes = await request(app).get('/api/liabilities').expect(200);
    expect(liabRes.body[0].remaining_cents).toBe(5000);
  });

  it('DELETE /api/repayments/999 不存在 → 404', async () => {
    const res = await request(app).delete('/api/repayments/999').expect(404);
    expect(res.body.error.code).toBe('REPAYMENT_NOT_FOUND');
  });

  it('DELETE /api/repayments/abc 非数字 id → 400', async () => {
    const res = await request(app).delete('/api/repayments/abc').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
