/**
 * 分类图标组件（自包含）：传入 iconKey，渲染对应图标。
 *
 * 设计约束（踩过的坑，勿回退）：
 * 1. 小程序打包根是 mini/，不能 import 打包根之外的模块 —— 因此图标数据直接内联在本文件；
 *    数据源与同步方式见仓库根 shared/category-icons.ts 与 scripts/generate-category-icon-svgs.mjs。
 * 2. WXML 不支持内联 <svg> —— 渲染用 <image> 引用 mini/assets/icons/categories/<key>.svg
 *    （由 scripts/generate-category-icon-svgs.mjs 生成）。
 * 3. project.config.json 的 enhance 必须为 true，否则 SWC 编译产物缺 @swc/runtime 辅助函数。
 *
 * 用法示例：
 *   <category-icon icon-key="{{category.icon_key}}" kind="expense" />
 */

/** icon_key 合法集合，须与 shared/category-icons.ts、后端 CategoryIconDictionary.VALID_KEYS 一致。 */
const ICON_KEYS = [
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

type IconKey = typeof ICON_KEYS[number];

const DEFAULT_KEY: IconKey = 'other';

/** 收敛任意字符串到合法 icon_key，未知返回 'other'。 */
function resolveCategoryIconKey(value: string | null | undefined): IconKey {
  if (!value) return DEFAULT_KEY;
  return (ICON_KEYS as readonly string[]).includes(value) ? (value as IconKey) : DEFAULT_KEY;
}

/** 小程序 Component 实例的最小方法集。 */
interface ComponentInstance {
  data: { src: string; key: string };
  setData(data: Partial<{ src: string; key: string }>): void;
  syncIcon(iconKey: string): void;
}

Component({
  properties: {
    iconKey: {
      type: String,
      value: '',
    },
    /** kind 仅作为容器着色的语义标记，图标本身为单色资源。 */
    kind: {
      type: String,
      value: 'expense',
    },
    /** 像素尺寸。 */
    size: {
      type: Number,
      value: 28,
    },
  },
  data: {
    src: '/assets/icons/categories/other.svg',
    key: 'other' as string,
  },
  methods: {
    syncIcon(this: ComponentInstance, iconKey: string): void {
      const key = resolveCategoryIconKey(iconKey);
      this.setData({ key, src: '/assets/icons/categories/' + key + '.svg' });
    },
  },
  observers: {
    'iconKey, kind'(this: unknown, iconKey: string): void {
      (this as ComponentInstance).syncIcon(iconKey);
    },
  },
  lifetimes: {
    attached(this: unknown): void {
      const instance = this as ComponentInstance;
      instance.syncIcon('');
    },
  },
});