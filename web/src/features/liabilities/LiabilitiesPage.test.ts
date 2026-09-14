import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { formatMoney } from '../../lib/format';
import { cachedGet, apiPost, apiPatch, apiDelete, ApiError } from '../../lib/api';
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
    if (path === '/api/repayments') {
      const id = params?.liabilityId;
      return Promise.resolve(id === 1 ? repayments : []);
    }
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
  const stat = Array.from(document.querySelectorAll('.stat')).find(
    (s) => s.querySelector('.stat__label')?.textContent?.trim() === label,
  );
  return stat?.querySelector('.money')?.textContent ?? '';
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
  const hit = li.querySelector('button.liab__hit') as HTMLButtonElement | null;
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

describe('AC-01 顶部统计', () => {
  it('显示总负债与月供合计', async () => {
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    expect(document.body.textContent).toContain('总负债');
    expect(document.body.textContent).toContain('月供合计');
    expect(statValue('总负债')).toBe(formatMoney(summary.totalLiabilitiesCents));
    expect(statValue('月供合计')).toBe(formatMoney(summary.monthlyPaymentTotalCents));
  });
});

describe('AC-02 负债列表', () => {
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
    clickBtnInDialog('删除');
    await settle();
    expect(mockedApiDelete).toHaveBeenCalledWith('/api/liabilities/1');
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
    clickBtnInDialog('删除');
    await settle();
    expect(mockedApiDelete).toHaveBeenCalledWith('/api/repayments/1');
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

  it('数据请求失败时优雅降级，不抛未捕获异常', async () => {
    mockedCachedGet.mockRejectedValue(new Error('network'));
    wrapper = mount(LiabilitiesPage, { attachTo: document.body });
    await settle();
    expect(document.body.textContent).toContain('还没有负债');
  });
});
