import { request } from '../lib/http';
import { currentMonth, requireCurrentLedger } from './business-state';

export interface StatisticsSummary { totalAssetsCents: number; totalLiabilitiesCents: number; netWorthCents: number; [key: string]: number | string; }
export async function getSummary(): Promise<StatisticsSummary> { requireCurrentLedger(); return request('/api/stats/summary'); }
export async function getMonthlyTrend(months = 6, end = currentMonth()): Promise<unknown> { requireCurrentLedger(); return request(`/api/stats/monthly-trend?months=${months}&end=${end}`); }
export async function getMonthlySnapshot(month = currentMonth()): Promise<unknown> { requireCurrentLedger(); return request(`/api/stats/monthly-snapshot?month=${month}`); }
export async function getCategoryBreakdown(month = currentMonth()): Promise<unknown> { requireCurrentLedger(); return request(`/api/stats/category-breakdown?month=${month}`); }
