import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../db/connection';
import type { Db } from '../db/connection';
import { ensureSeeded, getDefaultAccount } from '../db/seed';
import { calibrateBalance, getAccount } from './accounts';
import { getLiability, createLiability, deleteLiability, listLiabilities } from './liabilities';
import { deleteTransaction } from './ledger';
import {
  createRepayment,
  deleteRepayment,
  listRepayments,
} from './repayments';

function setup(): Db {
  const db = createTestDb();
  ensureSeeded(db);
  return db;
}

/** 还款支出笔数 */
function repaymentTxnCount(db: Db): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM txn WHERE source_type = 'repayment'").get() as {
    n: number;
  }).n;
}

describe('repayments', () => {
  describe('createRepayment', () => {
    it('还款后四样数据同时正确：余额减、本金减、生成还款支出、source 关联', () => {
      const db = setup();
      const acc = getDefaultAccount(db)!;
      calibrateBalance(db, acc.id, 100000); // 1000 元
      // remaining 50 元 = 5000 分；monthlyPayment 10 元 = 1000 分
      const liab = createLiability(db, { name: '房贷', remaining: 50, monthlyPayment: 10 });

      // amount 5 元 = 500 分
      const res = createRepayment(db, { liabilityId: liab.id, amount: 5, accountId: acc.id });

      // ① 账户余额减少
      expect(getAccount(db, acc.id).balance_cents).toBe(100000 - 500);
      // ② 负债本金减少
      expect(getLiability(db, liab.id).remaining_cents).toBe(5000 - 500);
      // ③ 生成了一笔 repayment 支出
      expect(res.repayment.amount_cents).toBe(500);
      // ④ 该支出 source_type='repayment' 且 source_id 指向还款记录
      const txn = res.transaction;
      expect(txn.source_type).toBe('repayment');
      expect(txn.source_id).toBe(res.repayment.id);
      expect(txn.type).toBe('expense');
      expect(txn.amount_cents).toBe(500);
      expect(txn.account_id).toBe(acc.id);
      // transaction_id 回写
      expect(res.repayment.transaction_id).toBe(txn.id);
      // note = '还款 - {负债名称}'
      expect(txn.note).toBe('还款 - 房贷');
    });

    it('未传金额时自动用月供；月供为 0 且未传金额 → VALIDATION_FAILED', () => {
      const db = setup();
      const acc = getDefaultAccount(db)!;
      calibrateBalance(db, acc.id, 100000);
      const liab = createLiability(db, { name: '房贷', remaining: 50, monthlyPayment: 10 });

      const res = createRepayment(db, { liabilityId: liab.id, accountId: acc.id }); // 不传 amount
      expect(res.repayment.amount_cents).toBe(1000);

      const liab2 = createLiability(db, { name: '零月供', remaining: 50, monthlyPayment: 0 });
      expect(() =>
        createRepayment(db, { liabilityId: liab2.id, accountId: acc.id })
      ).toThrowError(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
    });

    it('还款金额可大于月供（只要不超过本金），本金按实际金额减少', () => {
      const db = setup();
      const acc = getDefaultAccount(db)!;
      calibrateBalance(db, acc.id, 100000);
      const liab = createLiability(db, { name: '房贷', remaining: 50, monthlyPayment: 10 });

      const res = createRepayment(db, { liabilityId: liab.id, amount: 30, accountId: acc.id }); // > 月供 10
      expect(res.repayment.amount_cents).toBe(3000);
      expect(getLiability(db, liab.id).remaining_cents).toBe(5000 - 3000);
      expect(getAccount(db, acc.id).balance_cents).toBe(100000 - 3000);
    });

    it('还款金额超过剩余本金 → VALIDATION_FAILED（说明超出多少）', () => {
      const db = setup();
      const acc = getDefaultAccount(db)!;
      calibrateBalance(db, acc.id, 100000);
      const liab = createLiability(db, { name: '房贷', remaining: 50, monthlyPayment: 10 });

      expect(() =>
        createRepayment(db, { liabilityId: liab.id, amount: '50.01', accountId: acc.id })
      ).toThrowError(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
      // 本金未被改动
      expect(getLiability(db, liab.id).remaining_cents).toBe(5000);
    });

    it('负债不存在 → LIABILITY_NOT_FOUND', () => {
      const db = setup();
      const acc = getDefaultAccount(db)!;
      expect(() =>
        createRepayment(db, { liabilityId: 999, amount: 5, accountId: acc.id })
      ).toThrowError(expect.objectContaining({ code: 'LIABILITY_NOT_FOUND' }));
    });

    it('账户不存在 → ACCOUNT_NOT_FOUND', () => {
      const db = setup();
      const liab = createLiability(db, { name: 'X', remaining: 50 });
      expect(() =>
        createRepayment(db, { liabilityId: liab.id, amount: 5, accountId: 999 })
      ).toThrowError(expect.objectContaining({ code: 'ACCOUNT_NOT_FOUND' }));
    });

    it('未传 accountId 时用默认账户', () => {
      const db = setup();
      const acc = getDefaultAccount(db)!;
      calibrateBalance(db, acc.id, 100000);
      const liab = createLiability(db, { name: 'X', remaining: 50, monthlyPayment: 10 });
      const res = createRepayment(db, { liabilityId: liab.id });
      expect(res.transaction.account_id).toBe(acc.id);
    });
  });

  describe('deleteRepayment（完整反向回滚）', () => {
    it('删除还款后完全回到还款前状态：余额、本金、txn 数量三者一致', () => {
      const db = setup();
      const acc = getDefaultAccount(db)!;
      calibrateBalance(db, acc.id, 100000);
      const liab = createLiability(db, { name: '房贷', remaining: 50, monthlyPayment: 10 });

      const before = {
        balance: getAccount(db, acc.id).balance_cents, // 100000
        remaining: getLiability(db, liab.id).remaining_cents, // 5000
        txnCount: repaymentTxnCount(db), // 0
      };

      const rep = createRepayment(db, { liabilityId: liab.id, amount: 5, accountId: acc.id });

      // 还款后应与 before 不同
      expect(getAccount(db, acc.id).balance_cents).toBe(before.balance - 500);
      expect(getLiability(db, liab.id).remaining_cents).toBe(before.remaining - 500);
      expect(repaymentTxnCount(db)).toBe(before.txnCount + 1);

      // 删除还款
      deleteRepayment(db, rep.repayment.id);

      // 完全回到还款前
      expect(getAccount(db, acc.id).balance_cents).toBe(before.balance);
      expect(getLiability(db, liab.id).remaining_cents).toBe(before.remaining);
      expect(repaymentTxnCount(db)).toBe(before.txnCount);
      // 还款记录也没了
      expect((db.prepare('SELECT COUNT(*) AS n FROM repayment').get() as { n: number }).n).toBe(0);
    });

    it('不存在 → REPAYMENT_NOT_FOUND', () => {
      const db = setup();
      expect(() => deleteRepayment(db, 999)).toThrowError(
        expect.objectContaining({ code: 'REPAYMENT_NOT_FOUND' })
      );
    });
  });

  describe('联动闭环', () => {
    it('还款生成的支出不能被 ledger.deleteTransaction 直接删除（GENERATED_BY_REPAYMENT）', () => {
      const db = setup();
      const acc = getDefaultAccount(db)!;
      calibrateBalance(db, acc.id, 100000);
      const liab = createLiability(db, { name: '房贷', remaining: 50, monthlyPayment: 10 });
      const rep = createRepayment(db, { liabilityId: liab.id, amount: 5, accountId: acc.id });

      expect(() => deleteTransaction(db, rep.transaction.id)).toThrowError(
        expect.objectContaining({ code: 'GENERATED_BY_REPAYMENT' })
      );
      // 仍可被 deleteRepayment 删除
      deleteRepayment(db, rep.repayment.id);
      expect(getAccount(db, acc.id).balance_cents).toBe(100000);
    });

    it('删除负债时级联回滚：还款记录删、账户余额回滚、支出删', () => {
      const db = setup();
      const acc = getDefaultAccount(db)!;
      calibrateBalance(db, acc.id, 100000);
      const liab = createLiability(db, { name: '房贷', remaining: 50, monthlyPayment: 10 });

      const rep = createRepayment(db, { liabilityId: liab.id, amount: 5, accountId: acc.id });

      const balAfterRepay = getAccount(db, acc.id).balance_cents; // 100000 - 500

      deleteLiability(db, liab.id);

      // 负债、还款记录、支出都没了
      expect(() => getLiability(db, liab.id)).toThrowError(
        expect.objectContaining({ code: 'LIABILITY_NOT_FOUND' })
      );
      expect((db.prepare('SELECT COUNT(*) AS n FROM repayment').get() as { n: number }).n).toBe(0);
      expect(repaymentTxnCount(db)).toBe(0);
      // 账户余额回滚到还款前（反向回滚 -500）
      expect(getAccount(db, acc.id).balance_cents).toBe(balAfterRepay + 500);
    });
  });

  describe('listRepayments / 列表联动', () => {
    it('还款后负债列表里 remaining 已更新', () => {
      const db = setup();
      const acc = getDefaultAccount(db)!;
      calibrateBalance(db, acc.id, 100000);
      const liab = createLiability(db, { name: '房贷', remaining: 50, monthlyPayment: 10 });
      createRepayment(db, { liabilityId: liab.id, amount: 5, accountId: acc.id });
      const rows = listLiabilities(db);
      expect(rows[0]!.remaining_cents).toBe(4500);
    });

    it('按 liabilityId 过滤', () => {
      const db = setup();
      const acc = getDefaultAccount(db)!;
      calibrateBalance(db, acc.id, 100000);
      const a = createLiability(db, { name: '房贷', remaining: 50, monthlyPayment: 10 });
      const b = createLiability(db, { name: '车贷', remaining: 50, monthlyPayment: 10 });
      createRepayment(db, { liabilityId: a.id, amount: 5, accountId: acc.id });
      createRepayment(db, { liabilityId: b.id, amount: 3, accountId: acc.id });
      const onlyA = listRepayments(db, a.id);
      expect(onlyA).toHaveLength(1);
      expect(onlyA[0]!.liability_id).toBe(a.id);
    });
  });
});
