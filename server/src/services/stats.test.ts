import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../db/connection';
import type { Db } from '../db/connection';
import { ensureSeeded } from '../db/seed';
import { createAccount, calibrateBalance } from './accounts';
import { createTransaction } from './ledger';
import { createAsset } from './assets';
import { createLiability } from './liabilities';
import { createRepayment } from './repayments';
import { summary, monthlyTrend, categoryBreakdown } from './stats';

function curMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthsAgo(n: number): string {
  const d = new Date();
  const x = new Date(d.getFullYear(), d.getMonth() - n, 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}

describe('stats.summary', () => {
  let db: Db;

  beforeEach(() => {
    db = createTestDb();
    ensureSeeded(db);
  });

  it('净资产公式: 账户余额 + 资产市值 - 负债本金', () => {
    const a1 = createAccount(db, { name: 'A1' });
    const a2 = createAccount(db, { name: 'A2' });
    calibrateBalance(db, a1.id, 100000);
    calibrateBalance(db, a2.id, 50000);

    createAsset(db, { name: '房', value: '2000' });
    createAsset(db, { name: '车', value: '3000' });

    createLiability(db, { name: '贷1', remaining: '800', monthlyPayment: '10' });
    createLiability(db, { name: '贷2', remaining: '700', monthlyPayment: '20' });

    const s = summary(db);
    expect(s.accountsTotalCents).toBe(150000);
    expect(s.assetsTotalCents).toBe(500000);
    expect(s.totalLiabilitiesCents).toBe(150000);
    expect(s.totalAssetsCents).toBe(650000);
    expect(s.netWorthCents).toBe(500000);
    expect(s.totalAssets).toBe('6500.00');
    expect(s.netWorth).toBe('5000.00');
  });

  it('月供合计正确', () => {
    createLiability(db, { name: '贷1', remaining: '800', monthlyPayment: '10' });
    createLiability(db, { name: '贷2', remaining: '700', monthlyPayment: '20' });
    const s = summary(db);
    expect(s.monthlyPaymentTotalCents).toBe(3000);
    expect(s.monthlyPaymentTotal).toBe('30.00');
  });
});

describe('stats.monthlyTrend', () => {
  let db: Db;

  beforeEach(() => {
    db = createTestDb();
    ensureSeeded(db);
  });

  it('跨 6 个月收入/支出/结余, 升序, 缺数据补 0', () => {
    createTransaction(db, { type: 'income', amount: '10.00', occurredOn: `${monthsAgo(2)}-15` });
    createTransaction(db, { type: 'expense', amount: '4.00', occurredOn: `${monthsAgo(2)}-15` });
    createTransaction(db, { type: 'income', amount: '5.00', occurredOn: `${curMonth()}-15` });
    createTransaction(db, { type: 'expense', amount: '2.00', occurredOn: `${curMonth()}-15` });

    const trend = monthlyTrend(db, 6);
    expect(trend).toHaveLength(6);

    // 升序
    const months = trend.map((t) => t.month);
    const sorted = [...months].sort();
    expect(months).toEqual(sorted);

    const twoAgo = trend.find((t) => t.month === monthsAgo(2))!;
    expect(twoAgo.incomeCents).toBe(1000);
    expect(twoAgo.expenseCents).toBe(400);
    expect(twoAgo.netCents).toBe(600);

    const cur = trend.find((t) => t.month === curMonth())!;
    expect(cur.incomeCents).toBe(500);
    expect(cur.expenseCents).toBe(200);
    expect(cur.netCents).toBe(300);

    // 其余月份补 0
    const zeroMonths = trend.filter(
      (t) => t.month !== monthsAgo(2) && t.month !== curMonth()
    );
    expect(zeroMonths.length).toBe(4);
    for (const z of zeroMonths) {
      expect(z.incomeCents).toBe(0);
      expect(z.expenseCents).toBe(0);
      expect(z.netCents).toBe(0);
    }
  });

  it('转账不计入收入或支出', () => {
    const from = createAccount(db, { name: 'from' });
    const to = createAccount(db, { name: 'to' });
    createTransaction(db, {
      type: 'transfer',
      amount: 999,
      accountId: from.id,
      toAccountId: to.id,
      occurredOn: `${curMonth()}-15`,
    });

    const trend = monthlyTrend(db, 6);
    const cur = trend.find((t) => t.month === curMonth())!;
    expect(cur.incomeCents).toBe(0);
    expect(cur.expenseCents).toBe(0);
    expect(cur.netCents).toBe(0);
  });
});

describe('stats.categoryBreakdown', () => {
  let db: Db;

  beforeEach(() => {
    db = createTestDb();
    ensureSeeded(db);
  });

  it('各分类金额与占比正确, 按金额倒序, percent 合计≈100', () => {
    createTransaction(db, {
      type: 'expense',
      amount: '6.00',
      categoryName: '餐饮',
      occurredOn: `${curMonth()}-10`,
    });
    createTransaction(db, {
      type: 'expense',
      amount: '4.00',
      categoryName: '交通',
      occurredOn: `${curMonth()}-12`,
    });

    const bd = categoryBreakdown(db, curMonth());
    expect(bd).toHaveLength(2);
    expect(bd[0]!.name).toBe('餐饮');
    expect(bd[0]!.cents).toBe(600);
    expect(bd[0]!.percent).toBe(60);
    expect(bd[1]!.name).toBe('交通');
    expect(bd[1]!.cents).toBe(400);
    expect(bd[1]!.percent).toBe(40);

    const sum = bd.reduce((s, x) => s + x.percent, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.01);
  });

  it('包含还款生成的支出', () => {
    const liab = createLiability(db, { name: '信用卡', remaining: '5000', monthlyPayment: '500' });
    createRepayment(db, { liabilityId: liab.id, amount: '5.00', occurredOn: `${curMonth()}-05` });
    createTransaction(db, {
      type: 'expense',
      amount: '3.00',
      categoryName: '餐饮',
      occurredOn: `${curMonth()}-08`,
    });

    const bd = categoryBreakdown(db, curMonth());
    const names = bd.map((x) => x.name);
    expect(names).toContain('其他'); // 还款默认支出分类
    const repaymentSlice = bd.find((x) => x.name === '其他')!;
    expect(repaymentSlice.cents).toBe(500);
    const food = bd.find((x) => x.name === '餐饮')!;
    expect(food.cents).toBe(300);
  });
});

describe('stats 空数据库', () => {
  it('summary 全 0, trend 6 月全 0, breakdown 空数组, 不抛异常', () => {
    const db = createTestDb(); // 不 seed
    expect(() => {
      const s = summary(db);
      expect(s.totalAssetsCents).toBe(0);
      expect(s.totalLiabilitiesCents).toBe(0);
      expect(s.netWorthCents).toBe(0);
      expect(s.monthlyPaymentTotalCents).toBe(0);
      expect(s.accountsTotalCents).toBe(0);
      expect(s.assetsTotalCents).toBe(0);

      const trend = monthlyTrend(db, 6);
      expect(trend).toHaveLength(6);
      for (const t of trend) {
        expect(t.incomeCents).toBe(0);
        expect(t.expenseCents).toBe(0);
        expect(t.netCents).toBe(0);
      }

      const bd = categoryBreakdown(db);
      expect(Array.isArray(bd)).toBe(true);
      expect(bd).toHaveLength(0);
    }).not.toThrow();
  });
});
