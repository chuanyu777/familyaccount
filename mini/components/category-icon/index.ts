/**
 * 分类图标组件：传入 iconKey，渲染对应图标。
 *
 * 渲染方式：微信小程序 WXML 不支持内联 <svg>，这里改用 <image> 引用
 * mini/assets/icons/categories/<key>.svg 静态资源（由
 * scripts/generate-category-icon-svgs.mjs 从 shared/category-icons.ts 生成）。
 *
 * 数据契约：mini/lib/category-icons.ts（shared/category-icons.ts 的小程序副本）。
 * 未知 key 自动兜底为 'other'。
 *
 * 用法示例：
 *   <category-icon icon-key="{{category.icon_key}}" kind="expense" />
 */
import { resolveCategoryIconKey } from '../../lib/category-icons';

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
    key: 'other',
  },
  methods: {
    syncIcon(this: ComponentInstance, iconKey: string): void {
      const key = resolveCategoryIconKey(iconKey);
      this.setData({ key, src: `/assets/icons/categories/${key}.svg` });
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