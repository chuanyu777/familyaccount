/** 金额（分）格式化为带 ¥ 的字符串，如 1234 → "¥12.34"，-1234 → "-¥12.34"，整数部分加千分位 */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const fen = abs % 100;
  return `${sign}¥${groupThousands(yuan)}.${fen.toString().padStart(2, '0')}`;
}

function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** "2026-09-12" → "今天 · 周六" / "昨天 · 周五" / "9月12日 周六" */
export function dayLabel(iso: string): string {
  const parts = iso.split('-').map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const week = WEEKDAYS[new Date(y, m - 1, d).getDay()] ?? '';
  const today = new Date();
  const todayIso = toISODate(today);
  if (iso === todayIso) return `今天 · ${week}`;
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (iso === toISODate(yesterday)) return `昨天 · ${week}`;
  return `${m}月${d}日 ${week}`;
}

/** 金额（分）转表单回填用无符号小数串，如 1234 → "12.34"，-500 → "-5" */
export function centsToInput(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const fen = abs % 100;
  if (fen === 0) return `${sign}${yuan}`;
  return `${sign}${yuan}.${fen.toString().padStart(2, '0')}`;
}

/** 今天日期 YYYY-MM-DD */
export function todayISO(): string {
  return toISODate(new Date());
}

/** 当前月份 YYYY-MM */
export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

/** "2026-09" → "2026年9月" */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${y}年${Number(m)}月`;
}

/** "2026-09" 平移 n 个月，跨年自动进位/借位 */
export function shiftMonth(month: string, delta: number): string {
  const [yStr, mStr] = month.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${nm.toString().padStart(2, '0')}`;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}
