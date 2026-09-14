import { describe, it, expect } from 'vitest';
import { createTestDb } from '../db/connection';
import type { Db } from '../db/connection';
import { ensureSeeded, getDefaultAccount } from '../db/seed';
import { createAccount } from './accounts';
import { createMember } from './members';
import { createTransaction } from './ledger';
import { listTransactions } from './ledger.query';

function setup(): Db {
  const db = createTestDb();
  ensureSeeded(db);
  return db;
}

function currentMonth(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
}

describe('ledger.query listTransactions', () => {
  it('规则1：按 occurred_on 降序，同日期按 id 降序', () => {
    const db = setup();
    // 同日期创建两笔，后创建的 id 更大，应排在前
    const a = createTransaction(db, { type: 'expense', amount: 1, occurredOn: '2026-09-10' }).transaction;
    const b = createTransaction(db, { type: 'expense', amount: 2, occurredOn: '2026-09-12' }).transaction;
    const c = createTransaction(db, { type: 'expense', amount: 3, occurredOn: '2026-09-10' }).transaction;
    const res = listTransactions(db, { month: '2026-09' });
    expect(res.items.map((i) => i.id)).toEqual([b.id, c.id, a.id]);
  });

  it('规则2：默认过滤为当前月；仅返回该自然月', () => {
    const db = setup();
    createTransaction(db, { type: 'expense', amount: 1, occurredOn: `${currentMonth()}-15` });
    createTransaction(db, { type: 'expense', amount: 2, occurredOn: '2020-01-10' });
    const res = listTransactions(db, {}); // 不传 month
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.occurredOn.startsWith(currentMonth())).toBe(true);
  });

  it('规则2：显式 month 只返回该月', () => {
    const db = setup();
    createTransaction(db, { type: 'expense', amount: 1, occurredOn: '2026-03-05' });
    createTransaction(db, { type: 'expense', amount: 2, occurredOn: '2026-04-05' });
    const res = listTransactions(db, { month: '2026-03' });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.occurredOn).toBe('2026-03-05');
  });

  it('规则3+4：type/accountId/memberId 可叠加，accountId 命中转出与转入', () => {
    const db = setup();
    const def = getDefaultAccount(db)!;
    const b = createAccount(db, { name: 'B' });
    const c = createAccount(db, { name: 'C' });
    const other = createMember(db, { name: '爸爸' });
    const me = createMember(db, { name: '我' });
    // 支出到默认账户，member=我
    createTransaction(db, { type: 'expense', amount: 5, accountId: def.id, memberId: me.id });
    // 转账 默认 -> B, member=我
    createTransaction(db, { type: 'transfer', amount: 5, accountId: def.id, toAccountId: b.id, memberId: me.id });
    // 支出到 C, member=爸爸
    createTransaction(db, { type: 'expense', amount: 7, accountId: c.id, memberId: other.id });

    // accountId=def 应命中支出(转出)与转账(转出)
    const r1 = listTransactions(db, { month: '2026-09', accountId: def.id });
    expect(r1.items).toHaveLength(2);
    // accountId=B 应命中转账(转入)
    const r2 = listTransactions(db, { month: '2026-09', accountId: b.id });
    expect(r2.items).toHaveLength(1);
    expect(r2.items[0]!.type).toBe('transfer');
    // 叠加 memberId 过滤
    const r3 = listTransactions(db, { month: '2026-09', accountId: def.id, memberId: me.id });
    expect(r3.items).toHaveLength(2);
    const r4 = listTransactions(db, { month: '2026-09', accountId: def.id, memberId: other.id, type: 'expense' });
    expect(r4.items).toHaveLength(0);
  });

  it('规则5：转账不计入收入/支出合计，net=收入-支出', () => {
    const db = setup();
    createTransaction(db, { type: 'expense', amount: 100, occurredOn: '2026-09-01' });
    createTransaction(db, { type: 'income', amount: 200, occurredOn: '2026-09-02' });
    createTransaction(db, { type: 'transfer', amount: 50, toAccountId: createAccount(db, { name: 'B' }).id, occurredOn: '2026-09-03' });
    const res = listTransactions(db, { month: '2026-09' });
    expect(res.expenseTotalCents).toBe(10000);
    expect(res.incomeTotalCents).toBe(20000);
    expect(res.netCents).toBe(10000);
  });

  it('规则6：合计与 net 对整个筛选范围求和（分页不变）', () => {
    const db = setup();
    for (let i = 0; i < 5; i++) createTransaction(db, { type: 'expense', amount: 10, occurredOn: `2026-09-${String(i + 1).padStart(2, '0')}` });
    for (let i = 0; i < 3; i++) createTransaction(db, { type: 'income', amount: 20, occurredOn: `2026-09-${String(i + 10).padStart(2, '0')}` });
    const p1 = listTransactions(db, { month: '2026-09', pageSize: 2, page: 1 });
    const p2 = listTransactions(db, { month: '2026-09', pageSize: 2, page: 2 });
    expect(p1.expenseTotalCents).toBe(5000);
    expect(p1.incomeTotalCents).toBe(6000);
    expect(p1.netCents).toBe(1000);
    expect(p2.expenseTotalCents).toBe(5000);
    expect(p2.incomeTotalCents).toBe(6000);
  });

  it('规则7：total 是筛选范围总条数（非当前页）', () => {
    const db = setup();
    for (let i = 0; i < 8; i++) createTransaction(db, { type: 'expense', amount: 1, occurredOn: `2026-09-0${i + 1}` });
    const res = listTransactions(db, { month: '2026-09', pageSize: 3, page: 1 });
    expect(res.total).toBe(8);
    expect(res.items).toHaveLength(3);
  });

  it('规则8：空结果返回空数组 + 合计 0，不报错', () => {
    const db = setup();
    const res = listTransactions(db, { month: '1999-01' });
    expect(res.items).toEqual([]);
    expect(res.incomeTotalCents).toBe(0);
    expect(res.expenseTotalCents).toBe(0);
    expect(res.netCents).toBe(0);
    expect(res.total).toBe(0);
  });

  it('规则9：分页正确切分（第2页内容与 total 不变）', () => {
    const db = setup();
    for (let i = 1; i <= 25; i++) {
      createTransaction(db, { type: 'expense', amount: 1, occurredOn: `2026-09-${String(i).padStart(2, '0')}` });
    }
    const p1 = listTransactions(db, { month: '2026-09', pageSize: 10, page: 1 });
    const p2 = listTransactions(db, { month: '2026-09', pageSize: 10, page: 2 });
    expect(p1.total).toBe(25);
    expect(p1.items[0]!.occurredOn).toBe('2026-09-25');
    expect(p2.items[0]!.occurredOn).toBe('2026-09-15');
    expect(p2.items).toHaveLength(10);
  });

  it('规则10：pageSize<1 或 page<1 抛 VALIDATION_FAILED', () => {
    const db = setup();
    expect(() => listTransactions(db, { month: '2026-09', pageSize: 0 })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_FAILED' })
    );
    expect(() => listTransactions(db, { month: '2026-09', page: 0 })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_FAILED' })
    );
    expect(() => listTransactions(db, { month: '2026-09', pageSize: -3 })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_FAILED' })
    );
  });

  it('TxnItem 字段映射完整（含 accountName/toAccountName/categoryName/memberName/amount）', () => {
    const db = setup();
    const b = createAccount(db, { name: 'B' });
    const tx = createTransaction(db, {
      type: 'transfer',
      amount: '12.34',
      occurredOn: '2026-09-05',
      note: '挪钱',
      toAccountId: b.id,
      categoryName: '内部转账',
    }).transaction;
    const item = listTransactions(db, { month: '2026-09' }).items[0]!;
    expect(item.id).toBe(tx.id);
    expect(item.type).toBe('transfer');
    expect(item.amountCents).toBe(1234);
    expect(item.amount).toBe('12.34');
    expect(item.note).toBe('挪钱');
    expect(item.toAccountId).toBe(b.id);
    expect(item.toAccountName).toBe('B');
    expect(item.memberName).not.toBeNull();
    expect(item.sourceType).toBe('manual');
  });
});
