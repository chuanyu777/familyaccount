import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { createTestDb } from '../db/connection';
import type { Db } from '../db/connection';
import { ensureSeeded, getDefaultAccount } from '../db/seed';
import { assetRoutes } from './asset.routes';
import { memberRoutes } from './member.routes';
import { errorHandler } from '../middleware/error';
import { currentMonth, shiftMonth } from '../domain/month';

function makeApp(db: Db): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/members', memberRoutes(db));
  app.use('/api/assets', assetRoutes(db));
  app.use(errorHandler);
  return app;
}

describe('asset routes', () => {
  let db: Db;
  let app: Express;

  beforeEach(() => {
    db = createTestDb();
    ensureSeeded(db);
    app = makeApp(db);
  });

  it('GET /api/assets 初始为空数组', async () => {
    const res = await request(app).get('/api/assets').expect(200);
    expect(res.body).toEqual([]);
  });

  it('POST /api/assets 创建成功返回 201，默认值 0、类型「其他」、归属 NULL', async () => {
    const res = await request(app).post('/api/assets').send({ name: '房子' }).expect(201);
    expect(res.body).toMatchObject({
      id: 1,
      name: '房子',
      value_cents: 0,
      kind: '其他',
      member_id: null,
    });
  });

  it('POST /api/assets 接受 value 数字字符串，转分', async () => {
    const res = await request(app)
      .post('/api/assets')
      .send({ name: 'A', value: '12.34' })
      .expect(201);
    expect(res.body.value_cents).toBe(1234);
  });

  it('POST /api/assets 可关联 memberId', async () => {
    const m = await request(app).post('/api/members').send({ name: 'M' }).expect(201);
    const res = await request(app)
      .post('/api/assets')
      .send({ name: 'A', memberId: m.body.id })
      .expect(201);
    expect(res.body.member_id).toBe(m.body.id);
  });

  it('POST /api/assets 缺 name → 400 VALIDATION_FAILED', async () => {
    const res = await request(app).post('/api/assets').send({}).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST /api/assets 负市值 → 400 VALIDATION_FAILED', async () => {
    const res = await request(app)
      .post('/api/assets')
      .send({ name: 'A', value: -5 })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('PATCH /api/assets/:id 更新市值与更新人返回 200', async () => {
    const created = await request(app).post('/api/assets').send({ name: 'A' }).expect(201);
    const m = await request(app).post('/api/members').send({ name: 'M' }).expect(201);
    const res = await request(app)
      .patch(`/api/assets/${created.body.id}`)
      .send({ value: '80.00', updatedByMemberId: m.body.id })
      .expect(200);
    expect(res.body.value_cents).toBe(8000);
    expect(res.body.updated_by_member_id).toBe(m.body.id);
  });

  it('PATCH /api/assets/999 不存在 → 404 ASSET_NOT_FOUND', async () => {
    const res = await request(app)
      .patch('/api/assets/999')
      .send({ name: 'x' })
      .expect(404);
    expect(res.body.error.code).toBe('ASSET_NOT_FOUND');
  });

  it('PATCH /api/assets/abc 非法 id → 400 VALIDATION_FAILED', async () => {
    const res = await request(app)
      .patch('/api/assets/abc')
      .send({ name: 'x' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('DELETE /api/assets/:id 返回 200 {ok:true}', async () => {
    const created = await request(app).post('/api/assets').send({ name: 'A' }).expect(201);
    const res = await request(app).delete(`/api/assets/${created.body.id}`).expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('DELETE /api/assets/999 不存在 → 404 ASSET_NOT_FOUND', async () => {
    const res = await request(app).delete('/api/assets/999').expect(404);
    expect(res.body.error.code).toBe('ASSET_NOT_FOUND');
  });

  it('DELETE /api/assets/abc 非法 id → 400 VALIDATION_FAILED', async () => {
    const res = await request(app).delete('/api/assets/abc').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('规则3：创建资产项不影响默认账户余额', async () => {
    const before = getDefaultAccount(db);
    expect(before?.balance_cents).toBe(0);
    await request(app).post('/api/assets').send({ name: 'A', value: '5000.00' }).expect(201);
    const after = getDefaultAccount(db);
    expect(after?.balance_cents).toBe(0);
  });
});

describe('asset snapshot routes', () => {
  let db: Db;
  let app: Express;
  const M = currentMonth();
  const PREV = shiftMonth(M, -1);

  async function mkAsset(name = '股票', value = '100.00'): Promise<number> {
    const res = await request(app).post('/api/assets').send({ name, value }).expect(201);
    return res.body.id as number;
  }

  beforeEach(() => {
    db = createTestDb();
    ensureSeeded(db);
    app = makeApp(db);
  });

  it('GET /:id/snapshots 建项后自带当月快照', async () => {
    const id = await mkAsset();
    const res = await request(app).get(`/api/assets/${id}/snapshots`).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ month: M, value_cents: 10000, value: '100.00' });
  });

  it('POST /:id/snapshots 当前月 → 201 且同步当前市值', async () => {
    const id = await mkAsset();
    const res = await request(app)
      .post(`/api/assets/${id}/snapshots`)
      .send({ month: M, value: '120.00', note: '月末更新' })
      .expect(201);
    expect(res.body).toMatchObject({ month: M, value_cents: 12000, note: '月末更新' });
    const list = await request(app).get('/api/assets').expect(200);
    expect(list.body.find((a: { id: number }) => a.id === id).value_cents).toBe(12000);
  });

  it('POST /:id/snapshots 历史月份 → 只写快照不动当前市值', async () => {
    const id = await mkAsset();
    await request(app)
      .post(`/api/assets/${id}/snapshots`)
      .send({ month: PREV, value: '80.00' })
      .expect(201);
    const list = await request(app).get('/api/assets').expect(200);
    expect(list.body.find((a: { id: number }) => a.id === id).value_cents).toBe(10000);
    const snaps = await request(app).get(`/api/assets/${id}/snapshots`).expect(200);
    expect(snaps.body.map((s: { month: string }) => s.month)).toEqual([M, PREV]);
  });

  it('POST /:id/snapshots 未来月份 → 400 FUTURE_MONTH', async () => {
    const id = await mkAsset();
    const res = await request(app)
      .post(`/api/assets/${id}/snapshots`)
      .send({ month: shiftMonth(M, 1), value: '1.00' })
      .expect(400);
    expect(res.body.error.code).toBe('FUTURE_MONTH');
  });

  it('POST /:id/snapshots 月份格式非法 → 400', async () => {
    const id = await mkAsset();
    await request(app)
      .post(`/api/assets/${id}/snapshots`)
      .send({ month: '2026-13', value: '1.00' })
      .expect(400);
  });

  it('POST /api/assets/999/snapshots → 404 ASSET_NOT_FOUND', async () => {
    await request(app)
      .post('/api/assets/999/snapshots')
      .send({ month: M, value: '1.00' })
      .expect(404);
  });

  it('DELETE /api/assets/snapshots/:id → 删除成功；再删 404', async () => {
    const id = await mkAsset();
    await request(app).post(`/api/assets/${id}/snapshots`).send({ month: PREV, value: '80.00' });
    const list = await request(app).get(`/api/assets/${id}/snapshots`).expect(200);
    const snapId = list.body.find((s: { month: string }) => s.month === PREV).id;
    await request(app).delete(`/api/assets/snapshots/${snapId}`).expect(200);
    const after = await request(app).get(`/api/assets/${id}/snapshots`).expect(200);
    expect(after.body).toHaveLength(1);
    await request(app).delete(`/api/assets/snapshots/${snapId}`).expect(404);
  });
});
