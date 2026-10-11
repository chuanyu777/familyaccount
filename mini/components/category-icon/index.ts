/**
 * 分类图标组件（自包含）—— emoji 风格。
 *
 * 设计约束（踩过的坑，勿回退）：
 * 1. 小程序打包根是 mini/，不能 import 打包根之外的模块 —— 因此 emoji 映射内联在本文件；
 *    数据源与同步方式见仓库根 shared/category-icons.ts（其中同名映射必须与本文件一致）。
 * 2. project.config.json 的 enhance 必须为 true，否则 SWC 编译产物缺 @swc/runtime 辅助函数。
 * 3. minified 保持 false：压缩管线在当前工具版本下会丢 SWC runtime。
 *
 * 用法示例：
 *   <category-icon icon-key="{{category.icon_key}}" kind="expense" />
 */

/** icon_key 合法集合，须与 shared/category-icons.ts、后端 CategoryIconDictionary.VALID_KEYS 一致。 */
const ICON_KEYS: readonly string[] = [
  'food', 'transport', 'shopping', 'home', 'utility',
  'entertainment', 'health', 'education', 'clothing',
  'salary', 'invest', 'gift', 'pet', 'repay', 'other',
];

/** icon_key → emoji（与 shared/category-icons.ts 的 CATEGORY_ICON_EMOJI 保持一致）。 */
const ICON_EMOJI: Record<string, string> = {
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

var DEFAULT_KEY = 'other';

/** 收敛任意字符串到合法 icon_key，未知返回 'other'。 */
function resolveCategoryIconKey(value: string | null | undefined): string {
  if (!value) return DEFAULT_KEY;
  return ICON_KEYS.indexOf(value) >= 0 ? value : DEFAULT_KEY;
}

/** 小程序 Component 实例的最小方法集。 */
interface ComponentInstance {
  data: { emoji: string; key: string };
  setData(data: Partial<{ emoji: string; key: string }>): void;
  syncIcon(iconKey: string): void;
}

Component({
  properties: {
    iconKey: {
      type: String,
      value: '',
    },
    /** kind 仅作为容器着色的语义标记。 */
    kind: {
      type: String,
      value: 'expense',
    },
    /** 像素尺寸（emoji 字号按比例缩放）。 */
    size: {
      type: Number,
      value: 28,
    },
  },
  data: {
    emoji: '🏷️',
    key: 'other',
  },
  methods: {
    syncIcon(this: ComponentInstance, iconKey: string): void {
      const key = resolveCategoryIconKey(iconKey);
      this.setData({ key, emoji: ICON_EMOJI[key] || ICON_EMOJI[DEFAULT_KEY] });
    },
  },
  observers: {
    'iconKey, kind'(this: unknown, iconKey: string): void {
      (this as ComponentInstance).syncIcon(iconKey);
    },
  },
  lifetimes: {
    attached(this: unknown): void {
      // 注意：attached 晚于 observers 的初始触发，这里必须用真实初始属性同步；
      // 传空串会把 observers 已算好的正确图标覆盖回兜底（历史 bug：明细全显示 🏷️）。
      const instance = this as ComponentInstance & { data: { iconKey?: string } };
      instance.syncIcon(instance.data.iconKey ?? '');
    },
  },
});