import { describe, it, expect } from 'vitest';
import { createTestDb } from '../db/connection';
import type { Db } from '../db/connection';
import {
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  setDefaultAccount,
  calibrateBalance,
  applyBalanceDelta,
  countTransactions,
  deleteAccount,
} from './accounts';
import type { AccountRow } from './accounts';

function insertTxn(
  db: Db,
  accountId: number,
  opts: { amount?: number; toAccountId?: number; type?: string } = {}
): void {
  const type = opts.type ?? 'expense';
  const amount = opts.amount ?? 100;
  db.prepare(
    'INSERT INTO txn (type, amount_cents, occurred_on, account_id, to_account_id) VALUES (?, ?, ?, ?, ?)'
  ).run(type, amount, '2026-01-01', accountId, opts.toAccountId ?? null);
}

describe('accounts', () => {
  describe('listAccounts', () => {
    it('把 balance_cents 转成两位小数字符串元', () => {
      const db: Db = createTestDb();
      const a = createAccount(db, { name: '现金' });
      calibrateBalance(db, a.id, 1234);
      const rows = listAccounts(db);
      expect(rows[0]!.balance).toBe('12.34');
    });
  });

  describe('getAccount', () => {
    it('返回存在的账户行', () => {
      const db: Db = createTestDb();
      const a = createAccount(db, { name: 'A' });
      const got = getAccount(db, a.id);
      expect(got.name).toBe('A');
      expect(got.balance_cents).toBe(0);
    });

    it('不存在的 id 抛 ACCOUNT_NOT_FOUND', () => {
      const db: Db = createTestDb();
      expect(() => getAccount(db, 999)).toThrowError(
        expect.objectContaining({ code: 'ACCOUNT_NOT_FOUND' })
      );
    });
  });

  describe('createAccount', () => {
    it('默认余额 0', () => {
      const db: Db = createTestDb();
      const a = createAccount(db, { name: 'B' });
      expect(a.balance_cents).toBe(0);
    });

    it('name 去掉首尾空白后为空抛 VALIDATION_FAILED', () => {
      const db: Db = createTestDb();
      expect(() => createAccount(db, { name: '   ' })).toThrowError(
        expect.objectContaining({ code: 'VALIDATION_FAILED' })
      );
    });

    it('不存在的 memberId 抛 MEMBER_NOT_FOUND', () => {
      const db: Db = createTestDb();
      expect(() => createAccount(db, { name: 'C', memberId: 42 })).toThrowError(
        expect.objectContaining({ code: 'MEMBER_NOT_FOUND' })
      );
    });
  });

  describe('updateAccount', () => {
    it('改名后返回新名称', () => {
      const db: Db = createTestDb();
      const a = createAccount(db, { name: 'Old' });
      const updated = updateAccount(db, a.id, { name: 'New' });
      expect(updated.name).toBe('New');
    });

    it('不存在的 id 抛 ACCOUNT_NOT_FOUND', () => {
      const db: Db = createTestDb();
      expect(() => updateAccount(db, 999, { name: 'X' })).toThrowError(
        expect.objectContaining({ code: 'ACCOUNT_NOT_FOUND' })
      );
    });
  });

  describe('setDefaultAccount', () => {
    it('切换后全局有且仅有一个 is_default=1', () => {
      const db: Db = createTestDb();
      const a = createAccount(db, { name: 'A' });
      const b = createAccount(db, { name: 'B' });
      setDefaultAccount(db, b.id);
      const rows = db
        .prepare('SELECT id, is_default FROM account ORDER BY id')
        .all() as { id: number; is_default: number }[];
      expect(rows.filter((r) => r.is_default === 1).length).toBe(1);
      expect(rows.find((r) => r.id === b.id)!.is_default).toBe(1);
    });

    it('不存在的 id 抛 ACCOUNT_NOT_FOUND', () => {
      const db: Db = createTestDb();
      expect(() => setDefaultAccount(db, 999)).toThrowError(
        expect.objectContaining({ code: 'ACCOUNT_NOT_FOUND' })
      );
    });
  });

  describe('calibrateBalance', () => {
    it('校准后余额等于新值，且允许负数', () => {
      const db: Db = createTestDb();
      const a = createAccount(db, { name: 'A' });
      const r1 = calibrateBalance(db, a.id, 500);
      expect(r1.balance_cents).toBe(500);
      const r2 = calibrateBalance(db, a.id, -300);
      expect(r2.balance_cents).toBe(-300);
    });

    it('不存在的 id 抛 ACCOUNT_NOT_FOUND', () => {
      const db: Db = createTestDb();
      expect(() => calibrateBalance(db, 999, 100)).toThrowError(
        expect.objectContaining({ code: 'ACCOUNT_NOT_FOUND' })
      );
    });
  });

  describe('applyBalanceDelta', () => {
    it('加减正确且允许变负', () => {
      const db: Db = createTestDb();
      const a = createAccount(db, { name: 'A' });
      calibrateBalance(db, a.id, 1000);
      applyBalanceDelta(db, a.id, 200);
      expect(getAccount(db, a.id).balance_cents).toBe(1200);
      applyBalanceDelta(db, a.id, -1500);
      expect(getAccount(db, a.id).balance_cents).toBe(-300);
    });
  });

  describe('countTransactions', () => {
    it('统计 account_id 或 to_account_id 出现的笔数', () => {
      const db: Db = createTestDb();
      const a = createAccount(db, { name: 'A' });
      const b = createAccount(db, { name: 'B' });
      insertTxn(db, a.id);
      insertTxn(db, a.id, { toAccountId: b.id, type: 'transfer' });
      expect(countTransactions(db, a.id)).toBe(2);
      expect(countTransactions(db, b.id)).toBe(1);
      expect(countTransactions(db, 999)).toBe(0);
    });
  });

  describe('deleteAccount', () => {
    it('有交易的账户抛 ACCOUNT_IN_USE 且带上笔数', () => {
      const db: Db = createTestDb();
      const a = createAccount(db, { name: 'A' });
      insertTxn(db, a.id);
      insertTxn(db, a.id);
      let err: unknown;
      try {
        deleteAccount(db, a.id);
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect((err as { code: string }).code).toBe('ACCOUNT_IN_USE');
      expect((err as { message: string }).message).toContain('2');
      // 未被删除
      expect(getAccount(db, a.id)).toBeTruthy();
    });

    it('无交易的账户删得掉', () => {
      const db: Db = createTestDb();
      const a = createAccount(db, { name: 'A' });
      expect(() => deleteAccount(db, a.id)).not.toThrow();
      expect(() => getAccount(db, a.id)).toThrowError(
        expect.objectContaining({ code: 'ACCOUNT_NOT_FOUND' })
      );
    });

    it('不存在的 id 抛 ACCOUNT_NOT_FOUND', () => {
      const db: Db = createTestDb();
      expect(() => deleteAccount(db, 999)).toThrowError(
        expect.objectContaining({ code: 'ACCOUNT_NOT_FOUND' })
      );
    });
  });
});
