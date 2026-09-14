import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestDb } from '../db/connection';
import type { Db } from '../db/connection';
import { ensureSeeded } from '../db/seed';
import { createTransaction } from '../services/ledger';
import { createApp } from '../app';
import type { Express } from 'express';

function curMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

describe('stats routes', () => {
  let db: Db;
  let app: Express;

  beforeEach(() => {
    db = createTestDb();
    ensureSeeded(db);
    app = createApp(db);
  });

  it('GET /api/stats/summary → 200 结构正确', async () => {
    const res = await request(app).get('/api/stats/summary').expect(200);
    expect(res.body).toMatchObject({
      totalAssetsCents: 0,
      totalLiabilitiesCents: 0,
      netWorthCents: 0,
      monthlyPaymentTotalCents: 0,
      accountsTotalCents: 0,
      assetsTotalCents: 0,
    });
    expect(typeof res.body.totalAssets).toBe('string');
    expect(typeof res.body.netWorth).toBe('string');
  });

  it('GET /api/stats/monthly-trend → 200 默认 6 个月', async () => {
    const res = await request(app).get('/api/stats/monthly-trend').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(6);
    expect(res.body[res.body.length - 1].month).toBe(curMonth());
  });

  it('GET /api/stats/monthly-trend?months=3 → 3 个月', async () => {
    const res = await request(app).get('/api/stats/monthly-trend?months=3').expect(200);
    expect(res.body).toHaveLength(3);
  });

  it('GET /api/stats/monthly-trend?months=0 → 400', async () => {
    const res = await request(app).get('/api/stats/monthly-trend?months=0').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('GET /api/stats/monthly-trend?months=abc → 400', async () => {
    const res = await request(app).get('/api/stats/monthly-trend?months=abc').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('GET /api/stats/category-breakdown → 200 含支出', async () => {
    createTransaction(db, {
      type: 'expense',
      amount: '6.00',
      categoryName: '餐饮',
      occurredOn: `${curMonth()}-10`,
    });
    const res = await request(app)
      .get(`/api/stats/category-breakdown?month=${curMonth()}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].name).toBe('餐饮');
    expect(res.body[0].cents).toBe(600);
  });

  it('GET /api/stats/category-breakdown?month=2026-1 → 400', async () => {
    const res = await request(app).get('/api/stats/category-breakdown?month=2026-1').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('GET /api/stats/monthly-trend?end= 指定末月', async () => {
    const end = '2026-03';
    const res = await request(app).get(`/api/stats/monthly-trend?months=3&end=${end}`).expect(200);
    expect(res.body.map((p: { month: string }) => p.month)).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('GET /api/stats/monthly-trend?end=2026-1 → 400', async () => {
    const res = await request(app).get('/api/stats/monthly-trend?end=2026-1').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('GET /api/stats/monthly-snapshot → 200 默认当前月，字段齐全', async () => {
    const res = await request(app).get('/api/stats/monthly-snapshot').expect(200);
    expect(res.body.month).toBe(curMonth());
    expect(res.body).toMatchObject({
      incomeCents: 0,
      expenseCents: 0,
      netWorthCents: 0,
      assetsEstimated: false,
    });
    expect(Array.isArray(res.body.breakdown)).toBe(true);
  });

  it('GET /api/stats/monthly-snapshot?month= 取到该月收支与分类占比', async () => {
    const month = '2026-05';
    createTransaction(db, {
      type: 'expense',
      amount: '30.00',
      categoryName: '餐饮',
      occurredOn: `${month}-10`,
    });
    createTransaction(db, {
      type: 'income',
      amount: '100.00',
      categoryName: '工资',
      occurredOn: `${month}-01`,
    });
    const res = await request(app).get(`/api/stats/monthly-snapshot?month=${month}`).expect(200);
    expect(res.body.incomeCents).toBe(10000);
    expect(res.body.expenseCents).toBe(3000);
    expect(res.body.netCents).toBe(7000);
    expect(res.body.breakdown[0]).toMatchObject({ name: '餐饮', cents: 3000, percent: 100 });
  });

  it('GET /api/stats/monthly-snapshot?month=2026-1 → 400', async () => {
    const res = await request(app).get('/api/stats/monthly-snapshot?month=2026-1').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
