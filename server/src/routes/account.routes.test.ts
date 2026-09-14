import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestDb } from '../db/connection';
import type { Db } from '../db/connection';
import { createApp } from '../app';
import type { Express } from 'express';

describe('account routes', () => {
  let db: Db;
  let app: Express;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db);
  });

  it('GET /api/accounts 初始为空数组', async () => {
    const res = await request(app).get('/api/accounts').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('POST /api/accounts 创建成功返回 201', async () => {
    const res = await request(app).post('/api/accounts').send({ name: '现金' }).expect(201);
    expect(res.body).toMatchObject({ id: 1, name: '现金', member_id: null });
    expect(res.body.balance_cents).toBe(0);
  });

  it('POST /api/accounts 可关联 memberId', async () => {
    const m = await request(app).post('/api/members').send({ name: 'M' }).expect(201);
    const res = await request(app)
      .post('/api/accounts')
      .send({ name: '卡', memberId: m.body.id })
      .expect(201);
    expect(res.body.member_id).toBe(m.body.id);
  });

  it('POST /api/accounts 缺 name → 400', async () => {
    const res = await request(app).post('/api/accounts').send({}).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST /api/accounts 关联不存在成员 → 404', async () => {
    const res = await request(app)
      .post('/api/accounts')
      .send({ name: '卡', memberId: 999 })
      .expect(404);
    expect(res.body.error.code).toBe('MEMBER_NOT_FOUND');
  });

  it('PATCH /api/accounts/:id 改名返回 200', async () => {
    const acc = await request(app).post('/api/accounts').send({ name: 'A' }).expect(201);
    const res = await request(app)
      .patch(`/api/accounts/${acc.body.id}`)
      .send({ name: 'B' })
      .expect(200);
    expect(res.body.name).toBe('B');
  });

  it('PATCH /api/accounts/999 不存在 → 404', async () => {
    const res = await request(app).patch('/api/accounts/999').send({ name: 'x' }).expect(404);
    expect(res.body.error.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('PATCH /api/accounts/abc 非数字 id → 400', async () => {
    const res = await request(app).patch('/api/accounts/abc').send({ name: 'x' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('DELETE /api/accounts/:id（无交易）返回 200 {ok:true}', async () => {
    const acc = await request(app).post('/api/accounts').send({ name: 'A' }).expect(201);
    const res = await request(app).delete(`/api/accounts/${acc.body.id}`).expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('DELETE /api/accounts/:id 有交易 → 409 ACCOUNT_IN_USE', async () => {
    const acc = await request(app).post('/api/accounts').send({ name: 'A' }).expect(201);
    db.prepare(
      'INSERT INTO txn (type, amount_cents, occurred_on, account_id) VALUES (?, ?, ?, ?)'
    ).run('expense', 100, '2026-01-01', acc.body.id);
    const res = await request(app).delete(`/api/accounts/${acc.body.id}`).expect(409);
    expect(res.body.error.code).toBe('ACCOUNT_IN_USE');
  });

  it('DELETE /api/accounts/999 不存在 → 404', async () => {
    const res = await request(app).delete('/api/accounts/999').expect(404);
    expect(res.body.error.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('DELETE /api/accounts/abc 非数字 id → 400', async () => {
    const res = await request(app).delete('/api/accounts/abc').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST /api/accounts/:id/set-default 返回默认账户', async () => {
    const a = await request(app).post('/api/accounts').send({ name: 'A' }).expect(201);
    const b = await request(app).post('/api/accounts').send({ name: 'B' }).expect(201);
    const res = await request(app).post(`/api/accounts/${b.body.id}/set-default`).expect(200);
    expect(res.body.id).toBe(b.body.id);
    expect(res.body.is_default).toBe(1);
    // a 不再是默认（通过列表核对）
    const list = await request(app).get('/api/accounts').expect(200);
    const aRow = list.body.find((x: { id: number }) => x.id === a.body.id);
    const bRow = list.body.find((x: { id: number }) => x.id === b.body.id);
    expect(aRow.is_default).toBe(0);
    expect(bRow.is_default).toBe(1);
  });

  it('POST /api/accounts/999/set-default 不存在 → 404', async () => {
    const res = await request(app).post('/api/accounts/999/set-default').expect(404);
    expect(res.body.error.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('PATCH /api/accounts/:id/calibrate 校准余额返回 200', async () => {
    const acc = await request(app).post('/api/accounts').send({ name: 'A' }).expect(201);
    const res = await request(app)
      .patch(`/api/accounts/${acc.body.id}/calibrate`)
      .send({ balance: '12.34' })
      .expect(200);
    expect(res.body.balance_cents).toBe(1234);
  });

  it('PATCH /api/accounts/:id/calibrate 缺 balance → 400', async () => {
    const acc = await request(app).post('/api/accounts').send({ name: 'A' }).expect(201);
    const res = await request(app)
      .patch(`/api/accounts/${acc.body.id}/calibrate`)
      .send({})
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('PATCH /api/accounts/:id/calibrate 非法金额 → 400', async () => {
    const acc = await request(app).post('/api/accounts').send({ name: 'A' }).expect(201);
    const res = await request(app)
      .patch(`/api/accounts/${acc.body.id}/calibrate`)
      .send({ balance: 'abc' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('PATCH /api/accounts/999/calibrate 不存在 → 404', async () => {
    const res = await request(app)
      .patch('/api/accounts/999/calibrate')
      .send({ balance: '1.00' })
      .expect(404);
    expect(res.body.error.code).toBe('ACCOUNT_NOT_FOUND');
  });
});
