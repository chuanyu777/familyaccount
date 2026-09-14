import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../db/connection';
import type { Db } from '../db/connection';
import { ensureSeeded, getDefaultAccount } from '../db/seed';
import { calibrateBalance, getAccount, applyBalanceDelta } from './accounts';
import { createRepayment } from './repayments';
import { currentMonth, shiftMonth } from '../domain/month';
import {
  listLiabilities,
  getLiability,
  createLiability,
  updateLiability,
  deleteLiability,
  liabilitiesAtMonth,
  liabilitiesTotalAtMonth,
} from './liabilities';

function setup(): Db {
  const db = createTestDb();
  ensureSeeded(db);
  return db;
}

/** 直接插一行还款 + 其还款支出 txn（隔离测试 deleteLiability 级联，不依赖 repayments 服务）。 */
function seedRepayment(
  db: Db,
  liabilityId: number,
  opts: { amount: number; accountId: number }
): { repId: number; txnId: number } {
  const repRes = db
    .prepare(
      'INSERT INTO repayment (liability_id, amount_cents, occurred_on, account_id) VALUES (?, ?, ?, ?)'
    )
    .run(liabilityId, opts.amount, '2026-01-01', opts.accountId);
  const repId = Number(repRes.lastInsertRowid);
  const txnRes = db
    .prepare(
      "INSERT INTO txn (type, amount_cents, occurred_on, note, account_id, category_id, source_type, source_id) VALUES (?, ?, ?, ?, ?, ?, 'repayment', ?)"
    )
    .run('expense', opts.amount, '2026-01-01', '还款', opts.accountId, 1, repId);
  return { repId, txnId: Number(txnRes.lastInsertRowid) };
}

describe('liabilities', () => {
  describe('listLiabilities', () => {
    it('返回行并把 remaining / monthly_payment_cents 转成两位小数字符串元', () => {
      const db = setup();
      createLiability(db, { name: '房贷', remaining: 1200, monthlyPayment: 50 });
      const rows = listLiabilities(db);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.remaining).toBe('1200.00');
      expect(rows[0]!.monthlyPayment).toBe('50.00');
      expect(rows[0]!.remaining_cents).toBe(120000);
      expect(rows[0]!.monthly_payment_cents).toBe(5000);
    });

    it('空表返回空数组', () => {
      const db = setup();
      expect(listLiabilities(db)).toEqual([]);
    });
  });

  describe('getLiability', () => {
    it('不存在抛 LIABILITY_NOT_FOUND', () => {
      const db = setup();
      expect(() => getLiability(db, 999)).toThrowError(
        expect.objectContaining({ code: 'LIABILITY_NOT_FOUND' })
      );
    });

    it('存在的返回行', () => {
      const db = setup();
      const created = createLiability(db, { name: '车贷', remaining: '8000.50' });
      const got = getLiability(db, created.id);
      expect(got.name).toBe('车贷');
      expect(got.remaining).toBe('8000.50'); // remaining 以「元」传入
    });
  });

  describe('createLiability', () => {
    it('创建成功并回显 remaining 元字符串', () => {
      const db = setup();
      const r = createLiability(db, { name: '信用卡', remaining: 1000, monthlyPayment: 200 });
      expect(r.id).toBeGreaterThan(0);
      expect(r.remaining).toBe('1000.00');
      expect(r.monthlyPayment).toBe('200.00');
      expect(r.payment_day).toBeNull();
    });

    it('paymentDay 可空，给了的话写入', () => {
      const db = setup();
      const r = createLiability(db, { name: 'X', remaining: 100, paymentDay: 15 });
      expect(r.payment_day).toBe(15);
      const r2 = createLiability(db, { name: 'Y', remaining: 100, paymentDay: null });
      expect(r2.payment_day).toBeNull();
    });

    it('不依赖任何账户也能创建（删光账户后）', () => {
      const db = setup();
      db.prepare('DELETE FROM account').run();
      expect(() => createLiability(db, { name: '无账户负债', remaining: 500 })).not.toThrow();
      const rows = listLiabilities(db);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.name).toBe('无账户负债');
    });

    it('空名称抛 VALIDATION_FAILED', () => {
      const db = setup();
      expect(() => createLiability(db, { name: '   ', remaining: 100 })).toThrowError(
        expect.objectContaining({ code: 'VALIDATION_FAILED' })
      );
    });

    it('负本金抛 VALIDATION_FAILED', () => {
      const db = setup();
      expect(() => createLiability(db, { name: 'X', remaining: -1 })).toThrowError(
        expect.objectContaining({ code: 'VALIDATION_FAILED' })
      );
    });

    it('负月供抛 VALIDATION_FAILED', () => {
      const db = setup();
      expect(() =>
        createLiability(db, { name: 'X', remaining: 100, monthlyPayment: -5 })
      ).toThrowError(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
    });

    it('非法还款日（0 / 32）抛 VALIDATION_FAILED', () => {
      const db = setup();
      expect(() =>
        createLiability(db, { name: 'X', remaining: 100, paymentDay: 0 })
      ).toThrowError(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
      expect(() =>
        createLiability(db, { name: 'X', remaining: 100, paymentDay: 32 })
      ).toThrowError(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
    });
  });

  describe('updateLiability', () => {
    it('改名后回显', () => {
      const db = setup();
      const r = createLiability(db, { name: '旧', remaining: 100 });
      const u = updateLiability(db, r.id, { name: '新' });
      expect(u.name).toBe('新');
    });

    it('重设本金后回显', () => {
      const db = setup();
      const r = createLiability(db, { name: 'X', remaining: 100 });
      const u = updateLiability(db, r.id, { remaining: 250.5 });
      expect(u.remaining).toBe('250.50');
    });

    it('不存在抛 LIABILITY_NOT_FOUND', () => {
      const db = setup();
      expect(() => updateLiability(db, 999, { name: 'x' })).toThrowError(
        expect.objectContaining({ code: 'LIABILITY_NOT_FOUND' })
      );
    });
  });

  describe('deleteLiability（级联回滚）', () => {
    it('删除负债时级联：还款记录删除、账户余额回滚、还款支出 txn 删除', () => {
      const db = setup();
      const acc = getDefaultAccount(db)!;
      calibrateBalance(db, acc.id, 5000);
      const originalBalance = getAccount(db, acc.id).balance_cents; // 5000
      const liab = createLiability(db, { name: '房贷', remaining: 10000 });

      seedRepayment(db, liab.id, { amount: 1000, accountId: acc.id });
      seedRepayment(db, liab.id, { amount: 1000, accountId: acc.id });

      const repCountBefore = (
        db.prepare('SELECT COUNT(*) AS n FROM repayment WHERE liability_id = ?').get(liab.id) as {
          n: number;
        }
      ).n;
      const txnCountBefore = (
        db.prepare(
          "SELECT COUNT(*) AS n FROM txn WHERE source_type = 'repayment' AND account_id = ?"
        ).get(acc.id) as { n: number }
      ).n;
      expect(repCountBefore).toBe(2);
      expect(txnCountBefore).toBe(2);

      // 模拟两笔还款对账户余额的扣减（真实场景由 createRepayment 完成）
      applyBalanceDelta(db, acc.id, -(2 * 1000));

      const result = deleteLiability(db, liab.id);
      expect(result.deletedRepayments).toBe(2);

      // 负债没了
      expect(() => getLiability(db, liab.id)).toThrowError(
        expect.objectContaining({ code: 'LIABILITY_NOT_FOUND' })
      );
      // 还款记录没了
      expect(
        (db.prepare('SELECT COUNT(*) AS n FROM repayment WHERE liability_id = ?').get(liab.id) as {
          n: number;
        }).n
      ).toBe(0);
      // 还款支出 txn 没了
      expect(
        (db.prepare("SELECT COUNT(*) AS n FROM txn WHERE source_type = 'repayment'").get() as {
          n: number;
        }).n
      ).toBe(0);
      // 账户余额回滚到还款前（级联反向回滚本金扣减）
      expect(getAccount(db, acc.id).balance_cents).toBe(originalBalance);
    });

    it('不存在抛 LIABILITY_NOT_FOUND', () => {
      const db = setup();
      expect(() => deleteLiability(db, 999)).toThrowError(
        expect.objectContaining({ code: 'LIABILITY_NOT_FOUND' })
      );
    });
  });
});

describe('历史月份负债余额', () => {
  const M = currentMonth();
  const PREV = shiftMonth(M, -1);

  function mkLiability(db: Db, remaining: string): number {
    return createLiability(db, {
      name: '房贷',
      remaining,
      monthlyPayment: '30.00',
      paymentDay: 10,
    }).id;
  }

  it('月末剩余 = 当前剩余 + 该月之后的还款', () => {
    const db = setup();
    const id = mkLiability(db, '1000.00');
    // 建项时间提前到上上个月，否则历史月份会因「当时还不存在」记 0
    db.prepare('UPDATE liability SET created_at = ? WHERE id = ?').run(
      `${shiftMonth(PREV, -1)}-01 00:00:00`,
      id
    );
    createRepayment(db, { liabilityId: id, amount: '200.00', occurredOn: `${M}-05` });
    createRepayment(db, { liabilityId: id, amount: '50.00', occurredOn: `${PREV}-05` });

    // 现在剩余 750；PREV 月末前只还了上月的 50 → 950
    expect(getLiability(db, id).remaining_cents).toBe(75000);
    expect(liabilitiesAtMonth(db, PREV)).toEqual([{ id, cents: 95000 }]);
    // M 月末前两笔都已还 → 750
    expect(liabilitiesAtMonth(db, M)).toEqual([{ id, cents: 75000 }]);
    // 更早的月份两笔都还没还 → 1000
    expect(liabilitiesAtMonth(db, shiftMonth(PREV, -1))).toEqual([{ id, cents: 100000 }]);
  });

  it('创建月晚于目标月时记 0', () => {
    const db = setup();
    const id = mkLiability(db, '1000.00');
    db.prepare('UPDATE liability SET created_at = ? WHERE id = ?').run(`${M}-01 00:00:00`, id);
    expect(liabilitiesAtMonth(db, PREV)).toEqual([{ id, cents: 0 }]);
    expect(liabilitiesAtMonth(db, M)).toEqual([{ id, cents: 100000 }]);
  });

  it('月供合计只统计当时已存在的负债', () => {
    const db = setup();
    const a = mkLiability(db, '1000.00');
    db.prepare('UPDATE liability SET created_at = ? WHERE id = ?').run(`${M}-01 00:00:00`, a);
    expect(liabilitiesTotalAtMonth(db, PREV)).toEqual({
      remainingCents: 0,
      monthlyPaymentCents: 0,
    });
    expect(liabilitiesTotalAtMonth(db, M)).toEqual({
      remainingCents: 100000,
      monthlyPaymentCents: 3000,
    });
  });

  it('月份格式非法抛 VALIDATION_FAILED', () => {
    const db = setup();
    expect(() => liabilitiesAtMonth(db, '2026/09')).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_FAILED' })
    );
  });
});
