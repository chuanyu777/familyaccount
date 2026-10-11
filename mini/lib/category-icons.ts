/**
 * 分类图标定义（小程序端副本）。
 *
 * ⚠️ 本文件由仓库根的 shared/category-icons.ts 复制而来 —— 小程序打包根是 mini/，
 * 无法引用打包根之外的模块。修改图标（emoji / path）请改 shared/category-icons.ts，
 * 然后重新复制到本文件。两边 CATEGORY_ICON_KEYS 必须一致，
 * 后端 CategoryIconDictionary.VALID_KEYS 同。
 */

export const CATEGORY_ICON_KEYS = [
  'food',
  'transport',
  'shopping',
  'home',
  'utility',
  'entertainment',
  'health',
  'education',
  'clothing',
  'salary',
  'invest',
  'gift',
  'pet',
  'repay',
  'other',
] as const;

export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

/**
 * SVG 路径数据。约定 viewBox 为 "0 0 24 24"、fill="none"、stroke="currentColor"、
 * stroke-width="2"、stroke-linecap="round"、stroke-linejoin="round"。
 * 同一个 key 可包含多个子路径（用空格分隔的 SVG path 指令串）。
 */
export const CATEGORY_ICON_PATHS: Record<CategoryIconKey, string> = {
  // 碗 + 筷子
  food: 'M4 11 h16 a8 5 0 0 1 -16 0 Z M8 4 v8 M16 4 v8',
  // 汽车（车体 + 车轮外圈，车轮通过共用 stroke 表达）
  transport: 'M4 14 h16 v3 h-3 a1.5 1.5 0 0 1 -3 0 h-4 a1.5 1.5 0 0 1 -3 0 h-3 z M7 14 v-3 a3 3 0 0 1 3 -3 h4 a3 3 0 0 1 3 3 v3',
  // 购物袋 + 提手
  shopping: 'M5 8 h14 l-1.5 11 a2 2 0 0 1 -2 1.5 h-7 a2 2 0 0 1 -2 -1.5 z M9 8 v-2 a3 3 0 0 1 6 0 v2',
  // 房子
  home: 'M3 12 l9 -8 9 8 v9 h-6 v-6 h-6 v6 h-6 z',
  // 灯泡
  utility: 'M9 18 h6 M10 21 h4 M12 3 a6 6 0 0 0 -4 10.5 h8 a6 6 0 0 0 -4 -10.5 z',
  // 游戏手柄（控制器主体 + 左右按键竖线）
  entertainment: 'M3 9 a2 2 0 0 1 2 -2 h14 a2 2 0 0 1 2 2 v6 a2 2 0 0 1 -2 2 h-14 a2 2 0 0 1 -2 -2 z M8 12 h-2 M9 10 v4 M16 12 h-2 M15 10 v4',
  // 医疗十字
  health: 'M9 3 h6 v6 h6 v6 h-6 v6 h-6 v-6 h-6 v-6 h6 z',
  // 书
  education: 'M3 5 l9 -3 9 3 v12 l-9 4 -9 -4 z M3 5 v12 M12 2 v14',
  // T 恤
  clothing: 'M4 7 l5 -4 h6 l5 4 -3 3 v10 h-10 v-10 z',
  // 钱币 + ¥ 三横
  salary: 'M12 3 a9 9 0 1 0 0 18 a9 9 0 1 0 0 -18 z M9 9 h6 M9 12 h6 M9 15 h6',
  // 上升折线 + 终点点
  invest: 'M3 17 l6 -7 l4 4 l8 -10 M14 4 h7 v7',
  // 礼物盒 + 蝴蝶结
  gift: 'M3 9 h18 v3 h-18 z M4 12 v9 h16 v-9 M12 9 v12 M8 5 a2 2 0 0 1 4 2 a2 2 0 0 1 4 -2',
  // 猫爪（一个上掌 + 四个指垫）
  pet: 'M5 11 a3 3 0 0 1 3 -3 l1 2 2 -3 a3 3 0 0 1 4 0 l2 3 1 -2 a3 3 0 0 1 3 3 v3 a3 3 0 0 1 -3 3 h-10 a3 3 0 0 1 -3 -3 z',
  // 信用卡 + 磁条 + 一个小数字
  repay: 'M3 7 h18 v12 h-18 z M3 11 h18 M7 15 h3',
  // 三角兜底
  other: 'M12 4 l8 16 h-16 z',
};

export const CATEGORY_ICON_VIEW_BOX = '0 0 24 24';

/**
 * icon_key → emoji 映射（当前线上采用的呈现风格，风格 D）。
 * SVG path 数据保留作为备选风格；切换渲染风格只改前端组件，icon_key 契约不变。
 */
export const CATEGORY_ICON_EMOJI: Record<CategoryIconKey, string> = {
  food: '🍜',
  transport: '🚗',
  shopping: '🛒',
  home: '🏠',
  utility: '💡',
  entertainment: '🎮',
  health: '💊',
  education: '📚',
  clothing: '👕',
  salary: '💰',
  invest: '📈',
  gift: '🎁',
  pet: '🐾',
  repay: '💳',
  other: '🏷️',
};

const DEFAULT_ICON_KEY: CategoryIconKey = 'other';

/**
 * 把任意字符串收敛到合法 icon_key：未识别则返回 'other'。
 * 输入为 null/undefined 时也返回 'other'。
 */
export function resolveCategoryIconKey(value: string | null | undefined): CategoryIconKey {
  if (!value) return DEFAULT_ICON_KEY;
  return (CATEGORY_ICON_KEYS as readonly string[]).includes(value)
    ? (value as CategoryIconKey)
    : DEFAULT_ICON_KEY;
}

/** 取 icon 的 SVG path 字符串。未知 key 自动兜底 'other'。 */
export function getCategoryIconPath(value: string | null | undefined): string {
  return CATEGORY_ICON_PATHS[resolveCategoryIconKey(value)];
}

/** 取 icon 对应的 emoji 字符串。未知 key 自动兜底 'other'。 */
export function getCategoryIconEmoji(value: string | null | undefined): string {
  return CATEGORY_ICON_EMOJI[resolveCategoryIconKey(value)];
}