import type { Db } from '../db/connection';
import { toYuanString } from '../domain/money';
import { currentMonth, isValidMonth, lastDayOf, monthRange } from '../domain/month';
import { badRequest } from '../lib/httpError';
import { assetsTotalAtMonth, assetValuesAtMonth } from './assets';
import { liabilitiesTotalAtMonth } from './liabilities';

export interface Summary {
  totalAssetsCents: number;
  totalAssets: string;
  totalLiabilitiesCents: number;
  totalLiabilities: string;
  netWorthCents: number;
  netWorth: string;
  monthlyPaymentTotalCents: number;
  monthlyPaymentTotal: string;
  accountsTotalCents: number;
  accountsTotal: string;
  assetsTotalCents: number;
  assetsTotal: string;
}

export interface MonthlyPoint {
  month: string; // 'YYYY-MM'
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

export interface CategorySlice {
  categoryId: number;
  name: string;
  cents: number;
  percent: number; // 0–100，保留两位小数
}

function sumCents(db: Db, sql: string): number {
  const row = db.prepare(sql).get() as { t: number };
  return Number(row.t);
}

/** 生成以 endMonth 结尾、共 months 个月的 'YYYY-MM' 列表，升序。 */
function monthList(months: number, endMonth?: string): string[] {
  return monthRange(endMonth ?? currentMonth(), months);
}

/**
 * 净资产总览。
 * totalAssets = 账户余额合计 + 资产市值合计
 * netWorth    = totalAssets - 负债本金合计
 * monthlyPaymentTotal = 所有负债月供合计
 * 每个 cents 字段同时给出对应元字符串。
 */
export function summary(db: Db): Summary {
  const accountsTotalCents = sumCents(db, 'SELECT COALESCE(SUM(balance_cents), 0) AS t FROM account');
  const assetsTotalCents = sumCents(db, 'SELECT COALESCE(SUM(value_cents), 0) AS t FROM asset');
  const totalLiabilitiesCents = sumCents(
    db,
    'SELECT COALESCE(SUM(remaining_cents), 0) AS t FROM liability'
  );
  const monthlyPaymentTotalCents = sumCents(
    db,
    'SELECT COALESCE(SUM(monthly_payment_cents), 0) AS t FROM liability'
  );
  const totalAssetsCents = accountsTotalCents + assetsTotalCents;
  const netWorthCents = totalAssetsCents - totalLiabilitiesCents;

  return {
    totalAssetsCents,
    totalAssets: toYuanString(totalAssetsCents),
    totalLiabilitiesCents,
    totalLiabilities: toYuanString(totalLiabilitiesCents),
    netWorthCents,
    netWorth: toYuanString(netWorthCents),
    monthlyPaymentTotalCents,
    monthlyPaymentTotal: toYuanString(monthlyPaymentTotalCents),
    accountsTotalCents,
    accountsTotal: toYuanString(accountsTotalCents),
    assetsTotalCents,
    assetsTotal: toYuanString(assetsTotalCents),
  };
}

/**
 * 近 months 个月收支趋势，升序，末月由 endMonth 指定（默认当前月）。
 * 转账不计入收入/支出，缺数据的月份补 0。
 */
export function monthlyTrend(db: Db, months = 6, endMonth?: string): MonthlyPoint[] {
  if (endMonth !== undefined && !isValidMonth(endMonth)) {
    throw badRequest('VALIDATION_FAILED', 'end 需为 YYYY-MM');
  }
  return monthList(months, endMonth).map((month) => {
    const row = db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN type = 'income'  THEN amount_cents ELSE 0 END), 0) AS income,
           COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense
         FROM txn
         WHERE occurred_on LIKE ?`
      )
      .get(`${month}%`) as { income: number; expense: number };
    const incomeCents = Number(row.income);
    const expenseCents = Number(row.expense);
    return { month, incomeCents, expenseCents, netCents: incomeCents - expenseCents };
  });
}

/**
 * 指定月末的资金账户余额合计。
 * 由当前余额倒推：扣掉该月之后所有交易对账户的影响（收入 +、支出 −、转账整体为 0）。
 * 注意：账户余额若被「校准」过（不产生交易），历史值会有偏差，属已知取舍。
 */
export function accountsTotalAtMonth(db: Db, month: string): number {
  const now = sumCents(db, 'SELECT COALESCE(SUM(balance_cents), 0) AS t FROM account');
  const after = sumCentsOf(
    db,
    `SELECT COALESCE(SUM(CASE
             WHEN type = 'income'  THEN amount_cents
             WHEN type = 'expense' THEN -amount_cents
             ELSE 0 END), 0) AS t
       FROM txn WHERE occurred_on > ?`,
    lastDayOf(month)
  );
  return now - after;
}

function sumCentsOf(db: Db, sql: string, ...args: (string | number)[]): number {
  const row = db.prepare(sql).get(...args) as { t: number };
  return Number(row.t);
}

/** 指定月份（默认当前月）按分类的支出占比。
 * 仅统计 type='expense'（含还款生成的 source_type='repayment'），转账不计入。
 * 按金额倒序；percent 为占比(0–100, 两位小数)；无数据返回空数组。
 */
export function categoryBreakdown(db: Db, month?: string): CategorySlice[] {
  const m = month ?? currentMonth();
  const rows = db
    .prepare(
      `SELECT c.id AS categoryId, c.name AS name, COALESCE(SUM(t.amount_cents), 0) AS cents
         FROM txn t
         JOIN category c ON c.id = t.category_id
        WHERE t.type = 'expense' AND t.occurred_on LIKE ?
        GROUP BY c.id, c.name
        ORDER BY cents DESC`
    )
    .all(`${m}%`) as { categoryId: number; name: string; cents: number }[];

  const total = rows.reduce((s, r) => s + Number(r.cents), 0);
  return rows.map((r) => {
    const cents = Number(r.cents);
    const percent = total > 0 ? Math.round(((cents / total) * 100) * 100) / 100 : 0;
    return { categoryId: Number(r.categoryId), name: String(r.name), cents, percent };
  });
}

/** 某个月份的完整截面：收支、期末资产负债与净资产、支出分类占比。 */
export interface MonthSnapshot {
  month: string;
  incomeCents: number;
  income: string;
  expenseCents: number;
  expense: string;
  netCents: number;
  net: string;
  accountsTotalCents: number;
  accountsTotal: string;
  assetsTotalCents: number;
  assetsTotal: string;
  totalAssetsCents: number;
  totalAssets: string;
  totalLiabilitiesCents: number;
  totalLiabilities: string;
  netWorthCents: number;
  netWorth: string;
  monthlyPaymentTotalCents: number;
  monthlyPaymentTotal: string;
  /** 资产合计里是否有项目没有当月及之前的历史快照，只能沿用当前市值 */
  assetsEstimated: boolean;
  breakdown: CategorySlice[];
}

/**
 * 取指定月份的月末截面。当前月即等于「现在」的实时值。
 *
 * 资产取快照（缺失回退当前市值并置 assetsEstimated），
 * 负债与账户余额由还款、交易反推，均不需要额外录入。
 */
export function monthSnapshot(db: Db, month?: string): MonthSnapshot {
  const m = month ?? currentMonth();
  if (!isValidMonth(m)) {
    throw badRequest('VALIDATION_FAILED', 'month 需为 YYYY-MM');
  }

  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'income'  THEN amount_cents ELSE 0 END), 0) AS income,
         COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense
       FROM txn WHERE occurred_on LIKE ?`
    )
    .get(`${m}%`) as { income: number; expense: number };
  const incomeCents = Number(row.income);
  const expenseCents = Number(row.expense);

  const accountsTotalCents = accountsTotalAtMonth(db, m);
  const assetsTotalCents = assetsTotalAtMonth(db, m);
  const assetsEstimated = assetValuesAtMonth(db, m).some((a) => a.source === 'current');
  const { remainingCents, monthlyPaymentCents } = liabilitiesTotalAtMonth(db, m);
  const totalAssetsCents = accountsTotalCents + assetsTotalCents;
  const netWorthCents = totalAssetsCents - remainingCents;

  return {
    month: m,
    incomeCents,
    income: toYuanString(incomeCents),
    expenseCents,
    expense: toYuanString(expenseCents),
    netCents: incomeCents - expenseCents,
    net: toYuanString(incomeCents - expenseCents),
    accountsTotalCents,
    accountsTotal: toYuanString(accountsTotalCents),
    assetsTotalCents,
    assetsTotal: toYuanString(assetsTotalCents),
    totalAssetsCents,
    totalAssets: toYuanString(totalAssetsCents),
    totalLiabilitiesCents: remainingCents,
    totalLiabilities: toYuanString(remainingCents),
    netWorthCents,
    netWorth: toYuanString(netWorthCents),
    monthlyPaymentTotalCents: monthlyPaymentCents,
    monthlyPaymentTotal: toYuanString(monthlyPaymentCents),
    assetsEstimated,
    breakdown: categoryBreakdown(db, m),
  };
}
