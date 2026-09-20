import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { formatMoney } from '../../lib/format';
import { cachedGet, apiPost, apiPatch, apiDelete, ApiError } from '../../lib/api';
import { publishResources } from '../../lib/resourceInvalidation';
import AssetsPage from './AssetsPage.vue';
import type { Account, Asset, Member, Summary } from './types';

vi.mock('../../lib/api', () => {
  class ApiErrorImpl extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return {
    cachedGet: vi.fn(),
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    apiPatch: vi.fn(),
    apiPut: vi.fn(),
    apiDelete: vi.fn(),
    invalidate: vi.fn(),
    ApiError: ApiErrorImpl,
  };
});

const mockedCachedGet = vi.mocked(cachedGet) as unknown as Mock;
const mockedApiPost = vi.mocked(apiPost) as unknown as Mock;
const mockedApiPatch = vi.mocked(apiPatch) as unknown as Mock;
const mockedApiDelete = vi.mocked(apiDelete) as unknown as Mock;

const members: Member[] = [
  { id: 1, name: '我', color: '#f00' },
  { id: 2, name: '配偶', color: '#0f0' },
];
const accounts: Account[] = [
  { id: 1, name: '现金', balance: '0.00', balance_cents: 0, member_id: 1, is_default: true },
  { id: 2, name: '银行卡', balance: '-200.00', balance_cents: -20000, member_id: 2, is_default: false },
];
const assets: Asset[] = [
  {
    id: 1,
    name: '房产',
    value: '1000000.00',
    value_cents: 100000000,
    kind: '不动产',
    member_id: 1,
    updated_at: '2026-09-01',
    updated_by_member_id: 1,
  },
  {
    id: 2,
    name: '股票',
    value: '50000.00',
    value_cents: 5000000,
    kind: '投资',
    member_id: 2,
    updated_at: '2026-09-02',
    updated_by_member_id: 2,
  },
];
const summary: Summary = {
  totalAssetsCents: 104980000,
  totalLiabilitiesCents: 0,
  netWorthCents: 104980000,
  monthlyPaymentTotalCents: 0,
  accountsTotalCents: -20000,
  assetsTotalCents: 105000000,
  totalAssets: '0.00',
};

const snapshots = [
  {
    id: 11,
    asset_id: 1,
    month: '2026-09',
    value_cents: 100000000,
    value: '1000000.00',
    note: null,
    recorded_at: '2026-09-01',
  },
  {
    id: 10,
    asset_id: 1,
    month: '2026-08',
    value_cents: 99000000,
    value: '990000.00',
    note: '月末对账',
    recorded_at: '2026-08-31',
  },
];

function setupCache() {
  mockedCachedGet.mockImplementation((path: string) => {
    if (path === '/api/stats/summary') return Promise.resolve(summary);
    if (path === '/api/accounts') return Promise.resolve(accounts);
    if (path === '/api/assets') return Promise.resolve(assets);
    if (path === '/api/members') return Promise.resolve(members);
    if (path === '/api/repayments') return Promise.resolve([]);
    if (/\/api\/assets\/\d+\/snapshots$/.test(path)) return Promise.resolve(snapshots);
    return Promise.resolve(undefined);
  });
}

// —— DOM 辅助（AppSheet / ConfirmDialog 通过 Teleport 渲染到 body）——
function root(): ParentNode {
  return document.body;
}
function findBtn(label: string, scope: ParentNode = root()): HTMLButtonElement | null {
  return (
    Array.from(scope.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === label) ?? null
  );
}
function clickBtn(label: string, scope: ParentNode = root()) {
  const btn = findBtn(label, scope);
  if (!btn) throw new Error(`button not found: ${label}`);
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}
function clickBtnInDialog(label: string) {
  const dialog = document.querySelector('.dialog');
  if (!dialog) throw new Error('dialog not found');
  clickBtn(label, dialog);
}
function fieldInput(label: string, scope: ParentNode = root()): HTMLInputElement | null {
  const labels = Array.from(scope.querySelectorAll('label'));
  for (const l of labels) {
    const span = l.querySelector('.field__label');
    if (span && (span.textContent ?? '').trim().includes(label)) {
      return (l.querySelector('input, select') as HTMLInputElement) ?? null;
    }
  }
  return null;
}
function setInput(el: HTMLInputElement | HTMLSelectElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}
function liByText(text: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll('li')).find((li) => (li.textContent ?? '').includes(text)) ?? null
  );
}
/** 点整行打开详情弹层（编辑/删除等低频操作都在弹层里） */
function openRow(text: string) {
  const li = liByText(text);
  if (!li) throw new Error(`row not found: ${text}`);
  const hit = li.querySelector('button.row') as HTMLButtonElement | null;
  if (!hit) throw new Error(`row button not found: ${text}`);
  hit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}
/** 弹层底部操作区 */
function clickBtnInSheet(label: string) {
  const actions = document.querySelector('.sheet .detail__actions');
  if (!actions) throw new Error('sheet actions not found');
  clickBtn(label, actions);
}
function statValue(label: string): string {
  const metric = Array.from(document.querySelectorAll('.summary-strip > div')).find(
    (s) => s.querySelector('.summary-strip__label')?.textContent?.trim() === label,
  );
  return metric?.querySelector('.money')?.textContent ?? '';
}

function heroAmount(): string {
  return statValue('净资产');
}

let wrapper: ReturnType<typeof mount> | null = null;
async function settle() {
  await flushPromises();
  await flushPromises();
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  setupCache();
  mockedApiPost.mockResolvedValue(undefined);
  mockedApiPatch.mockResolvedValue(undefined);
  mockedApiDelete.mockResolvedValue(undefined);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('AC-01 顶部总览卡', () => {
  it('renders the approved assets page header and primary action', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    const header = document.querySelector('.page-header');
    expect(header?.querySelector('h1')?.textContent).toBe('资产');
    expect(header?.querySelector('.page-header__context')?.textContent).toBe('账户与资产项');
    expect(findBtn('新增资产', header ?? undefined)).toBeTruthy();
  });

  it('显示净资产/总资产/总负债与账户·资产项拆分', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    expect(findByText('净资产')).toBeTruthy();
    expect(heroAmount()).toBe(formatMoney(summary.netWorthCents));
    expect(statValue('总资产')).toBe(formatMoney(summary.totalAssetsCents));
    expect(statValue('总负债')).toBe(formatMoney(-summary.totalLiabilitiesCents));
    expect(document.querySelector('.summary-strip')).toBeTruthy();
  });
});

describe('assets workspace', () => {
  it('renders separate account and asset groups with whole-row detail actions', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    expect(document.querySelector('[data-account-list]')).toBeTruthy();
    expect(document.querySelector('[data-asset-list]')).toBeTruthy();
    const accountRow = document.querySelector<HTMLButtonElement>('[data-account-row="1"]');
    const assetRow = document.querySelector<HTMLButtonElement>('[data-asset-row="1"]');
    expect(accountRow?.tagName).toBe('BUTTON');
    expect(assetRow?.tagName).toBe('BUTTON');
    expect(accountRow?.querySelector('.row__actions')).toBeNull();
    accountRow?.click();
    await settle();
    expect(document.querySelector('.sheet')?.textContent).toContain('余额');
  });

  it('shows pending save state and keeps entered values after an API error', async () => {
    let rejectSave!: (error: Error) => void;
    mockedApiPost.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectSave = reject; }));
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    clickBtn('新增资产');
    await settle();
    setInput(fieldInput('资产名称')!, '基金');
    setInput(fieldInput('市值')!, '8000');
    clickBtn('保存');
    await settle();
    expect(findBtn('保存中…')?.disabled).toBe(true);
    rejectSave(new Error('网络失败'));
    await settle();
    expect((fieldInput('资产名称') as HTMLInputElement).value).toBe('基金');
    expect(document.body.textContent).toContain('网络失败');
    expect(findBtn('保存')?.disabled).toBe(false);
  });

  it('does not reload members when an asset edit publishes asset invalidation', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    mockedCachedGet.mockClear();
    mockedApiPatch.mockImplementationOnce(async () => {
      publishResources(['assets', 'statistics']);
    });
    openRow('股票');
    await settle();
    clickBtnInSheet('编辑');
    await settle();
    setInput(fieldInput('市值') as HTMLInputElement, '60000');
    clickBtn('保存');
    await settle();
    expect(mockedCachedGet).toHaveBeenCalledWith('/api/assets', undefined, { force: true });
    expect(mockedCachedGet).not.toHaveBeenCalledWith('/api/members', undefined, { force: true });
  });
});

describe('AC-02 资金账户区', () => {
  it('列出账户名/余额/成员/默认标记', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    expect(document.body.textContent).toContain('现金');
    expect(document.body.textContent).toContain('银行卡');
    expect(document.body.textContent).toContain(formatMoney(0));
    expect(document.body.textContent).toContain('我');
    expect(document.body.textContent).toContain('配偶');
    expect(document.querySelectorAll('.tag').length).toBeGreaterThanOrEqual(1);
  });

  it('新增账户只需名称，调用 POST /api/accounts {name}', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    clickBtn('新增账户');
    await settle();
    const nameInput = fieldInput('账户名称');
    expect(nameInput).toBeTruthy();
    setInput(nameInput!, '支付宝');
    clickBtn('保存');
    await settle();
    expect(mockedApiPost).toHaveBeenCalledWith('/api/accounts', expect.objectContaining({ name: '支付宝' }));
  });

  it('编辑账户名称走 PATCH /api/accounts/:id {name}', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    openRow('现金');
    await settle();
    clickBtnInSheet('编辑');
    await settle();
    const nameInput = fieldInput('账户名称') as HTMLInputElement;
    setInput(nameInput, '零钱');
    clickBtn('保存');
    await settle();
    expect(mockedApiPatch).toHaveBeenCalledWith('/api/accounts/1', expect.objectContaining({ name: '零钱' }));
    expect(mockedApiPatch).not.toHaveBeenCalledWith('/api/accounts/1/calibrate', expect.anything());
  });

  it('校准余额走 PATCH /api/accounts/:id/calibrate {balance}', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    openRow('银行卡');
    await settle();
    clickBtnInSheet('编辑');
    await settle();
    const balInput = fieldInput('余额') as HTMLInputElement;
    setInput(balInput, '500');
    clickBtn('保存');
    await settle();
    expect(mockedApiPatch).toHaveBeenCalledWith('/api/accounts/2/calibrate', expect.objectContaining({ balance: 500 }));
  });

  it('设为默认调用 POST /api/accounts/:id/set-default', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    openRow('银行卡');
    await settle();
    clickBtnInSheet('设为默认');
    await settle();
    expect(mockedApiPost).toHaveBeenCalledWith('/api/accounts/2/set-default', expect.anything());
  });

  it('负余额显示红色「余额为负」标记', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    expect(document.querySelector('.tag--expense')).toBeTruthy();
    expect(document.body.textContent).toContain('余额为负');
    expect(document.body.textContent).toContain(formatMoney(-20000));
  });

  it('编辑与删除不在列表行内，需点开详情', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    const row = liByText('现金');
    expect(row!.querySelector('.row__actions')).toBeNull();
    expect(row!.textContent).not.toContain('删除');
  });

  it('有交易的账户删除返回 409 时提示无法删除', async () => {
    mockedApiDelete.mockRejectedValueOnce(new ApiError(409, 'ACCOUNT_IN_USE', '账户已有交易'));
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    openRow('现金');
    await settle();
    clickBtnInSheet('删除');
    await settle();
    clickBtnInDialog('删除');
    await settle();
    expect(document.body.textContent).toContain('该账户存在交易记录，无法删除');
    expect(document.body.textContent).toContain('现金');
  });
});

describe('AC-03 资产项区', () => {
  it('列出名称/市值/类型/成员/最后更新', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    expect(document.body.textContent).toContain('房产');
    expect(document.body.textContent).toContain('股票');
    expect(document.body.textContent).toContain(formatMoney(100000000));
    expect(document.body.textContent).toContain(formatMoney(5000000));
    expect(document.body.textContent).toContain('不动产');
    expect(document.body.textContent).toContain('投资');
  });

  it('点开资产行可看到最后更新时间', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    openRow('房产');
    await settle();
    expect(document.body.textContent).toContain('最后更新');
    expect(document.body.textContent).toContain('2026-09-01');
  });

  it('新增资产调用 POST /api/assets', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    clickBtn('新增资产');
    await settle();
    setInput(fieldInput('资产名称')!, '基金');
    setInput(fieldInput('市值')!, '8000');
    setInput(fieldInput('类型')!, '投资');
    clickBtn('保存');
    await settle();
    expect(mockedApiPost).toHaveBeenCalledWith(
      '/api/assets',
      expect.objectContaining({ name: '基金', value: 8000, kind: '投资' }),
    );
  });

  it('编辑资产调用 PATCH /api/assets/:id', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    openRow('股票');
    await settle();
    clickBtnInSheet('编辑');
    await settle();
    setInput(fieldInput('市值') as HTMLInputElement, '60000');
    clickBtn('保存');
    await settle();
    expect(mockedApiPatch).toHaveBeenCalledWith('/api/assets/2', expect.objectContaining({ value: 60000 }));
  });

  it('删除资产需二次确认后才调用 apiDelete', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    openRow('股票');
    await settle();
    clickBtnInSheet('删除');
    await settle();
    expect(mockedApiDelete).not.toHaveBeenCalled();
    clickBtnInDialog('删除');
    await settle();
    expect(mockedApiDelete).toHaveBeenCalledWith('/api/assets/2');
  });

  it('市值 < 0 时前端拦截，不提交', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    clickBtn('新增资产');
    await settle();
    setInput(fieldInput('资产名称')!, '负债伪装');
    setInput(fieldInput('市值')!, '-5');
    clickBtn('保存');
    await settle();
    expect(document.body.textContent).toContain('市值不能为负');
    expect(mockedApiPost).not.toHaveBeenCalledWith('/api/assets', expect.anything());
  });

  it('按成员汇总切换显示各成员市值合计', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    clickBtn('按成员');
    await settle();
    expect(document.body.textContent).toContain(formatMoney(100000000));
    expect(document.body.textContent).toContain(formatMoney(5000000));
    expect(document.body.textContent).toContain('配偶');
  });

  it('按类型汇总切换显示各类型市值合计', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    clickBtn('按类型');
    await settle();
    expect(document.body.textContent).toContain('不动产');
    expect(document.body.textContent).toContain('投资');
    expect(document.body.textContent).toContain(formatMoney(100000000));
    expect(document.body.textContent).toContain(formatMoney(5000000));
  });
});

describe('AC-04 空状态与失败降级', () => {
  it('无账户/资产时显示引导文案且不报错', async () => {
    mockedCachedGet.mockImplementation((path: string) => {
      if (path === '/api/stats/summary') return Promise.resolve(summary);
      if (path === '/api/members') return Promise.resolve(members);
      return Promise.resolve([]);
    });
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    expect(document.body.textContent).toContain('还没有资金账户');
    expect(document.body.textContent).toContain('还没有资产项');
  });

  it('数据请求失败时展示可重试错误，不抛未捕获异常', async () => {
    mockedCachedGet.mockRejectedValue(new Error('network'));
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('network');
    expect(findBtn('重试')).toBeTruthy();
  });

  it('keeps an asset failure and retry scoped to the asset group', async () => {
    let assetRequests = 0;
    mockedCachedGet.mockImplementation((path: string) => {
      if (path === '/api/stats/summary') return Promise.resolve(summary);
      if (path === '/api/accounts') return Promise.resolve(accounts);
      if (path === '/api/members') return Promise.resolve(members);
      if (path === '/api/assets') {
        assetRequests += 1;
        return assetRequests === 1 ? Promise.reject(new Error('assets offline')) : Promise.resolve(assets);
      }
      return Promise.resolve([]);
    });
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    const accountGroup = document.querySelector('[data-account-group]')!;
    const assetGroup = document.querySelector('[data-asset-group]')!;
    expect(accountGroup.querySelector('[role="alert"]')).toBeNull();
    expect(accountGroup.textContent).toContain('现金');
    expect(assetGroup.querySelector('[role="alert"]')?.textContent).toContain('assets offline');

    mockedCachedGet.mockClear();
    clickBtn('重试', assetGroup);
    await settle();
    expect(mockedCachedGet).toHaveBeenCalledTimes(1);
    expect(mockedCachedGet).toHaveBeenCalledWith('/api/assets', undefined, { force: true });
    expect(mockedCachedGet).not.toHaveBeenCalledWith('/api/accounts', undefined, { force: true });
    expect(mockedCachedGet).not.toHaveBeenCalledWith('/api/members', undefined, { force: true });
  });
});

describe('AC-05 资产市值历史', () => {
  it('详情弹层里列出历次市值记录', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    openRow('房产');
    await settle();
    expect(document.body.textContent).toContain('市值记录');
    expect(document.body.textContent).toContain('2026年8月');
    expect(document.body.textContent).toContain('2026年9月');
    expect(document.body.textContent).toContain('月末对账');
  });

  it('「更新市值」提交到快照接口', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    openRow('房产');
    await settle();
    clickBtnInSheet('更新市值');
    await settle();

    const monthInput = fieldInput('记账月份');
    expect(monthInput).toBeTruthy();
    setInput(monthInput!, '2026-09');
    setInput(fieldInput('9月末市值')!, '1010000');
    await settle();
    clickBtn('保存');
    await settle();

    expect(mockedApiPost).toHaveBeenCalledWith('/api/assets/1/snapshots', {
      month: '2026-09',
      value: 1010000,
      note: null,
    });
  });

  it('删掉一条市值记录走 DELETE /api/assets/snapshots/:id', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    openRow('房产');
    await settle();
    const del = document.querySelector<HTMLButtonElement>('.history__del');
    expect(del).toBeTruthy();
    del!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(mockedApiDelete).toHaveBeenCalledWith('/api/assets/snapshots/11');
  });

  it('keeps snapshot rows visible during a failed refresh and retries only snapshots', async () => {
    mockedCachedGet.mockImplementation((path: string, _params: unknown, options: { force?: boolean } = {}) => {
      if (path === '/api/stats/summary') return Promise.resolve(summary);
      if (path === '/api/accounts') return Promise.resolve(accounts);
      if (path === '/api/assets') return Promise.resolve(assets);
      if (path === '/api/members') return Promise.resolve(members);
      if (/\/api\/assets\/\d+\/snapshots$/.test(path)) {
        return options.force ? Promise.reject(new Error('history offline')) : Promise.resolve(snapshots);
      }
      return Promise.resolve(undefined);
    });
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    openRow('房产');
    await settle();
    document.querySelector<HTMLButtonElement>('.history__del')!.click();
    await settle();
    expect(document.querySelector('.history__list')?.textContent).toContain('2026年9月');
    expect(document.querySelector('[data-snapshot-status]')?.textContent).toContain('history offline');

    mockedCachedGet.mockClear();
    clickBtn('重试市值记录');
    await settle();
    expect(mockedCachedGet).toHaveBeenCalledTimes(1);
    expect(mockedCachedGet).toHaveBeenCalledWith('/api/assets/1/snapshots', undefined, { force: true });
    expect(mockedCachedGet).not.toHaveBeenCalledWith('/api/accounts', undefined, { force: true });
    expect(mockedCachedGet).not.toHaveBeenCalledWith('/api/members', undefined, { force: true });
  });

  it('provides a 44px snapshot delete target', async () => {
    wrapper = mount(AssetsPage, { attachTo: document.body });
    await settle();
    openRow('房产');
    await settle();
    const del = document.querySelector<HTMLButtonElement>('.history__del')!;
    expect(getComputedStyle(del).width).toBe('44px');
    expect(getComputedStyle(del).height).toBe('44px');
  });
});

function findByText(text: string): boolean {
  return (document.body.textContent ?? '').includes(text);
}
