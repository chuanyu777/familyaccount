import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { cachedGet } from '../../lib/api';
import { publishResources } from '../../lib/resourceInvalidation';
import { useTransactions } from './useTransactions';
import type { Account, Category, Member, Transaction, TransactionsResponse } from './types';

vi.mock('../../lib/api', () => ({
  cachedGet: vi.fn(),
}));

const mockedCachedGet = vi.mocked(cachedGet) as unknown as Mock;

const accounts: Account[] = [
  { id: 1, name: '微信', balance: 0, balance_cents: 0, is_default: true },
];
const members: Member[] = [{ id: 1, name: '我' }];
const expenseCategories: Category[] = [{ id: 1, kind: 'expense', name: '餐饮' }];
const incomeCategories: Category[] = [{ id: 2, kind: 'income', name: '工资' }];

function transaction(id: number, amountCents = 18600): Transaction {
  return {
    id,
    type: 'expense',
    amount: amountCents / 100,
    amountCents,
    occurredOn: '2026-09-18',
    accountId: 1,
    accountName: '微信',
    categoryId: 1,
    categoryName: '餐饮',
    memberId: 1,
    memberName: '我',
    sourceType: 'manual',
  };
}

function response(items: Transaction[], total = items.length): TransactionsResponse {
  return {
    items,
    page: 1,
    pageSize: 20,
    total,
    incomeTotalCents: 20000,
    expenseTotalCents: 18600,
    netCents: 1400,
  };
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

function referenceResult(path: string) {
  if (path === '/api/accounts') return Promise.resolve(accounts);
  if (path === '/api/members') return Promise.resolve(members);
  if (path === '/api/categories') return Promise.resolve(undefined);
  return undefined;
}

type TransactionsState = ReturnType<typeof useTransactions>;
let wrapper: VueWrapper | null = null;
let state!: TransactionsState;

function mountComposable() {
  wrapper = mount(
    defineComponent({
      setup() {
        state = useTransactions();
        return () => h('div');
      },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('useTransactions', () => {
  it('applies only the latest transaction response', async () => {
    const oldRequest = deferred<TransactionsResponse>();
    mockedCachedGet.mockImplementation((path: string) => {
      const refs = referenceResult(path);
      if (refs) return refs;
      if (path === '/api/categories') {
        const kindCall = mockedCachedGet.mock.calls.at(-1)?.[1] as { kind?: string } | undefined;
        return Promise.resolve(kindCall?.kind === 'income' ? incomeCategories : expenseCategories);
      }
      if (path === '/api/transactions') {
        const transactionCalls = mockedCachedGet.mock.calls.filter(([calledPath]) => calledPath === path);
        return transactionCalls.length === 1
          ? oldRequest.promise
          : Promise.resolve(response([transaction(2, 4200)]));
      }
      return Promise.resolve(undefined);
    });

    mountComposable();
    state.month.value = '2026-08';
    await nextTick();
    await flushPromises();
    expect(state.items.value.map(({ id }) => id)).toEqual([2]);

    oldRequest.resolve(response([transaction(1)]));
    await flushPromises();
    expect(state.items.value.map(({ id }) => id)).toEqual([2]);
  });

  it('preserves rows while a forced refresh is in flight', async () => {
    const refresh = deferred<TransactionsResponse>();
    let transactionCalls = 0;
    mockedCachedGet.mockImplementation((path: string, params?: { kind?: string }) => {
      if (path === '/api/transactions') {
        transactionCalls += 1;
        return transactionCalls === 1 ? Promise.resolve(response([transaction(1)])) : refresh.promise;
      }
      if (path === '/api/accounts') return Promise.resolve(accounts);
      if (path === '/api/members') return Promise.resolve(members);
      if (path === '/api/categories') {
        return Promise.resolve(params?.kind === 'income' ? incomeCategories : expenseCategories);
      }
      return Promise.resolve(undefined);
    });

    mountComposable();
    await flushPromises();

    const reload = state.reload();
    expect(state.refreshing.value).toBe(true);
    expect(state.loading.value).toBe(false);
    expect(state.items.value.map(({ id }) => id)).toEqual([1]);

    refresh.resolve(response([transaction(3)]));
    await reload;
    expect(state.refreshing.value).toBe(false);
    expect(state.items.value.map(({ id }) => id)).toEqual([3]);
  });

  it('keeps all filters and appends the next page', async () => {
    mockedCachedGet.mockImplementation((path: string, params?: Record<string, unknown>) => {
      if (path === '/api/transactions') {
        return Promise.resolve(response([transaction(Number(params?.page))], 40));
      }
      if (path === '/api/accounts') return Promise.resolve(accounts);
      if (path === '/api/members') return Promise.resolve(members);
      if (path === '/api/categories') {
        return Promise.resolve(params?.kind === 'income' ? incomeCategories : expenseCategories);
      }
      return Promise.resolve(undefined);
    });

    mountComposable();
    await flushPromises();
    state.type.value = 'expense';
    state.accountFilter.value = '1';
    state.memberFilter.value = '1';
    await nextTick();
    await flushPromises();

    await state.loadMore();
    const listCalls = mockedCachedGet.mock.calls.filter(([path]) => path === '/api/transactions');
    expect(listCalls.at(-1)).toEqual([
      '/api/transactions',
      {
        month: state.month.value,
        page: 2,
        pageSize: 20,
        type: 'expense',
        accountId: 1,
        memberId: 1,
      },
      { force: undefined },
    ]);
    expect(state.items.value.map(({ id }) => id)).toEqual([1, 2]);
    expect(state.hasMore.value).toBe(true);
  });

  it('reloads transaction and reference resources independently', async () => {
    mockedCachedGet.mockImplementation((path: string, params?: { kind?: string }) => {
      if (path === '/api/transactions') return Promise.resolve(response([transaction(1)]));
      if (path === '/api/accounts') return Promise.resolve(accounts);
      if (path === '/api/members') return Promise.resolve(members);
      if (path === '/api/categories') {
        return Promise.resolve(params?.kind === 'income' ? incomeCategories : expenseCategories);
      }
      return Promise.resolve(undefined);
    });

    mountComposable();
    await flushPromises();
    mockedCachedGet.mockClear();

    publishResources(['transactions']);
    await nextTick();
    await flushPromises();
    expect(mockedCachedGet.mock.calls.map(([path]) => path)).toEqual(['/api/transactions']);
    expect(mockedCachedGet).toHaveBeenLastCalledWith(
      '/api/transactions',
      expect.any(Object),
      { force: true },
    );

    mockedCachedGet.mockClear();
    publishResources(['categories']);
    await nextTick();
    await flushPromises();
    expect(mockedCachedGet.mock.calls.map(([path]) => path)).toEqual([
      '/api/accounts',
      '/api/members',
      '/api/categories',
      '/api/categories',
    ]);
    expect(mockedCachedGet.mock.calls.every(([, , options]) => options?.force === true)).toBe(true);
  });
});
