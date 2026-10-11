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

/** 资金账户固定 emoji（与小程序 assets 页一致） */
export const ACCOUNT_EMOJI = '💳';

/** 资产类型 → emoji：按 kind 文本子串匹配，未命中给 💼（与小程序映射一致） */
export function assetKindEmoji(kind: string | null | undefined): string {
  const text = (kind ?? '').toLowerCase();
  const table: Array<[string, string]> = [
    ['不动产', '🏠'], ['房', '🏠'],
    ['投资', '📈'], ['基金', '📈'], ['股票', '📈'], ['理财', '📈'], ['证券', '📈'],
    ['车', '🚗'],
    ['黄金', '🪙'], ['贵金属', '🪙'],
    ['保险', '🛡️'],
    ['收藏', '🏺'], ['古玩', '🏺'],
    ['存款', '💰'], ['现金', '💰'],
  ];
  for (const [keyword, emoji] of table) {
    if (text.includes(keyword)) return emoji;
  }
  return '💼';
}
