import type { Asset } from '../services/assets';
import type { Account } from '../services/accounts';
import type { Category } from '../services/categories';
import type { Liability, Repayment } from '../services/liabilities';
import type { TransactionRecord } from '../services/transactions';

/**
 * 游客态示例数据。
 * 只用于未登录浏览，登录后立即切回真实接口，不与任何真实账本产生关系。
 * 字段与真实接口保持同名，渲染层可以复用。
 */

export interface DemoCategory extends Category {
  /** 分类图标代号，与 category-icon 组件的 icon-key 对应。 */
  icon_key?: string;
}

export interface DemoTransaction extends TransactionRecord {
  categoryName?: string;
  accountName?: string;
  toAccountName?: string;
}

export const DEMO_LEDGER_NAME = '示例账本';

function todayMonth(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

function dateOf(day: number): string {
  return `${todayMonth()}-${String(day).padStart(2, '0')}`;
}

export function yuanOf(cents: number): string {
  return (cents / 100).toFixed(2);
}

export const demoAccounts: Account[] = [
  { id: 9001, name: '家庭储蓄卡', balanceCents: 12860000, balance: '128600.00', isDefault: true },
  { id: 9002, name: '微信零钱', balanceCents: 326800, balance: '3268.00' },
  { id: 9003, name: '现金钱包', balanceCents: 86000, balance: '860.00' },
  { id: 9004, name: '信用卡', balanceCents: -452000, balance: '-4520.00' },
];

export const demoExpenseCategories: DemoCategory[] = [
  { id: 9101, kind: 'expense', name: '餐饮', icon_key: 'food' },
  { id: 9102, kind: 'expense', name: '交通', icon_key: 'transport' },
  { id: 9103, kind: 'expense', name: '购物', icon_key: 'shopping' },
  { id: 9104, kind: 'expense', name: '居家', icon_key: 'home' },
  { id: 9105, kind: 'expense', name: '生活缴费', icon_key: 'utility' },
  { id: 9106, kind: 'expense', name: '娱乐', icon_key: 'entertainment' },
  { id: 9107, kind: 'expense', name: '医疗', icon_key: 'health' },
  { id: 9108, kind: 'expense', name: '教育', icon_key: 'education' },
  { id: 9109, kind: 'expense', name: '服饰', icon_key: 'clothing' },
  { id: 9110, kind: 'expense', name: '其他', icon_key: 'other' },
];

export const demoIncomeCategories: DemoCategory[] = [
  { id: 9201, kind: 'income', name: '工资', icon_key: 'salary' },
  { id: 9202, kind: 'income', name: '理财收益', icon_key: 'invest' },
  { id: 9203, kind: 'income', name: '红包', icon_key: 'gift' },
  { id: 9204, kind: 'income', name: '其他', icon_key: 'other' },
];

export const demoTransactions: DemoTransaction[] = [
  { id: 7001, type: 'income', amount: '18000.00', amountCents: 1800000, occurredOn: dateOf(10), note: '工资到账', accountId: 9001, categoryId: 9201, categoryIconKey: 'salary', categoryName: '工资', accountName: '家庭储蓄卡' },
  { id: 7002, type: 'expense', amount: '6500.00', amountCents: 650000, occurredOn: dateOf(9), note: '房租', accountId: 9001, categoryId: 9104, categoryIconKey: 'home', categoryName: '居家', accountName: '家庭储蓄卡' },
  { id: 7003, type: 'expense', amount: '560.00', amountCents: 56000, occurredOn: dateOf(9), note: '超市采购', accountId: 9002, categoryId: 9103, categoryIconKey: 'shopping', categoryName: '购物', accountName: '微信零钱' },
  { id: 7004, type: 'expense', amount: '1500.00', amountCents: 150000, occurredOn: dateOf(8), note: '孩子兴趣班', accountId: 9001, categoryId: 9108, categoryIconKey: 'education', categoryName: '教育', accountName: '家庭储蓄卡' },
  { id: 7005, type: 'expense', amount: '1200.00', amountCents: 120000, occurredOn: dateOf(7), note: '家庭保险', accountId: 9001, categoryId: 9110, categoryIconKey: 'other', categoryName: '其他', accountName: '家庭储蓄卡' },
  { id: 7006, type: 'expense', amount: '320.00', amountCents: 32000, occurredOn: dateOf(6), note: '水电燃气', accountId: 9002, categoryId: 9105, categoryIconKey: 'utility', categoryName: '生活缴费', accountName: '微信零钱' },
  { id: 7007, type: 'expense', amount: '328.00', amountCents: 32800, occurredOn: dateOf(5), note: '家庭聚餐', accountId: 9002, categoryId: 9101, categoryIconKey: 'food', categoryName: '餐饮', accountName: '微信零钱' },
  { id: 7008, type: 'expense', amount: '260.00', amountCents: 26000, occurredOn: dateOf(4), note: '通勤交通', accountId: 9002, categoryId: 9102, categoryIconKey: 'transport', categoryName: '交通', accountName: '微信零钱' },
  { id: 7009, type: 'expense', amount: '96.00', amountCents: 9600, occurredOn: dateOf(3), note: '周末电影', accountId: 9002, categoryId: 9106, categoryIconKey: 'entertainment', categoryName: '娱乐', accountName: '微信零钱' },
  { id: 7010, type: 'expense', amount: '85.00', amountCents: 8500, occurredOn: dateOf(2), note: '药店', accountId: 9002, categoryId: 9107, categoryIconKey: 'health', categoryName: '医疗', accountName: '微信零钱' },
  { id: 7011, type: 'income', amount: '320.00', amountCents: 32000, occurredOn: dateOf(2), note: '基金分红', accountId: 9001, categoryId: 9202, categoryIconKey: 'invest', categoryName: '理财收益', accountName: '家庭储蓄卡' },
  { id: 7012, type: 'transfer', amount: '2000.00', amountCents: 200000, occurredOn: dateOf(1), note: '转给爱人', accountId: 9001, toAccountId: 9002, toAccountName: '微信零钱', accountName: '家庭储蓄卡' },
];

export const demoAssets: Asset[] = [
  { id: 6001, name: '自住房', valueCents: 260000000, value: '2600000.00', kind: '不动产' },
  { id: 6002, name: '代步车', valueCents: 18000000, value: '180000.00', kind: '车辆' },
  { id: 6003, name: '沪深300指数基金', valueCents: 8600000, value: '86000.00', kind: '金融投资' },
  { id: 6004, name: '黄金积存', valueCents: 3200000, value: '32000.00', kind: '黄金珠宝' },
];

export const demoLiabilities: Liability[] = [
  { id: 5001, name: '房贷', remainingCents: 86000000, remaining: '860000.00', monthlyPaymentCents: 520000, monthlyPayment: '5200.00', paymentDay: 8 },
  { id: 5002, name: '车贷', remainingCents: 9600000, remaining: '96000.00', monthlyPaymentCents: 280000, monthlyPayment: '2800.00', paymentDay: 15 },
  { id: 5003, name: '信用卡分期', remainingCents: 1200000, remaining: '12000.00', monthlyPaymentCents: 100000, monthlyPayment: '1000.00', paymentDay: 20 },
];

export const demoRepayments: Repayment[] = [
  { id: 4001, liability_id: 5001, amount_cents: 520000, amount: '5200.00', occurred_on: dateOf(5), account_id: 9001 },
  { id: 4002, liability_id: 5002, amount_cents: 280000, amount: '2800.00', occurred_on: dateOf(2), account_id: 9001 },
];

function sumByType(type: 'income' | 'expense'): number {
  return demoTransactions
    .filter((item) => item.type === type)
    .reduce((sum, item) => sum + (item.amountCents ?? 0), 0);
}

export const demoMonthlySnapshot = {
  income: yuanOf(sumByType('income')),
  expense: yuanOf(sumByType('expense')),
  net: yuanOf(sumByType('income') - sumByType('expense')),
};

function monthOffset(offset: number): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const HISTORY: Array<{ income: number; expense: number }> = [
  { income: 1750000, expense: 920000 },
  { income: 1750000, expense: 860000 },
  { income: 1820000, expense: 1020000 },
  { income: 1760000, expense: 790000 },
  { income: 1790000, expense: 880000 },
];

const historyTrend = HISTORY.map((item, index) => ({
  month: monthOffset(HISTORY.length - index),
  incomeCents: item.income,
  expenseCents: item.expense,
}));

export const demoAnalysis = (() => {
  const incomeCents = sumByType('income');
  const expenseCents = sumByType('expense');
  const fundCents = demoAccounts.reduce((sum, item) => sum + (item.balanceCents ?? 0), 0);
  const assetCents = demoAssets.reduce((sum, item) => sum + (item.valueCents ?? 0), 0);
  const liabilityCents = demoLiabilities.reduce((sum, item) => sum + (item.remainingCents ?? 0), 0);
  const netWorthCents = fundCents + assetCents - liabilityCents;

  const buckets = new Map<string, { categoryId: number; cents: number }>();
  for (const item of demoTransactions) {
    if (item.type !== 'expense' || !item.categoryName) continue;
    const current = buckets.get(item.categoryName) ?? { categoryId: item.categoryId ?? 0, cents: 0 };
    buckets.set(item.categoryName, { categoryId: current.categoryId, cents: current.cents + (item.amountCents ?? 0) });
  }
  const totalExpense = expenseCents || 1;
  const breakdown = [...buckets.entries()]
    .sort((left, right) => right[1].cents - left[1].cents)
    .map(([name, value]) => ({
      categoryId: value.categoryId,
      name,
      cents: value.cents,
      percent: Math.round((value.cents / totalExpense) * 100),
      amount: yuanOf(value.cents),
    }));

  const trendWithCurrent = [
    ...historyTrend,
    { month: todayMonth(), incomeCents, expenseCents },
  ];
  const max = Math.max(1, ...trendWithCurrent.flatMap((item) => [item.incomeCents, item.expenseCents]));
  const trend = trendWithCurrent.map((item) => ({
    month: item.month,
    label: `${item.month.slice(5)}月`,
    incomeCents: item.incomeCents,
    expenseCents: item.expenseCents,
    income: yuanOf(item.incomeCents),
    expense: yuanOf(item.expenseCents),
    net: yuanOf(item.incomeCents - item.expenseCents),
    incomeHeight: Math.max(4, Math.round((item.incomeCents / max) * 100)),
    expenseHeight: Math.max(4, Math.round((item.expenseCents / max) * 100)),
  }));

  return {
    summary: {
      totalAssetsCents: fundCents + assetCents,
      totalLiabilitiesCents: liabilityCents,
      netWorthCents,
      netWorth: yuanOf(netWorthCents),
    },
    snapshot: {
      incomeCents,
      expenseCents,
      netCents: incomeCents - expenseCents,
      income: yuanOf(incomeCents),
      expense: yuanOf(expenseCents),
      net: yuanOf(incomeCents - expenseCents),
    },
    trend,
    breakdown,
  };
})();
