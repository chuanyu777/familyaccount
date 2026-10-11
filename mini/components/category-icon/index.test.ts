/**
 * category-icon 组件单测。
 *
 * 重点回归：attached 晚于 observers 的初始触发，attached 若用空串同步，
 * 会把 observers 按 iconKey 算好的 emoji 覆盖回兜底 🏷️
 * （线上 bug：明细列表全部显示"其他"图标）。
 */

interface CapturedOptions {
  properties: Record<string, { type: StringConstructor; value: unknown }>;
  data: Record<string, unknown>;
  methods: Record<string, (this: Instance, ...args: unknown[]) => void>;
  observers: Record<string, (this: unknown, ...args: unknown[]) => void>;
  lifetimes: { attached: (this: unknown) => void };
}

interface Instance {
  data: Record<string, unknown>;
  setData(patch: Record<string, unknown>): void;
  syncIcon(iconKey: string): void;
}

let captured: CapturedOptions | null = null;

beforeAll(async () => {
  // stub 必须在组件模块加载前装好（模块顶层会调用 Component()）
  (globalThis as Record<string, unknown>).Component = (options: CapturedOptions) => {
    captured = options;
  };
  await import('./index');
});

/**
 * 按微信真实时序模拟组件创建：属性初始化（observers 以初始值触发）→ attached。
 * 微信运行时会把 methods 合入实例，这里同样合入。
 */
function createComponent(initialIconKey: string): Instance {
  const instance = {
    data: { ...captured!.data, iconKey: initialIconKey },
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch); },
  } as Instance & Record<string, unknown>;
  Object.assign(instance, captured!.methods);
  // 1) 属性初始化阶段：observers 以初始值触发
  captured!.observers['iconKey, kind'].call(instance, initialIconKey);
  // 2) attached 阶段
  captured!.lifetimes.attached.call(instance);
  return instance;
}

describe('category-icon', () => {
  it('初始 iconKey 为具体分类时，attached 后仍保留对应 emoji（不被覆盖回兜底）', () => {
    const instance = createComponent('food');
    expect(instance.data.key).toBe('food');
    expect(instance.data.emoji).toBe('🍜');
  });

  it('初始 iconKey 为空时显示兜底 🏷️', () => {
    const instance = createComponent('');
    expect(instance.data.key).toBe('other');
    expect(instance.data.emoji).toBe('🏷️');
  });

  it('iconKey 后续变化时 emoji 跟随更新（记一笔表单点选分类的场景）', () => {
    const instance = createComponent('');
    // 用户点选「交通」→ 属性变化 → observers 触发
    instance.data.iconKey = 'transport';
    captured!.observers['iconKey, kind'].call(instance, 'transport');
    expect(instance.data.emoji).toBe('🚗');
  });

  it('未知 iconKey 兜底为 other', () => {
    const instance = createComponent('nonexistent');
    expect(instance.data.emoji).toBe('🏷️');
  });
});