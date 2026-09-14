/** 月份（'YYYY-MM'）相关的纯函数，服务层共用，避免各处各写一份。 */

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidMonth(month: string): boolean {
  return MONTH_RE.test(month);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 当前月份，形如 '2026-09'。可注入 now 方便测试。 */
export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

/** 'YYYY-MM' 平移 n 个月，跨年自动进位/借位。 */
export function shiftMonth(month: string, delta: number): string {
  const [yStr, mStr] = month.split('-');
  const total = Number(yStr) * 12 + (Number(mStr) - 1) + delta;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${pad2(m)}`;
}

/** 该月最后一天的日期串 'YYYY-MM-DD'，用于「月末之前/之后」的比较。 */
export function lastDayOf(month: string): string {
  const [yStr, mStr] = month.split('-');
  const day = new Date(Number(yStr), Number(mStr), 0).getDate();
  return `${yStr}-${mStr}-${pad2(day)}`;
}

/** 生成以 endMonth 结尾、共 months 个月的升序列表。 */
export function monthRange(endMonth: string, months: number): string[] {
  const out: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    out.push(shiftMonth(endMonth, -i));
  }
  return out;
}
