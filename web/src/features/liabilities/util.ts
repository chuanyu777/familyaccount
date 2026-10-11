import type { Account } from './types';

/** 用户输入的「元」字符串解析为「分」；空/非法返回 null */
export function parseYuanToCents(input: string): number | null {
  const t = input.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** 分转表单回填用无符号小数串，如 1234 → "12.34"，-500 → "-5" */
export function centsToInput(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const fen = abs % 100;
  if (fen === 0) return `${sign}${yuan}`;
  return `${sign}${yuan}.${fen.toString().padStart(2, '0')}`;
}

export function accountName(accounts: Account[], id?: number): string {
  if (id == null) return '';
  const a = accounts.find((x) => x.id === id);
  return a ? a.name : '';
}

/** 负债名称 → emoji：按名称子串匹配；顺序即优先级（"房贷"先于"贷"）。未命中给 🏦（与小程序映射一致） */
export function liabilityNameEmoji(name: string | null | undefined): string {
  const value = (name ?? '').toLowerCase();
  const table: Array<[string, string]> = [
    ['房贷', '🏠'], ['房', '🏠'],
    ['车贷', '🚗'], ['车', '🚗'],
    ['信用卡', '💳'], ['花呗', '💳'], ['白条', '💳'],
    ['消费贷', '🧾'], ['经营贷', '🧾'], ['借款', '🧾'], ['贷款', '🧾'], ['贷', '🧾'], ['借', '🧾'],
  ];
  for (const [keyword, emoji] of table) {
    if (value.includes(keyword)) return emoji;
  }
  return '🏦';
}
