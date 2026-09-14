import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { createTestDb } from '../db/connection';
import type { Db } from '../db/connection';
import { ensureSeeded, getDefaultAccount } from '../db/seed';
import { createAccount } from '../services/accounts';
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

describe('transaction routes', () => {
  let db: Db;
  let app: Express;

  beforeEach(() => {
    db = createTestDb();
    ensureSeeded(db);
    app = makeApp(db);
  });

  const def = () => getDefaultAccount(db)!;

  it('POST 支出 成功返回 201', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .send({ type: 'expense', amount: '12.34' })
      .expect(201);
    expect(res.body.transaction.type).toBe('expense');
    expect(res.body.transaction.amount).toBe('12.34');
  });

  it('POST 收入 成功返回 201', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .send({ type: 'income', amount: 50 })
      .expect(201);
    expect(res.body.transaction.type).toBe('income');
    expect(res.body.transaction.amount).toBe('50.00');
  });

  it('POST 转账 成功返回 201', async () => {
    const other = createAccount(db, { name: '卡' });
    const res = await request(app)
      .post('/api/transactions')
      .send({ type: 'transfer', amount: '5.00', accountId: def().id, toAccountId: other.id })
      .expect(201);
    expect(res.body.transaction.type).toBe('transfer');
  });

  it('POST 金额 0 → 400', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .send({ type: 'expense', amount: 0 })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST 金额负数 → 400', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .send({ type: 'expense', amount: -5 })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST 转账缺 toAccountId → 400', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .send({ type: 'transfer', amount: '5.00', accountId: def().id })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST 转账 toAccountId 与转出相同 → 400', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .send({ type: 'transfer', amount: '5.00', accountId: def().id, toAccountId: def().id })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('GET 默认当月 + 排序（日期倒序、同日期 id 倒序）', async () => {
    await request(app)
      .post('/api/transactions')
      .send({ type: 'expense', amount: '1.00', occurredOn: '2026-09-05' });
    await request(app)
      .post('/api/transactions')
      .send({ type: 'expense', amount: '2.00', occurredOn: '2026-09-10' });
    const a = await request(app)
      .post('/api/transactions')
      .send({ type: 'expense', amount: '3.00', occurredOn: '2026-09-10' });
    const b = await request(app)
      .post('/api/transactions')
      .send({ type: 'expense', amount: '4.00', occurredOn: '2026-09-10' });

    const res = await request(app).get('/api/transactions').expect(200);
    const dates = res.body.items.map((x: { occurredOn: string }) => x.occurredOn);
    expect(dates.indexOf('2026-09-10')).toBeLessThan(dates.indexOf('2026-09-05'));

    const sameDay = res.body.items.filter(
      (x: { occurredOn: string }) => x.occurredOn === '2026-09-10'
    );
    expect(sameDay[0].id).toBe(b.body.transaction.id);
    expect(sameDay[1].id).toBe(a.body.transaction.id);
  });

  it('GET 四种筛选维度生效', async () => {
    const other = createAccount(db, { name: 'B' });
    const m = db.prepare('SELECT id FROM member WHERE name = ?').get('我') as { id: number };

    await request(app)
      .post('/api/transactions')
      .send({ type: 'expense', amount: '1.00', occurredOn: '2026-09-01', accountId: def().id, memberId: m.id });
    await request(app)
      .post('/api/transactions')
      .send({ type: 'income', amount: '2.00', occurredOn: '2026-09-02', accountId: other.id });
    await request(app)
      .post('/api/transactions')
      .send({ type: 'income', amount: '3.00', occurredOn: '2026-08-01', accountId: other.id });

    const byMonth = await request(app).get('/api/transactions?month=2026-08').expect(200);
    expect(byMonth.body.total).toBe(1);
    expect(byMonth.body.items[0].type).toBe('income');

    const byType = await request(app).get('/api/transactions?type=income').expect(200);
    expect(byType.body.items.every((x: { type: string }) => x.type === 'income')).toBe(true);

    const byAccount = await request(app).get(`/api/transactions?accountId=${other.id}`).expect(200);
    expect(
      byAccount.body.items.every(
        (x: { accountId: number; toAccountId: number | null }) =>
          x.accountId === other.id || x.toAccountId === other.id
      )
    ).toBe(true);

    const byMember = await request(app).get(`/api/transactions?memberId=${m.id}`).expect(200);
    expect(byMember.body.items.every((x: { memberId: number }) => x.memberId === m.id)).toBe(true);
  });

  it('GET 返回合计结构', async () => {
    await request(app).post('/api/transactions').send({ type: 'expense', amount: '1.00' });
    await request(app).post('/api/transactions').send({ type: 'income', amount: '3.00' });

    const res = await request(app).get('/api/transactions').expect(200);
    expect(res.body).toHaveProperty('incomeTotalCents', 300);
    expect(res.body).toHaveProperty('expenseTotalCents', 100);
    expect(res.body).toHaveProperty('netCents', 200);
    expect(res.body).toHaveProperty('total', 2);
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('pageSize');
  });

  it('GET 分页：第 2 页内容不同、total 不变', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/transactions')
        .send({ type: 'expense', amount: '1.00', occurredOn: `2026-09-0${i + 1}` });
    }
    const p1 = await request(app).get('/api/transactions?page=1&pageSize=1').expect(200);
    const p2 = await request(app).get('/api/transactions?page=2&pageSize=1').expect(200);
    expect(p1.body.total).toBe(3);
    expect(p2.body.total).toBe(3);
    expect(p1.body.items[0].id).not.toBe(p2.body.items[0].id);
  });

  it('PATCH 改金额后 GET 统计同步更新', async () => {
    const c = await request(app)
      .post('/api/transactions')
      .send({ type: 'income', amount: '1.00' })
      .expect(201);
    let res = await request(app).get('/api/transactions').expect(200);
    expect(res.body.incomeTotalCents).toBe(100);

    await request(app)
      .patch(`/api/transactions/${c.body.transaction.id}`)
      .send({ amount: '2.00' })
      .expect(200);

    res = await request(app).get('/api/transactions').expect(200);
    expect(res.body.incomeTotalCents).toBe(200);
  });

  it('DELETE 成功返回 200 {ok:true}', async () => {
    const c = await request(app)
      .post('/api/transactions')
      .send({ type: 'expense', amount: '1.00' })
      .expect(201);
    const res = await request(app).delete(`/api/transactions/${c.body.transaction.id}`).expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('DELETE 还款生成记录 → 409 GENERATED_BY_REPAYMENT', async () => {
    const r = db
      .prepare(
        'INSERT INTO txn (type, amount_cents, occurred_on, account_id, source_type) VALUES (?, ?, ?, ?, ?)'
      )
      .run('expense', 100, '2026-09-01', def().id, 'repayment');
    const id = Number(r.lastInsertRowid);
    const res = await request(app).delete(`/api/transactions/${id}`).expect(409);
    expect(res.body.error.code).toBe('GENERATED_BY_REPAYMENT');
  });

  it('GET 不存在 id → 404', async () => {
    const res = await request(app).get('/api/transactions/999').expect(404);
    expect(res.body.error.code).toBe('TXN_NOT_FOUND');
  });

  it('GET 非数字 id → 400', async () => {
    const res = await request(app).get('/api/transactions/abc').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('PATCH 不存在 id → 404', async () => {
    const res = await request(app)
      .patch('/api/transactions/999')
      .send({ amount: '2.00' })
      .expect(404);
    expect(res.body.error.code).toBe('TXN_NOT_FOUND');
  });

  it('DELETE 不存在 id → 404', async () => {
    const res = await request(app).delete('/api/transactions/999').expect(404);
    expect(res.body.error.code).toBe('TXN_NOT_FOUND');
  });

  it('GET 列表非法 query → 400', async () => {
    const res = await request(app).get('/api/transactions?month=2026').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const res2 = await request(app).get('/api/transactions?page=0').expect(400);
    expect(res2.body.error.code).toBe('VALIDATION_FAILED');
  });
});
