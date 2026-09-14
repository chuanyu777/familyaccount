import { describe, it, expect } from 'vitest';
import { createTestDb } from '../db/connection';
import type { Db } from '../db/connection';
import { ensureSeeded } from '../db/seed';
import { listCategories, upsertCategory, ensureDefaultCategory } from './categories';

function setup(): Db {
  const db = createTestDb();
  ensureSeeded(db);
  return db;
}

describe('categories', () => {
  describe('listCategories', () => {
    it('只返回指定 kind 的分类', () => {
      const db = setup();
      const exp = upsertCategory(db, { kind: 'expense', name: '餐饮' });
      const inc = upsertCategory(db, { kind: 'income', name: '工资' });
      const expenses = listCategories(db, 'expense');
      const incomes = listCategories(db, 'income');
      expect(expenses.find((c) => c.id === exp.id)).toBeTruthy();
      expect(expenses.find((c) => c.id === inc.id)).toBeUndefined();
      expect(incomes.find((c) => c.id === inc.id)).toBeTruthy();
      expect(incomes.find((c) => c.id === exp.id)).toBeUndefined();
    });
  });

  describe('upsertCategory', () => {
    it('同名再创建返回同一 id（绝不重复创建）', () => {
      const db = setup();
      const a = upsertCategory(db, { kind: 'expense', name: '餐饮' });
      const b = upsertCategory(db, { kind: 'expense', name: '餐饮' });
      expect(a.id).toBe(b.id);
      expect(listCategories(db, 'expense').filter((c) => c.name === '餐饮').length).toBe(1);
    });

    it('expense 与 income 同名互不冲突', () => {
      const db = setup();
      const e = upsertCategory(db, { kind: 'expense', name: '其他' });
      const i = upsertCategory(db, { kind: 'income', name: '其他' });
      expect(e.id).not.toBe(i.id);
      expect(e.kind).toBe('expense');
      expect(i.kind).toBe('income');
    });

    it('名称前后空白被归一化后判重', () => {
      const db = setup();
      const a = upsertCategory(db, { kind: 'expense', name: ' 餐饮 ' });
      const b = upsertCategory(db, { kind: 'expense', name: '餐饮' });
      expect(a.id).toBe(b.id);
    });

    it('name 去空白后为空抛 VALIDATION_FAILED', () => {
      const db = setup();
      expect(() => upsertCategory(db, { kind: 'expense', name: '   ' })).toThrowError(
        expect.objectContaining({ code: 'VALIDATION_FAILED' })
      );
    });
  });

  describe('ensureDefaultCategory', () => {
    it('expense 返回「其他」', () => {
      const db = setup();
      const c = ensureDefaultCategory(db, 'expense');
      expect(c.kind).toBe('expense');
      expect(c.name).toBe('其他');
    });

    it('income 返回「其他收入」', () => {
      const db = setup();
      const c = ensureDefaultCategory(db, 'income');
      expect(c.kind).toBe('income');
      expect(c.name).toBe('其他收入');
    });

    it('不存在时用 upsert 建出来且幂等', () => {
      const db = setup();
      db.prepare("DELETE FROM category WHERE kind='expense' AND name='其他'").run();
      const c1 = ensureDefaultCategory(db, 'expense');
      const c2 = ensureDefaultCategory(db, 'expense');
      expect(c1.id).toBe(c2.id);
      expect(c1.name).toBe('其他');
      expect(listCategories(db, 'expense').filter((c) => c.name === '其他').length).toBe(1);
    });
  });
});
