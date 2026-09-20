import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { formatMoney } from '../../lib/format';
import { cachedGet, apiPost, apiPatch, apiDelete, ApiError } from '../../lib/api';
import { publishResources } from '../../lib/resourceInvalidation';
import LiabilitiesPage from './LiabilitiesPage.vue';
import type { Account, Liability, Member, Repayment, Summary } from './types';

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
  { id: 2, name: '银行卡', balance: '1000.00', balance_cents: 100000, member_id: 2, is_default: false },
];
const liabilities: Liability[] = [
  { id: 1, name: '房贷', remaining: '200000.00', monthlyPayment: '3000.00', payment_day: 5, member_id: 1 },
  { id: 2, name: '消费贷', remaining: '50000.00', monthlyPayment: '', payment_day: 0, member_id: 2 },
  { id: 3, name: '小贷', remaining: '500.00', monthlyPayment: '100.00', payment_day: 10, member_id: 2 },
];
const repayments: Repayment[] = [
  { id: 1, liability_id: 1, amount_cents: 300000, occurred_on: '2026-09-10', account_id: 1 },
  { id: 2, liability_id: 2, amount_cents: 500000, occurred_on: '2026-09-11', account_id: 2 },
];
const summary: Summary = {
  totalAssetsCents: 0,
  totalLiabilitiesCents: 25050000,
  netWorthCents: -25050000,
  monthlyPaymentTotalCents: 310000,
  accountsTotalCents: 0,
  assetsTotalCents: 0,
  totalLiabilities: '0.00',
  monthlyPaymentTotal: '0.00',
};

function setupCache() {
  mockedCachedGet.mockImplementation((path: string, params?: Record<string, unknown>) => {
    if (path === '/api/stats/summary') return Promise.resolve(summary);
    if (path === '/api/liabilities') return Promise.resolve(liabilities);
    if (path === '/api/accounts') return Promise.resolve(accounts);
    if (path === '/api/members') return Promise.resolve(members);
    if (path === '/api/repayments') return Promise.resolve(repayments);
    return Promise.resolve(undefined);
  });
}

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function findBtn(label: string, scope: ParentNode = document.body): HTMLButtonElement | null {
  return (
    Array.from(scope.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === label) ?? null
  );
}
function clickBtn(label: string, scope: ParentNode = document.body) {
  const btn = findBtn(label, scope);
  if (!btn) throw new Error(`button not found: ${label}`);
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}
function clickBtnInDialog(label: string) {
  const dialog = document.querySelector('.dialog');
  if (!dialog) throw new Error('dialog not found');
  clickBtn(label, dialog);
}
function clickBtnIn(scope: ParentNode, label: string) {
  clickBtn(label, scope);
}
function fieldInput(label: string, scope: ParentNode = document.body): HTMLInputElement | null {
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
function statValue(label: string): string {
  const metric = Array.from(document.querySelectorAll('.summary-strip > div')).find(
    (item) => item.querySelector('.summary-strip__label')?.textContent?.trim() === label,
  );
  return metric?.querySelector('.money')?.textContent ?? '';
}

function heroAmount(): string {
  return statValue('总负债');
}
function rowByText(text: string, cls: string): Element | null {
  return (
    Array.from(document.querySelectorAll('.' + cls)).find((li) => (li.textContent ?? '').includes(text)) ?? null
  );
}
/** 点整行打开详情弹层（编辑/删除等低频操作都在弹层里） */
function openRow(text: string) {
  const li = liByText(text);
  if (!li) throw new Error(`row not found: ${text}`);
  const hit = li.querySelector('.liab__hit') as HTMLElement | null;
  if (!hit) throw new Error(`row button not found: ${text}`);
  hit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}
/** 弹层底部操作区（避开弹层内还款记录的删除按钮） */
function clickBtnInSheet(label: string) {
  const actions = document.querySelector('.sheet .detail__actions');
  if (!actions) throw new Error('sheet actions not found');
  clickBtn(label, actions);
}

let wrapper: ReturnType<typeof mount> | null = null;
async function settle() {
  await flushPromises();
  await flushPromises();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
  it('显示总负债与月供合计', async () => {
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    expect(document.body.textContent).toContain('总负债');
    expect(document.body.textContent).toContain('月供合计');
    expect(heroAmount()).toBe(formatMoney(-summary.totalLiabilitiesCents));
    expect(statValue('月供合计')).toBe(formatMoney(-summary.monthlyPaymentTotalCents));
  });
});

describe('AC-02 负债列表', () => {
  it('显示剩余本金、进度和唯一的行内还款操作', async () => {
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    const row = document.querySelector('[data-liability-row="1"]')!;
    expect(row.textContent).toContain('房贷');
    expect(row.textContent).toContain('剩余');
    expect(row.querySelector('[role="progressbar"]')).toBeTruthy();
    expect(Array.from(row.querySelectorAll('button')).map((button) => button.textContent?.trim())).toEqual([
      '还一笔',
    ]);
  });

  it('立即显示每笔负债的准确进度，还款变更后全部刷新', async () => {
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    expect(mockedCachedGet).toHaveBeenCalledWith('/api/repayments', undefined, { force: false });
    const homeProgress = document.querySelector('[data-liability-row="1"] [role="progressbar"]');
    const consumerProgress = document.querySelector('[data-liability-row="2"] [role="progressbar"]');
    expect(homeProgress?.getAttribute('aria-valuenow')).toBe('1');
    expect(consumerProgress?.getAttribute('aria-valuenow')).toBe('9');
    expect(document.querySelector('[data-liability-row="1"]')?.textContent).toContain(formatMoney(300000));
    expect(document.querySelector('[data-liability-row="2"]')?.textContent).toContain(formatMoney(500000));

    const refreshed: Repayment[] = [
      { ...repayments[0]!, amount_cents: 1000000 },
      { ...repayments[1]!, amount_cents: 1500000 },
    ];
    mockedCachedGet.mockImplementation((path: string) => {
      if (path === '/api/repayments') return Promise.resolve(refreshed);
      if (path === '/api/stats/summary') return Promise.resolve(summary);
      if (path === '/api/liabilities') return Promise.resolve(liabilities);
      if (path === '/api/accounts') return Promise.resolve(accounts);
      if (path === '/api/members') return Promise.resolve(members);
      return Promise.resolve(undefined);
    });
    publishResources(['repayments']);
    await settle();

    expect(homeProgress?.getAttribute('aria-valuenow')).toBe('5');
    expect(consumerProgress?.getAttribute('aria-valuenow')).toBe('23');
  });

  it('列出名称/剩余本金/月供/还款日', async () => {
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    expect(document.body.textContent).toContain('房贷');
    expect(document.body.textContent).toContain(formatMoney(20000000));
    expect(document.body.textContent).toContain(formatMoney(300000));
  });

  it('点开负债行可看到还款日与归属', async () => {
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    openRow('房贷');
    await settle();
    expect(document.body.textContent).toContain('每月 5 日');
    expect(document.body.textContent).toContain('剩余本金');
  });

  it('关闭详情后可以无旧历史地选择另一笔负债', async () => {
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    openRow('房贷');
    await settle();
    expect(document.querySelector('.sheet')?.textContent).toContain('2026-09-10');

    clickBtn('关闭', document.querySelector('.sheet')!);
    await settle();
    expect(document.querySelector('.sheet')).toBeNull();

    openRow('消费贷');
    await settle();
    expect(document.querySelector('.sheet')?.textContent).toContain('2026-09-11');
    expect(document.querySelector('.sheet')?.textContent).not.toContain('2026-09-10');
  });

  it('编辑与删除不在列表行内，需点开详情', async () => {
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    const row = liByText('房贷');
    expect(row!.textContent).not.toContain('删除');
  });

  it('新增负债（名称+本金必填）调用 POST /api/liabilities', async () => {
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    clickBtn('新增负债');
    await settle();
    setInput(fieldInput('负债名称')!, '车贷');
    setInput(fieldInput('剩余本金')!, '100000');
    clickBtn('保存');
    await settle();
    expect(mockedApiPost).toHaveBeenCalledWith(
      '/api/liabilities',
      expect.objectContaining({ name: '车贷', remaining: 100000 }),
    );
  });

  it('负债保存期间保持弹层，失败后保留输入', async () => {
    const pending = deferred<void>();
    mockedApiPost.mockImplementationOnce(() => pending.promise);
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    clickBtn('新增负债');
    await settle();
    setInput(fieldInput('负债名称')!, '车贷');
    setInput(fieldInput('剩余本金')!, '100000');
    clickBtn('保存');
    await settle();

    expect(findBtn('保存中…')?.disabled).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.querySelector<HTMLButtonElement>('.sheet__close')!.click();
    await settle();
    expect(document.querySelector('.sheet')).not.toBeNull();

    pending.reject(new Error('网络失败'));
    await settle();
    expect((fieldInput('负债名称') as HTMLInputElement).value).toBe('车贷');
    expect((fieldInput('剩余本金') as HTMLInputElement).value).toBe('100000');
    expect(document.querySelector('.sheet')?.textContent).toContain('网络失败');
  });

  it('剩余本金为空时前端拦截', async () => {
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    clickBtn('新增负债');
    await settle();
    setInput(fieldInput('负债名称')!, '车贷');
    clickBtn('保存');
    await settle();
    expect(document.body.textContent).toContain('请输入剩余本金');
    expect(mockedApiPost).not.toHaveBeenCalledWith('/api/liabilities', expect.anything());
  });

  it('编辑负债调用 PATCH /api/liabilities/:id', async () => {
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    openRow('房贷');
    await settle();
    clickBtnInSheet('编辑');
    await settle();
    setInput(fieldInput('负债名称') as HTMLInputElement, '房贷A');
    clickBtn('保存');
    await settle();
    expect(mockedApiPatch).toHaveBeenCalledWith('/api/liabilities/1', expect.objectContaining({ name: '房贷A' }));
  });

  it('删除负债需二次确认', async () => {
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    openRow('房贷');
    await settle();
    clickBtnInSheet('删除');
    await settle();
    expect(mockedApiDelete).not.toHaveBeenCalled();
    expect(document.querySelector('.dialog')?.textContent).toContain('还款历史');
    expect(document.querySelector('.dialog')?.textContent).toContain('账户余额');
    clickBtnInDialog('删除');
    await settle();
    expect(mockedApiDelete).toHaveBeenCalledWith('/api/liabilities/1');
  });

  it('负债删除只提交一次，失败后保留可重试确认框', async () => {
    const pending = deferred<void>();
    mockedApiDelete.mockImplementation(() => pending.promise);
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    openRow('房贷');
    await settle();
    clickBtnInSheet('删除');
    await settle();

    const dialog = document.querySelector<HTMLElement>('.dialog')!;
    const confirm = findBtn('删除', dialog)!;
    confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(mockedApiDelete).toHaveBeenCalledTimes(1);
    expect(dialog.getAttribute('aria-busy')).toBe('true');
    expect([...dialog.querySelectorAll<HTMLButtonElement>('button')].every(({ disabled }) => disabled)).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    document.querySelector<HTMLElement>('.overlay')!.click();
    expect(document.querySelector('.dialog')).not.toBeNull();

    pending.reject(new Error('删除负债失败'));
    await settle();
    expect(document.querySelector('.dialog')?.textContent).toContain('删除负债失败');
    expect(findBtn('删除', document.querySelector('.dialog')!)?.disabled).toBe(false);
  });
});

describe('AC-03 还一笔', () => {
  it('还款金额默认带出月供，账户默认默认账户，日期默认今天', async () => {
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    const row = liByText('房贷');
    clickBtnIn(row!, '还一笔');
    await settle();
    const amountInput = fieldInput('还款金额') as HTMLInputElement;
    expect(amountInput.value).toBe('3000');
    const dateInput = fieldInput('还款日期') as HTMLInputElement;
    expect(dateInput.value).toBe(todayISO());
    const accountSelect = fieldInput('还款账户') as unknown as HTMLSelectElement;
    expect(accountSelect.value).toBe('1');
  });

  it('月供为 0 时金额默认空，必须手填', async () => {
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    const row = liByText('消费贷');
    clickBtnIn(row!, '还一笔');
    await settle();
    const amountInput = fieldInput('还款金额') as HTMLInputElement;
    expect(amountInput.value).toBe('');
    clickBtn('保存');
    await settle();
    expect(document.body.textContent).toContain('请输入还款金额');
  });

  it('金额超过剩余本金时友好提示', async () => {
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    const row = liByText('小贷');
    clickBtnIn(row!, '还一笔');
    await settle();
    setInput(fieldInput('还款金额') as HTMLInputElement, '600');
    clickBtn('保存');
    await settle();
    expect(document.body.textContent).toContain('还款金额不能超过剩余本金');
  });

  it('正常还款调用 POST /api/repayments', async () => {
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    const row = liByText('房贷');
    clickBtnIn(row!, '还一笔');
    await settle();
    clickBtn('保存');
    await settle();
    expect(mockedApiPost).toHaveBeenCalledWith(
      '/api/repayments',
      expect.objectContaining({ liabilityId: 1, amount: 3000, accountId: 1, occurredOn: todayISO() }),
    );
  });

  it('使用用户选择的还款账户', async () => {
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    clickBtnIn(liByText('房贷')!, '还一笔');
    await settle();
    setInput(fieldInput('还款账户') as unknown as HTMLSelectElement, '2');
    clickBtn('保存');
    await settle();

    expect(mockedApiPost).toHaveBeenCalledWith(
      '/api/repayments',
      expect.objectContaining({ liabilityId: 1, accountId: 2 }),
    );
  });

  it('还款失败时保留表单和已输入的金额', async () => {
    mockedApiPost.mockRejectedValueOnce(new ApiError(500, 'SAVE_FAILED', '还款失败'));
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    clickBtnIn(liByText('房贷')!, '还一笔');
    await settle();
    setInput(fieldInput('还款金额') as HTMLInputElement, '2888');
    clickBtn('保存');
    await settle();

    expect(document.querySelector('.sheet')?.textContent).toContain('还款失败');
    expect((fieldInput('还款金额') as HTMLInputElement).value).toBe('2888');
  });

  it('还款保存期间不允许关闭弹层', async () => {
    const pending = deferred<void>();
    mockedApiPost.mockImplementationOnce(() => pending.promise);
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    clickBtnIn(liByText('房贷')!, '还一笔');
    await settle();
    setInput(fieldInput('还款金额') as HTMLInputElement, '2888');
    clickBtn('保存');
    await settle();

    expect(findBtn('保存中…')?.disabled).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.querySelector<HTMLButtonElement>('.sheet__close')!.click();
    await settle();
    expect(document.querySelector('.sheet')).not.toBeNull();

    pending.reject(new Error('还款失败'));
    await settle();
    expect((fieldInput('还款金额') as HTMLInputElement).value).toBe('2888');
    expect(document.querySelector('.sheet')?.textContent).toContain('还款失败');
  });
});

describe('AC-04 还款记录', () => {
  it('展示还款记录，删除后回滚刷新', async () => {
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    openRow('房贷');
    await settle();
    expect(document.body.textContent).toContain('2026-09-10');
    expect(document.body.textContent).toContain(formatMoney(300000));
    const repayRow = rowByText('2026-09-10', 'repay-row');
    expect(repayRow).toBeTruthy();
    clickBtnIn(repayRow!, '删除');
    await settle();
    expect(document.querySelector('.dialog')?.textContent).toContain('恢复负债本金和账户余额');
    expect(document.querySelector('.dialog')?.textContent).toContain('删除对应还款流水');
    clickBtnInDialog('删除');
    await settle();
    expect(mockedApiDelete).toHaveBeenCalledWith('/api/repayments/1');
  });

  it('还款删除在双击确认时只提交一次', async () => {
    const pending = deferred<void>();
    mockedApiDelete.mockImplementation(() => pending.promise);
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    openRow('房贷');
    await settle();
    clickBtnIn(rowByText('2026-09-10', 'repay-row')!, '删除');
    await settle();

    const dialog = document.querySelector<HTMLElement>('.dialog')!;
    const confirm = findBtn('删除', dialog)!;
    confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(mockedApiDelete).toHaveBeenCalledTimes(1);
    expect(mockedApiDelete).toHaveBeenCalledWith('/api/repayments/1');
    expect(dialog.getAttribute('aria-busy')).toBe('true');

    pending.resolve();
    await settle();
    expect(document.querySelector('.dialog')).toBeNull();
  });

  it('无还款记录显示引导', async () => {
    mockedCachedGet.mockImplementation((path: string, params?: Record<string, unknown>) => {
      if (path === '/api/stats/summary') return Promise.resolve(summary);
      if (path === '/api/liabilities') return Promise.resolve(liabilities);
      if (path === '/api/accounts') return Promise.resolve(accounts);
      if (path === '/api/members') return Promise.resolve(members);
      if (path === '/api/repayments') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    openRow('房贷');
    await settle();
    expect(document.body.textContent).toContain('暂无还款记录');
  });

  it('全部还款请求期间不显示错误的零进度', async () => {
    const pending = deferred<Repayment[]>();
    mockedCachedGet.mockImplementation((path: string) => {
      if (path === '/api/stats/summary') return Promise.resolve(summary);
      if (path === '/api/liabilities') return Promise.resolve(liabilities);
      if (path === '/api/accounts') return Promise.resolve(accounts);
      if (path === '/api/members') return Promise.resolve(members);
      if (path === '/api/repayments') return pending.promise;
      return Promise.resolve([]);
    });
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await flushPromises();

    expect(document.querySelector('[aria-label="加载中"]')).toBeTruthy();
    expect(document.querySelector('[data-liability-row]')).toBeNull();

    pending.resolve(repayments);
    await settle();
    openRow('房贷');
    await settle();
    expect(document.querySelector('.sheet')?.textContent).toContain('2026-09-10');
  });
});

describe('AC-05 空状态与失败降级', () => {
  it('无负债时显示引导文案', async () => {
    mockedCachedGet.mockImplementation((path: string) => {
      if (path === '/api/stats/summary') return Promise.resolve(summary);
      if (path === '/api/accounts') return Promise.resolve(accounts);
      if (path === '/api/members') return Promise.resolve(members);
      return Promise.resolve([]);
    });
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    expect(document.body.textContent).toContain('还没有负债');
  });

  it('数据请求失败时展示可重试错误，不抛未捕获异常', async () => {
    mockedCachedGet.mockRejectedValue(new Error('network'));
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    expect(document.body.textContent).toContain('network');
    expect(findBtn('重试')).toBeTruthy();
  });

  it('还款数据失败时不展示不可验证的零进度', async () => {
    mockedCachedGet.mockImplementation((path: string) => {
      if (path === '/api/stats/summary') return Promise.resolve(summary);
      if (path === '/api/liabilities') return Promise.resolve(liabilities);
      if (path === '/api/accounts') return Promise.resolve(accounts);
      if (path === '/api/members') return Promise.resolve(members);
      if (path === '/api/repayments') return Promise.reject(new Error('还款数据加载失败'));
      return Promise.resolve(undefined);
    });
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();

    expect(document.body.textContent).toContain('还款数据加载失败');
    expect(document.querySelector('[data-liability-row]')).toBeNull();
  });
});
