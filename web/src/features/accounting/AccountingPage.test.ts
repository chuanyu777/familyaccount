import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { apiDelete, cachedGet } from '../../lib/api';
import { parse } from '@vue/compiler-sfc';
import { publishResources } from '../../lib/resourceInvalidation';
import AccountingPage from './AccountingPage.vue';
import accountingPageSource from './AccountingPage.vue?raw';
import TransactionForm from './TransactionForm.vue';
import type { Account, Category, Member, Transaction, TransactionsResponse } from './types';

vi.mock('../../lib/api', () => ({
  cachedGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

const mockedCachedGet = vi.mocked(cachedGet) as unknown as Mock;
const mockedApiDelete = vi.mocked(apiDelete) as unknown as Mock;

const accounts: Account[] = [
  { id: 1, name: '微信', balance: 0, balance_cents: 0, is_default: true },
];
const members: Member[] = [{ id: 1, name: '我' }];
const categories: Category[] = [
  { id: 1, kind: 'expense', name: '餐饮' },
  { id: 2, kind: 'income', name: '工资' },
];
const items: Transaction[] = [
  {
    id: 1,
    type: 'expense',
    amount: 186,
    amountCents: 18600,
    occurredOn: '2026-09-18',
    note: '家庭晚餐',
    accountId: 1,
    accountName: '微信',
    categoryId: 1,
    categoryName: '餐饮',
    memberId: 1,
    memberName: '我',
    sourceType: 'manual',
  },
  {
    id: 2,
    type: 'expense',
    amount: 800,
    amountCents: 80000,
    occurredOn: '2026-09-17',
    accountId: 1,
    accountName: '微信',
    categoryId: 1,
    categoryName: '餐饮',
    memberId: 1,
    memberName: '我',
    sourceType: 'repayment',
  },
  {
    id: 3,
    type: 'transfer',
    amount: 500,
    amountCents: 50000,
    occurredOn: '2026-09-16',
    accountId: 1,
    accountName: '微信',
    toAccountId: 2,
    toAccountName: '储蓄卡',
    memberId: 1,
    memberName: '我',
    sourceType: 'manual',
  },
];
const list: TransactionsResponse = {
  items,
  page: 1,
  pageSize: 20,
  total: 3,
  incomeTotalCents: 200000,
  expenseTotalCents: 98600,
  netCents: 101400,
};
const fixtureMonth = items[0]!.occurredOn.slice(0, 7);

let wrapper: VueWrapper | null = null;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  mockedCachedGet.mockImplementation((path: string, params?: { kind?: string }) => {
    if (path === '/api/transactions') return Promise.resolve(list);
    if (path === '/api/accounts') return Promise.resolve(accounts);
    if (path === '/api/members') return Promise.resolve(members);
    if (path === '/api/categories') {
      return Promise.resolve(categories.filter(({ kind }) => kind === params?.kind));
    }
    return Promise.resolve(undefined);
  });
  mockedApiDelete.mockResolvedValue(undefined);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('AccountingPage', () => {
  it('labels retained rows and totals after a month failure and retries the selected first page', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 15));
    const original = mockedCachedGet.getMockImplementation()!;
    let fail = false;
    mockedCachedGet.mockImplementation((path: string, params?: Record<string, unknown>) => {
      if (path !== '/api/transactions') return original(path, params);
      if (fail) return Promise.reject(new Error('八月加载失败'));
      return Promise.resolve({ ...list, total: 40 });
    });
    wrapper = mount(AccountingPage, { attachTo: document.body });
    await flushPromises();
    fail = true;
    await wrapper.get('[aria-label="上一月"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-retained-query]').text()).toContain('2026年9月');
    expect(wrapper.get('.summary-strip__primary dt').text()).toContain('9月');
    expect(wrapper.find('.accounting__more').exists()).toBe(false);
    expect(wrapper.get('[data-mobile-transaction="1"]').text()).toContain('家庭晚餐');
    fail = false;
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-retained-query]').exists()).toBe(false);
    expect(mockedCachedGet).toHaveBeenLastCalledWith('/api/transactions',
      expect.objectContaining({ month: '2026-08', page: 1 }), { force: true });
  });

  it('offers a reference-only retry without hiding the ledger or successful filter options', async () => {
    const original = mockedCachedGet.getMockImplementation()!;
    mockedCachedGet.mockImplementation((path: string, params?: Record<string, unknown>) =>
      path === '/api/categories' ? Promise.reject(new Error('分类不可用')) : original(path, params),
    );
    wrapper = mount(AccountingPage, { attachTo: document.body });
    await flushPromises();
    expect(wrapper.find('[data-mobile-transaction="1"]').exists()).toBe(true);
    await wrapper.get('[aria-label="更多筛选"]').trigger('click');
    expect(wrapper.get('[aria-label="筛选账户"]').text()).toContain('微信');
    expect(wrapper.get('[data-reference-status]').text()).toContain('分类不可用');
    mockedCachedGet.mockImplementation(original);
    mockedCachedGet.mockClear();
    await wrapper.get('[data-reference-status] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-reference-status]').exists()).toBe(false);
    expect(mockedCachedGet.mock.calls.map(([path]) => path)).toEqual([
      '/api/accounts', '/api/members', '/api/categories', '/api/categories',
    ]);
  });

  it('keeps deletion pending, blocks dismissal and duplicate requests, then shows a retryable error', async () => {
    let reject!: (error: Error) => void;
    mockedApiDelete.mockImplementationOnce(() => new Promise((_, rejectPromise) => { reject = rejectPromise; }));
    wrapper = mount(AccountingPage, { attachTo: document.body });
    await flushPromises();
    await wrapper.get('[data-mobile-transaction="1"]').trigger('click');
    document.querySelector<HTMLButtonElement>('.sheet .btn--danger')!.click();
    await flushPromises();
    const confirm = document.querySelector<HTMLButtonElement>('.dialog .btn--danger')!;
    confirm.click();
    confirm.click();
    await flushPromises();
    expect(mockedApiDelete).toHaveBeenCalledTimes(1);
    expect(confirm.disabled).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    document.querySelector<HTMLElement>('.overlay--center')!.click();
    document.querySelector<HTMLButtonElement>('.dialog .btn')!.click();
    await flushPromises();
    expect(document.querySelector('.dialog')).not.toBeNull();
    reject(new Error('删除失败，请重试'));
    await flushPromises();
    expect(document.querySelector('.dialog [role="alert"]')?.textContent).toContain('删除失败');
    expect(wrapper.find('[data-mobile-transaction="1"]').exists()).toBe(true);
    confirm.click();
    await flushPromises();
    expect(mockedApiDelete.mock.calls).toEqual([['/api/transactions/1'], ['/api/transactions/1']]);
    expect(document.querySelector('.dialog')).toBeNull();
  });

  it('renders the fixture month in the ledger title', async () => {
    const [year, monthNumber] = fixtureMonth.split('-').map(Number);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(year!, monthNumber! - 1, 15));

    wrapper = mount(AccountingPage, { attachTo: document.body });
    await flushPromises();

    expect(wrapper.get('h1').text()).toBe(`${monthNumber}月账本`);
  });

  it('renders the month picker inside the page header action', async () => {
    wrapper = mount(AccountingPage, { attachTo: document.body });
    await flushPromises();

    expect(
      wrapper.get('.page-header__action').find('[aria-label="选择月份"]').exists(),
    ).toBe(true);
  });

  it('renders compact mobile rows with category icons and signed amounts', async () => {
    wrapper = mount(AccountingPage, { attachTo: document.body });
    await flushPromises();

    const row = wrapper.get('[data-mobile-transaction="1"]');
    expect(row.classes()).toContain('transaction-mobile-row');
    expect(row.find('svg').exists()).toBe(true);
    expect(row.text()).toContain('- ¥186.00');
    expect(wrapper.get('[data-desktop-transaction="1"]').text()).toContain('家庭晚餐');
    expect(wrapper.find('.transaction-table button').exists()).toBe(false);
    expect(wrapper.find('.desktop-only > .transaction-table-wrap').exists()).toBe(true);
    expect(wrapper.find('.mobile-only > .transaction-mobile-list').exists()).toBe(true);
  });

  it('renders transfer markers with a neutral financial tone', async () => {
    wrapper = mount(AccountingPage, { attachTo: document.body });
    await flushPromises();

    const transferIcon = wrapper.get('[data-mobile-transaction="3"] .transaction-mobile-row__icon');
    expect(transferIcon.attributes('data-financial-tone')).toBe('neutral');
  });

  it('opens row details while keeping repayment edit and deletion protected', async () => {
    wrapper = mount(AccountingPage, { attachTo: document.body });
    await flushPromises();

    await wrapper.get('[data-mobile-transaction="2"]').trigger('click');
    await flushPromises();
    const sheet = document.querySelector('.sheet');
    expect(sheet?.textContent).toContain('这笔由还款自动生成');
    expect(sheet?.querySelector('.detail__actions')).toBeNull();
    expect(
      Array.from(sheet?.querySelectorAll('button') ?? []).some(
        (candidate) => candidate.textContent?.trim() === '删除',
      ),
    ).toBe(false);
  });

  it('exposes both the desktop action and mobile FAB for creating a transaction', async () => {
    wrapper = mount(AccountingPage, { attachTo: document.body });
    await flushPromises();

    expect(wrapper.get('.desktop-create').text()).toBe('记一笔');
    expect(wrapper.get('button.fab').attributes('aria-label')).toBe('记一笔');
    await wrapper.get('.desktop-create').trigger('click');
    await flushPromises();
    expect(document.querySelector('.sheet')?.textContent).toContain('记一笔');
  });

  it('gives every rendered type and more-filter button a 44px minimum target', async () => {
    wrapper = mount(AccountingPage, { attachTo: document.body });
    await flushPromises();
    const style = document.createElement('style');
    style.textContent = parse(accountingPageSource).descriptor.styles[0]?.content ?? '';
    document.head.append(style);
    try {
      const controls = wrapper.findAll<HTMLButtonElement>('.filterbar button');
      expect(controls).toHaveLength(5);
      for (const control of controls) {
        const computed = getComputedStyle(control.element);
        expect(parseFloat(computed.minWidth || computed.width)).toBeGreaterThanOrEqual(44);
        expect(parseFloat(computed.minHeight || computed.height)).toBeGreaterThanOrEqual(44);
      }
    } finally {
      style.remove();
    }
  });

  it('performs one forced transaction refresh after save invalidation', async () => {
    wrapper = mount(AccountingPage, { attachTo: document.body });
    await flushPromises();
    await wrapper.get('.desktop-create').trigger('click');
    await flushPromises();
    mockedCachedGet.mockClear();

    publishResources(['transactions']);
    wrapper.getComponent(TransactionForm).vm.$emit('saved');
    await flushPromises();

    expect(
      mockedCachedGet.mock.calls.filter(
        ([path, , options]) => path === '/api/transactions' && options?.force === true,
      ),
    ).toHaveLength(1);
  });

  it('performs one forced transaction refresh after delete invalidation', async () => {
    mockedApiDelete.mockImplementationOnce(async () => {
      publishResources(['transactions']);
    });
    wrapper = mount(AccountingPage, { attachTo: document.body });
    await flushPromises();
    await wrapper.get('[data-mobile-transaction="1"]').trigger('click');
    await flushPromises();
    const detailButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.sheet .detail__actions button'));
    detailButtons.find((button) => button.textContent?.trim() === '删除')?.click();
    await flushPromises();
    mockedCachedGet.mockClear();

    const confirm = Array.from(document.querySelectorAll<HTMLButtonElement>('.dialog button'))
      .find((button) => button.textContent?.trim() === '删除');
    confirm?.click();
    await flushPromises();

    expect(
      mockedCachedGet.mock.calls.filter(
        ([path, , options]) => path === '/api/transactions' && options?.force === true,
      ),
    ).toHaveLength(1);
  });
});
