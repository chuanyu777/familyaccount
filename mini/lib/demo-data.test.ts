import { describe, expect, it } from 'vitest';

import {
  demoAccounts,
  demoAnalysis,
  demoAssets,
  demoExpenseCategories,
  demoIncomeCategories,
  demoLiabilities,
  demoMonthlySnapshot,
  demoTransactions,
} from './demo-data';
import { CATEGORY_ICON_KEYS } from './category-icons';

describe('demo data', () => {
  it('示例交易的字符串金额与分单位金额一致', () => {
    for (const item of demoTransactions) {
      expect(typeof item.amount).toBe('string');
      expect(Math.round(Number(item.amount) * 100)).toBe(item.amountCents);
    }
  });

  it('收支汇总与明细一致', () => {
    const income = demoTransactions
      .filter((item) => item.type === 'income')
      .reduce((sum, item) => sum + (item.amountCents ?? 0), 0);
    const expense = demoTransactions
      .filter((item) => item.type === 'expense')
      .reduce((sum, item) => sum + (item.amountCents ?? 0), 0);

    expect(demoMonthlySnapshot.income).toBe((income / 100).toFixed(2));
    expect(demoMonthlySnapshot.expense).toBe((expense / 100).toFixed(2));
  });

  it('分类图标都落在合法 icon_key 内', () => {
    for (const category of [...demoExpenseCategories, ...demoIncomeCategories]) {
      expect(CATEGORY_ICON_KEYS).toContain(category.icon_key);
    }
  });

  it('分析页分类占比合计约等于 100', () => {
    const total = demoAnalysis.breakdown.reduce((sum, item) => sum + item.percent, 0);
    expect(total).toBeGreaterThanOrEqual(99);
    expect(total).toBeLessThanOrEqual(101);
  });

  it('净资产等于资金加资产减负债', () => {
    const fund = demoAccounts.reduce((sum, item) => sum + (item.balanceCents ?? 0), 0);
    const asset = demoAssets.reduce((sum, item) => sum + (item.valueCents ?? 0), 0);
    const debt = demoLiabilities.reduce((sum, item) => sum + (item.remainingCents ?? 0), 0);

    expect(demoAnalysis.summary.netWorthCents).toBe(fund + asset - debt);
  });

  it('趋势包含 6 个月且高度在合法区间', () => {
    expect(demoAnalysis.trend).toHaveLength(6);
    for (const item of demoAnalysis.trend) {
      expect(item.incomeHeight).toBeGreaterThanOrEqual(4);
      expect(item.expenseHeight).toBeGreaterThanOrEqual(4);
    }
  });
});
