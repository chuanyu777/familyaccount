/**
 * 分类图标组件：传入 iconKey，渲染对应的 SVG 路径。
 *
 * 数据契约：shared/category-icons.ts 维护 icon_key 集合与 SVG path 数据。
 * 未知 key 自动兜底为 'other'。
 *
 * 用法示例：
 *   <category-icon icon-key="{{category.icon_key}}" kind="expense" />
 *
 * kind 用于着色：expense / income / transfer，分别用支出 / 收入 / 默认色。
 */
import { getCategoryIconPath, resolveCategoryIconKey } from '../../../shared/category-icons';

/** 小程序 Component 实例的最小方法集（在 options 之外、observers/lifetimes 内 this 不能直接拿到这些）。 */
interface ComponentInstance {
  data: { path: string; key: string };
  setData(data: Partial<{ path: string; key: string }>): void;
  syncIcon(iconKey: string): void;
}

Component({
  properties: {
    iconKey: {
      type: String,
      value: '',
    },
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
    path: '',
    key: 'other',
  },
  methods: {
    syncIcon(this: ComponentInstance, iconKey: string): void {
      const key = resolveCategoryIconKey(iconKey);
      this.setData({ key, path: getCategoryIconPath(key) });
    },
  },
  observers: {
    'iconKey, kind'(this: unknown, iconKey: string): void {
      (this as ComponentInstance).syncIcon(iconKey);
    },
  },
  lifetimes: {
    attached(this: unknown): void {
      (this as ComponentInstance).syncIcon('');
    },
  },
});