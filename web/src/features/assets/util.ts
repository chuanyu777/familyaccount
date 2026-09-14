import type { Member, Account } from './types';

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

export function memberName(members: Member[], id?: number): string {
  if (id == null) return '家庭共有';
  const m = members.find((x) => x.id === id);
  return m ? m.name : '家庭共有';
}

export function accountName(accounts: Account[], id?: number): string {
  if (id == null) return '';
  const a = accounts.find((x) => x.id === id);
  return a ? a.name : '';
}
