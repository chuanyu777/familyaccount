import { describe, it, expect } from 'vitest';
import { createTestDb } from './connection';
import { ensureSeeded, getDefaultAccount } from './seed';
import type { Db } from './connection';

function count(db: Db, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}

describe('ensureSeeded', () => {
  it('首次调用插入初始数据', () => {
    const db = createTestDb();
    ensureSeeded(db);
    expect(count(db, 'family')).toBe(1);
    expect(count(db, 'member')).toBe(1);
    expect(count(db, 'account')).toBe(1);
    expect(count(db, 'category')).toBe(2);
  });

  it('幂等：连续调用两次不产生重复数据、不抛错', () => {
    const db = createTestDb();
    expect(() => {
      ensureSeeded(db);
      ensureSeeded(db);
    }).not.toThrow();
    expect(count(db, 'family')).toBe(1);
    expect(count(db, 'member')).toBe(1);
    expect(count(db, 'account')).toBe(1);
    expect(count(db, 'category')).toBe(2);
  });

  it('默认账户存在且 is_default=1', () => {
    const db = createTestDb();
    ensureSeeded(db);
    const acc = getDefaultAccount(db);
    expect(acc).toBeTruthy();
    expect(acc!.is_default).toBe(1);
    expect(acc!.balance_cents).toBe(0);
  });
});
