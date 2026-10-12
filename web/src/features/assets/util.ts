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

/** 资产类型可选值（Web 下拉与小程序 picker 保持一致；空串 = 不选） */
export const ASSET_KIND_OPTIONS = [
  '不动产', '金融投资', '车辆', '黄金珠宝', '存款现金', '保险', '收藏品', '其他',
];

/** 类型关键词 → emoji（含存量自由文本写法，如「投资」；顺序即优先级） */
const KIND_KEYWORDS: Array<[string, string]> = [
  ['不动产', '🏠'], ['房产', '🏠'], ['房', '🏠'],
  ['金融投资', '📈'], ['投资', '📈'], ['基金', '📈'], ['股票', '📈'], ['理财', '📈'], ['证券', '📈'],
  ['车辆', '🚗'], ['车', '🚗'],
  ['黄金珠宝', '🪙'], ['黄金', '🪙'], ['贵金属', '🪙'], ['珠宝', '🪙'],
  ['存款现金', '💰'], ['存款', '💰'], ['现金', '💰'],
  ['保险', '🛡️'],
  ['收藏品', '🏺'], ['收藏', '🏺'], ['古玩', '🏺'],
];

/**
 * 资产名称关键词 → emoji：类型没填时按名称兜底（决定 2）。
 * 顺序即优先级：房 → 车 → 贵金属 → 保险 → 收藏 → 存款 → 投资（最泛的放最后）。
 */
const NAME_KEYWORDS: Array<[string, string]> = [
  ['房', '🏠'], ['住宅', '🏠'], ['公寓', '🏠'], ['别墅', '🏠'], ['商铺', '🏠'], ['写字楼', '🏠'],
  ['车', '🚗'], ['特斯拉', '🚗'], ['宝马', '🚗'], ['奔驰', '🚗'], ['奥迪', '🚗'], ['保时捷', '🚗'],
  ['比亚迪', '🚗'], ['蔚来', '🚗'], ['理想', '🚗'], ['小鹏', '🚗'], ['丰田', '🚗'], ['本田', '🚗'],
  ['黄金', '🪙'], ['金条', '🪙'], ['金饰', '🪙'], ['贵金属', '🪙'], ['珠宝', '🪙'], ['钻石', '🪙'],
  ['保险', '🛡️'], ['保单', '🛡️'],
  ['收藏', '🏺'], ['古玩', '🏺'], ['字画', '🏺'], ['邮票', '🏺'], ['纪念币', '🏺'],
  ['存款', '💰'], ['现金', '💰'], ['活期', '💰'], ['定期', '💰'],
  ['股票', '📈'], ['基金', '📈'], ['理财', '📈'], ['证券', '📈'], ['债券', '📈'], ['投资', '📈'],
  ['茅台', '📈'], ['五粮液', '📈'], ['宁德时代', '📈'], ['腾讯', '📈'], ['阿里', '📈'], ['苹果', '📈'], ['英伟达', '📈'],
];

function match(text: string, table: Array<[string, string]>): string | null {
  for (const [keyword, emoji] of table) {
    if (text.includes(keyword)) return emoji;
  }
  return null;
}

/** 资产类型 → emoji；未命中返回 null（供组合匹配判断）。 */
export function assetKindEmoji(kind: string | null | undefined): string | null {
  const text = (kind ?? '').trim().toLowerCase();
  if (!text) return null;
  return match(text, KIND_KEYWORDS);
}

/** 资产图标：用户选的类型优先，类型缺失时按名称兜底，最后 💼（与小程序逻辑一致）。 */
export function assetEmoji(name: string | null | undefined, kind: string | null | undefined): string {
  const byKind = assetKindEmoji(kind);
  if (byKind) return byKind;
  const byName = match((name ?? '').trim().toLowerCase(), NAME_KEYWORDS);
  return byName ?? '💼';
}
