import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { cachedGet } from '../../lib/api';
import { publishResources } from '../../lib/resourceInvalidation';
import { useLiabilities } from './useLiabilities';
import type { Account, Liability, Member, Repayment, Summary } from './types';

vi.mock('../../lib/api', () => ({
  cachedGet: vi.fn(),
}));

const mockedCachedGet = vi.mocked(cachedGet) as unknown as Mock;

const summary: Summary = {
  totalAssetsCents: 0,
  totalLiabilitiesCents: 20000000,
  netWorthCents: -20000000,
  monthlyPaymentTotalCents: 300000,
  accountsTotalCents: 0,
  assetsTotalCents: 0,
};
const liabilities: Liability[] = [
  { id: 1, name: '房贷', remaining: '200000.00', monthlyPayment: '3000.00', payment_day: 5, member_id: 1 },
  { id: 2, name: '车贷', remaining: '50000.00', monthlyPayment: '1000.00', payment_day: 10, member_id: 1 },
];
const accounts: Account[] = [
  { id: 1, name: '现金', balance: '1000.00', balance_cents: 100000, is_default: true },
];
const members: Member[] = [{ id: 1, name: '我' }];
const repayments: Repayment[] = [
  { id: 1, liability_id: 1, amount_cents: 300000, occurred_on: '2026-09-10', account_id: 1 },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function defaultResponse(path: string, params?: Record<string, unknown>) {
  if (path === '/api/stats/summary') return Promise.resolve(summary);
  if (path === '/api/liabilities') return Promise.resolve(liabilities);
  if (path === '/api/accounts') return Promise.resolve(accounts);
  if (path === '/api/members') return Promise.resolve(members);
  if (path === '/api/repayments') {
    return Promise.resolve(params?.liabilityId === 1 ? repayments : []);
  }
  return Promise.resolve(undefined);
}

type LiabilitiesState = ReturnType<typeof useLiabilities>;
let wrapper: VueWrapper | null = null;
let state!: LiabilitiesState;

function mountComposable() {
  wrapper = mount(defineComponent({
    setup() {
      state = useLiabilities();
      return () => h('div');
    },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedCachedGet.mockImplementation(defaultResponse);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('useLiabilities', () => {
  it('loads repayment history only after a liability is selected', async () => {
    mountComposable();
    await flushPromises();

    expect(mockedCachedGet.mock.calls.some(([path]) => path === '/api/repayments')).toBe(false);

    await state.loadRepayments(1);
    expect(mockedCachedGet).toHaveBeenLastCalledWith(
      '/api/repayments',
      { liabilityId: 1 },
      { force: false },
    );
    expect(state.repayments.value).toEqual(repayments);
  });

  it('keeps repayment history tied to the most recently selected liability', async () => {
    const first = deferred<Repayment[]>();
    mockedCachedGet.mockImplementation((path: string, params?: Record<string, unknown>) => {
      if (path === '/api/repayments' && params?.liabilityId === 1) return first.promise;
      if (path === '/api/repayments' && params?.liabilityId === 2) {
        return Promise.resolve([{ ...repayments[0], id: 2, liability_id: 2 }]);
      }
      return defaultResponse(path, params);
    });
    mountComposable();
    await flushPromises();

    const oldLoad = state.loadRepayments(1);
    await state.loadRepayments(2);
    first.resolve(repayments);
    await oldLoad;

    expect(state.selectedLiabilityId.value).toBe(2);
    expect(state.repayments.value.map(({ liability_id }) => liability_id)).toEqual([2]);
  });

  it('rejects an older liability response after a newer reload', async () => {
    const first = deferred<Liability[]>();
    let liabilityReads = 0;
    mockedCachedGet.mockImplementation((path: string, params?: Record<string, unknown>) => {
      if (path === '/api/liabilities') {
        liabilityReads += 1;
        return liabilityReads === 1
          ? first.promise
          : Promise.resolve([{ ...liabilities[1], name: '最新车贷' }]);
      }
      return defaultResponse(path, params);
    });
    mountComposable();
    await state.reloadLiabilities();
    first.resolve(liabilities);
    await flushPromises();

    expect(state.liabilities.value.map(({ name }) => name)).toEqual(['最新车贷']);
  });

  it('reloads only the invalidated resource', async () => {
    mountComposable();
    await flushPromises();
    mockedCachedGet.mockClear();

    publishResources(['accounts']);
    await nextTick();
    await flushPromises();

    expect(mockedCachedGet.mock.calls.map(([path]) => path)).toEqual(['/api/accounts']);
    expect(mockedCachedGet).toHaveBeenCalledWith('/api/accounts', undefined, { force: true });
  });

  it('reloads selected repayment history when repayments change', async () => {
    mountComposable();
    await flushPromises();
    await state.loadRepayments(1);
    mockedCachedGet.mockClear();

    publishResources(['repayments']);
    await nextTick();
    await flushPromises();

    expect(mockedCachedGet.mock.calls.map(([path]) => path)).toEqual(['/api/repayments']);
    expect(mockedCachedGet).toHaveBeenCalledWith(
      '/api/repayments',
      { liabilityId: 1 },
      { force: true },
    );
  });
});
