import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestDb } from '../db/connection';
import type { Db } from '../db/connection';
import { createApp } from '../app';
import type { Express } from 'express';

describe('member routes', () => {
  let db: Db;
  let app: Express;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db);
  });

  it('GET /api/members 初始为空数组', async () => {
    const res = await request(app).get('/api/members').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('POST /api/members 创建成功返回 201', async () => {
    const res = await request(app).post('/api/members').send({ name: 'Alice' }).expect(201);
    expect(res.body).toMatchObject({ id: 1, name: 'Alice' });
    expect(res.body.created_at).toBeTruthy();
  });

  it('POST /api/members 可带 color', async () => {
    const res = await request(app)
      .post('/api/members')
      .send({ name: 'Bob', color: '#ff0000' })
      .expect(201);
    expect(res.body.color).toBe('#ff0000');
  });

  it('POST /api/members 缺 name → 400', async () => {
    const res = await request(app).post('/api/members').send({}).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST /api/members name 仅空白 → 400', async () => {
    const res = await request(app).post('/api/members').send({ name: '  ' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('PATCH /api/members/:id 改名返回 200', async () => {
    const created = await request(app).post('/api/members').send({ name: 'Old' }).expect(201);
    const res = await request(app)
      .patch(`/api/members/${created.body.id}`)
      .send({ name: 'New' })
      .expect(200);
    expect(res.body.name).toBe('New');
  });

  it('PATCH /api/members/:id 不存在 → 404', async () => {
    const res = await request(app).patch('/api/members/999').send({ name: 'x' }).expect(404);
    expect(res.body.error.code).toBe('MEMBER_NOT_FOUND');
  });

  it('PATCH /api/members/abc 非数字 id → 400', async () => {
    const res = await request(app).patch('/api/members/abc').send({ name: 'x' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('DELETE /api/members/:id 返回 200 {ok:true}', async () => {
    const created = await request(app).post('/api/members').send({ name: 'Del' }).expect(201);
    const res = await request(app).delete(`/api/members/${created.body.id}`).expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('DELETE /api/members/999 不存在 → 404', async () => {
    const res = await request(app).delete('/api/members/999').expect(404);
    expect(res.body.error.code).toBe('MEMBER_NOT_FOUND');
  });

  it('DELETE /api/members/abc 非数字 id → 400', async () => {
    const res = await request(app).delete('/api/members/abc').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
