import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { cachedGet } from '../../lib/api';
import AccountingPage from './AccountingPage.vue';
import type { Account, Category, Member, Transaction, TransactionsResponse } from './types';

vi.mock('../../lib/api', () => ({
  cachedGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

const mockedCachedGet = vi.mocked(cachedGet) as unknown as Mock;

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
];
const list: TransactionsResponse = {
  items,
  page: 1,
  pageSize: 20,
  total: 2,
  incomeTotalCents: 200000,
  expenseTotalCents: 98600,
  netCents: 101400,
};

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
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('AccountingPage', () => {
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

    expect(wrapper.get('.page-header__action button').text()).toBe('记一笔');
    expect(wrapper.get('button.fab').attributes('aria-label')).toBe('记一笔');
    await wrapper.get('.page-header__action button').trigger('click');
    await flushPromises();
    expect(document.querySelector('.sheet')?.textContent).toContain('记一笔');
  });
});
