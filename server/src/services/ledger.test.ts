import { describe, it, expect } from 'vitest';
import { createTestDb } from '../db/connection';
import type { Db } from '../db/connection';
import { ensureSeeded, getDefaultAccount } from '../db/seed';
import { getAccount, createAccount, calibrateBalance } from './accounts';
import { listMembers } from './members';
import { listCategories } from './categories';
import { createTransaction, updateTransaction, deleteTransaction } from './ledger';

function setup(): Db {
  const db = createTestDb();
  ensureSeeded(db);
  return db;
}

function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

describe('ledger createTransaction', () => {
  it('支出使默认账户余额减少（amount 单位为元，落库为分）', () => {
    const db = setup();
    const def = getDefaultAccount(db)!;
    createTransaction(db, { type: 'expense', amount: 100 });
    expect(getAccount(db, def.id).balance_cents).toBe(-10000);
  });

  it('收入使默认账户余额增加（amount 单位为元，落库为分）', () => {
    const db = setup();
    const def = getDefaultAccount(db)!;
    createTransaction(db, { type: 'income', amount: 250 });
    expect(getAccount(db, def.id).balance_cents).toBe(25000);
  });

  it('转账：转出账户减少、转入账户增加（amount 单位为元，落库为分）', () => {
    const db = setup();
    const def = getDefaultAccount(db)!;
    const b = createAccount(db, { name: 'B' });
    createTransaction(db, { type: 'transfer', amount: 100, toAccountId: b.id });
    expect(getAccount(db, def.id).balance_cents).toBe(-10000);
    expect(getAccount(db, b.id).balance_cents).toBe(10000);
  });

  it('转账缺 toAccountId 抛 VALIDATION_FAILED', () => {
    const db = setup();
    expect(() => createTransaction(db, { type: 'transfer', amount: 100 })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_FAILED' })
    );
  });

  it('转账 toAccountId 与 accountId 相同抛 VALIDATION_FAILED', () => {
    const db = setup();
    const def = getDefaultAccount(db)!;
    expect(() =>
      createTransaction(db, { type: 'transfer', amount: 100, toAccountId: def.id })
    ).toThrowError(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });

  it('金额为 0 抛 VALIDATION_FAILED', () => {
    const db = setup();
    expect(() => createTransaction(db, { type: 'expense', amount: 0 })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_FAILED' })
    );
  });

  it('金额为负数抛 VALIDATION_FAILED', () => {
    const db = setup();
    expect(() => createTransaction(db, { type: 'expense', amount: -5 })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_FAILED' })
    );
  });

  it('账户不存在抛 ACCOUNT_NOT_FOUND', () => {
    const db = setup();
    expect(() => createTransaction(db, { type: 'expense', amount: 10, accountId: 9999 })).toThrowError(
      expect.objectContaining({ code: 'ACCOUNT_NOT_FOUND' })
    );
  });

  it('负余额能保存成功，且 warnings 含对应账户', () => {
    const db = setup();
    const def = getDefaultAccount(db)!;
    const { transaction, warnings } = createTransaction(db, { type: 'expense', amount: 100 });
    expect(transaction.id).toBeTruthy();
    expect(getAccount(db, def.id).balance_cents).toBe(-10000);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.accountId).toBe(def.id);
    expect(warnings[0]!.balanceCents).toBe(-10000);
  });

  it('categoryName 传入新名字时自动创建并关联', () => {
    const db = setup();
    const { transaction } = createTransaction(db, { type: 'expense', amount: 10, categoryName: '餐饮' });
    expect(transaction.category_id).not.toBeNull();
    const cats = listCategories(db, 'expense').filter((c) => c.name === '餐饮');
    expect(cats).toHaveLength(1);
    expect(cats[0]!.id).toBe(transaction.category_id);
  });

  it('categoryName 传已存在名字时复用同一分类', () => {
    const db = setup();
    const t1 = createTransaction(db, { type: 'expense', amount: 10, categoryName: '餐饮' }).transaction;
    const t2 = createTransaction(db, { type: 'expense', amount: 20, categoryName: '餐饮' }).transaction;
    expect(t1.category_id).toBe(t2.category_id);
    expect(listCategories(db, 'expense').filter((c) => c.name === '餐饮')).toHaveLength(1);
  });

  it('日期默认今天', () => {
    const db = setup();
    const { transaction } = createTransaction(db, { type: 'expense', amount: 10 });
    expect(transaction.occurred_on).toBe(todayLocal());
  });

  it('成员默认「我」', () => {
    const db = setup();
    const me = listMembers(db).find((m) => m.name === '我')!;
    const { transaction } = createTransaction(db, { type: 'expense', amount: 10 });
    expect(transaction.member_id).toBe(me.id);
  });

  it('amount 支持字符串元且满足校验', () => {
    const db = setup();
    const def = getDefaultAccount(db)!;
    createTransaction(db, { type: 'expense', amount: '12.34' });
    expect(getAccount(db, def.id).balance_cents).toBe(-1234);
  });

  it('事务回滚：账户不存在时不残留余额改动', () => {
    const db = setup();
    const def = getDefaultAccount(db)!;
    try {
      createTransaction(db, { type: 'expense', amount: 10, accountId: 9999 });
    } catch {
      /* ignore */
    }
    expect(getAccount(db, def.id).balance_cents).toBe(0);
  });
});

describe('ledger updateTransaction', () => {
  it('编辑换账户：旧账户回滚、新账户生效', () => {
    const db = setup();
    const a = getDefaultAccount(db)!;
    const b = createAccount(db, { name: 'B' });
    const tx = createTransaction(db, { type: 'expense', amount: 100, accountId: a.id }).transaction;
    expect(getAccount(db, a.id).balance_cents).toBe(-10000);

    const updated = updateTransaction(db, tx.id, { accountId: b.id }).transaction;
    expect(updated.account_id).toBe(b.id);
    expect(getAccount(db, a.id).balance_cents).toBe(0); // 旧账户已回滚
    expect(getAccount(db, b.id).balance_cents).toBe(-10000); // 新账户生效
  });

  it('编辑改金额：余额按新值重算（旧额先回滚）', () => {
    const db = setup();
    const a = getDefaultAccount(db)!;
    const tx = createTransaction(db, { type: 'expense', amount: 100, accountId: a.id }).transaction;
    expect(getAccount(db, a.id).balance_cents).toBe(-10000);

    const updated = updateTransaction(db, tx.id, { amount: 50 }).transaction;
    expect(updated.amount_cents).toBe(5000);
    expect(getAccount(db, a.id).balance_cents).toBe(-5000);
  });

  it('编辑转账换账户：双向余额同步回滚与重放', () => {
    const db = setup();
    const a = getDefaultAccount(db)!;
    const b = createAccount(db, { name: 'B' });
    const c = createAccount(db, { name: 'C' });
    const tx = createTransaction(db, {
      type: 'transfer',
      amount: 100,
      accountId: a.id,
      toAccountId: b.id,
    }).transaction;
    expect(getAccount(db, a.id).balance_cents).toBe(-10000);
    expect(getAccount(db, b.id).balance_cents).toBe(10000);

    updateTransaction(db, tx.id, { accountId: a.id, toAccountId: c.id });
    expect(getAccount(db, b.id).balance_cents).toBe(0); // b 已回滚
    expect(getAccount(db, c.id).balance_cents).toBe(10000); // c 生效
    expect(getAccount(db, a.id).balance_cents).toBe(-10000);
  });

  it('不存在的 id 抛 TXN_NOT_FOUND', () => {
    const db = setup();
    expect(() => updateTransaction(db, 9999, { amount: 10 })).toThrowError(
      expect.objectContaining({ code: 'TXN_NOT_FOUND' })
    );
  });

  it('编辑还款生成的支出抛 GENERATED_BY_REPAYMENT', () => {
    const db = setup();
    const def = getDefaultAccount(db)!;
    const res = db
      .prepare(
        `INSERT INTO txn (type, amount_cents, occurred_on, account_id, source_type) VALUES ('expense', 1000, '2026-01-01', ?, 'repayment')`
      )
      .run(def.id);
    const repId = Number(res.lastInsertRowid);
    expect(() => updateTransaction(db, repId, { amount: 5 })).toThrowError(
      expect.objectContaining({ code: 'GENERATED_BY_REPAYMENT' })
    );
  });
});

describe('ledger deleteTransaction', () => {
  it('删除后余额回到删除前（支出）', () => {
    const db = setup();
    const a = getDefaultAccount(db)!;
    const tx = createTransaction(db, { type: 'expense', amount: 100, accountId: a.id }).transaction;
    expect(getAccount(db, a.id).balance_cents).toBe(-10000);
    deleteTransaction(db, tx.id);
    expect(getAccount(db, a.id).balance_cents).toBe(0);
  });

  it('删除转账后双向余额都回到删除前', () => {
    const db = setup();
    const a = getDefaultAccount(db)!;
    const b = createAccount(db, { name: 'B' });
    const tx = createTransaction(db, {
      type: 'transfer',
      amount: 100,
      accountId: a.id,
      toAccountId: b.id,
    }).transaction;
    expect(getAccount(db, a.id).balance_cents).toBe(-10000);
    expect(getAccount(db, b.id).balance_cents).toBe(10000);
    deleteTransaction(db, tx.id);
    expect(getAccount(db, a.id).balance_cents).toBe(0);
    expect(getAccount(db, b.id).balance_cents).toBe(0);
  });

  it('不存在的 id 抛 TXN_NOT_FOUND', () => {
    const db = setup();
    expect(() => deleteTransaction(db, 9999)).toThrowError(
      expect.objectContaining({ code: 'TXN_NOT_FOUND' })
    );
  });

  it('删除还款生成的支出抛 GENERATED_BY_REPAYMENT', () => {
    const db = setup();
    const def = getDefaultAccount(db)!;
    const res = db
      .prepare(
        `INSERT INTO txn (type, amount_cents, occurred_on, account_id, source_type) VALUES ('expense', 1000, '2026-01-01', ?, 'repayment')`
      )
      .run(def.id);
    const repId = Number(res.lastInsertRowid);
    expect(() => deleteTransaction(db, repId)).toThrowError(
      expect.objectContaining({ code: 'GENERATED_BY_REPAYMENT' })
    );
    // 余额未被改动
    expect(getAccount(db, def.id).balance_cents).toBe(0);
  });
});
