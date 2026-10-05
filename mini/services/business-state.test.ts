import { beforeEach, describe, expect, it, vi } from 'vitest';

import { currentLedgerStore } from '../lib/currentLedger';
import { request } from '../lib/http';
import {
  createTransaction,
  canEditTransaction,
  canDeleteTransaction,
  isGeneratedRepaymentTransaction,
} from './transactions';
import { createRepayment, deleteRepayment, updateRepayment } from './liabilities';
import { activeEntries, archiveSharedResource } from './business-state';
import { createSnapshot } from './assets';

vi.mock('../lib/http', () => ({ request: vi.fn() }));
vi.mock('../lib/currentLedger', () => ({
  currentLedgerStore: { get: vi.fn(), set: vi.fn(), clear: vi.fn() },
}));

const requestMock = vi.mocked(request);
const currentLedgerStoreMock = vi.mocked(currentLedgerStore);

beforeEach(() => {
  vi.clearAllMocks();
  currentLedgerStoreMock.get.mockReturnValue({ id: 9, name: '我家', role: 'OWNER' });
});

describe('mini business state contracts', () => {
  it('builds transaction payloads without member attribution', async () => {
    requestMock.mockResolvedValueOnce({ transaction: { id: 1 }, warnings: [] });

    await createTransaction({
      type: 'expense', amount: '12.34', accountId: 3, categoryId: 4,
      occurredOn: '2026-10-05', note: '晚餐',
    });

    expect(requestMock).toHaveBeenCalledWith('/api/transactions', {
      method: 'POST',
      data: {
        type: 'expense', amount: 12.34, accountId: 3, categoryId: 4,
        occurredOn: '2026-10-05', note: '晚餐',
      },
    });
    expect(requestMock.mock.calls[0]?.[1]).not.toEqual(expect.objectContaining({ memberId: expect.anything() }));
  });

  it('uses repayment endpoints and omits member attribution from every mutation', async () => {
    requestMock.mockResolvedValue(undefined);

    await createRepayment({ liabilityId: 8, amount: '100.00', accountId: 3, occurredOn: '2026-10-05' });
    await updateRepayment(12, { liabilityId: 8, amount: '80.00', accountId: 3 });
    await deleteRepayment(12);

    expect(requestMock).toHaveBeenNthCalledWith(1, '/api/repayments', {
      method: 'POST', data: { liabilityId: 8, amount: 100, accountId: 3, occurredOn: '2026-10-05' },
    });
    expect(requestMock).toHaveBeenNthCalledWith(2, '/api/repayments/12', {
      method: 'PUT', data: { liabilityId: 8, amount: 80, accountId: 3 },
    });
    expect(requestMock).toHaveBeenNthCalledWith(3, '/api/repayments/12', { method: 'DELETE' });
    for (const [, options] of requestMock.mock.calls) {
      expect(options?.data).not.toEqual(expect.objectContaining({ memberId: expect.anything() }));
    }
  });

  it('filters archived choices while retaining historical entries', () => {
    const entries = [{ id: 1, archived: false }, { id: 2, archived: 1 }, { id: 3, archived: 0 }];

    expect(activeEntries(entries)).toEqual([{ id: 1, archived: false }, { id: 3, archived: 0 }]);
  });

  it('rejects future asset snapshot months before sending a request', async () => {
    await expect(createSnapshot(2, { month: '2099-01', value: '1.00' }))
      .rejects.toMatchObject({ code: 'FUTURE_MONTH' });
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('keeps repayment-generated transactions read-only and limits members to their own records', () => {
    expect(isGeneratedRepaymentTransaction({ id: 1, type: 'expense', sourceType: 'repayment' })).toBe(true);
    expect(canEditTransaction({ id: 1, type: 'expense', createdByUserId: 7, sourceType: 'manual' }, 8, 'MEMBER')).toBe(false);
    expect(canDeleteTransaction({ id: 1, type: 'expense', createdByUserId: 7, sourceType: 'manual' }, 7, 'MEMBER')).toBe(true);
    expect(canEditTransaction({ id: 1, type: 'expense', createdByUserId: 7, sourceType: 'manual' }, 8, 'OWNER')).toBe(true);
  });

  it('does not issue archive or restore writes for non-owner callers', async () => {
    currentLedgerStoreMock.get.mockReturnValue({ id: 9, name: '我家', role: 'MEMBER' });

    await expect(archiveSharedResource('accounts', 3)).rejects.toMatchObject({ code: 'LEDGER_OWNER_REQUIRED' });
    expect(requestMock).not.toHaveBeenCalled();
  });
});
