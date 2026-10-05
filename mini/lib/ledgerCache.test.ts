import { beforeEach, describe, expect, it, vi } from 'vitest';

import { invalidateLedgerScopedCache, ledgerCacheKey, LEDGER_SCOPED_RESOURCES } from './ledgerCache';

beforeEach(() => {
  vi.stubGlobal('wx', { removeStorageSync: vi.fn() });
});

describe('ledger cache invalidation', () => {
  it('clears every ledger-scoped resource for the previous ledger', () => {
    invalidateLedgerScopedCache(9);

    expect(wx.removeStorageSync).toHaveBeenCalledTimes(LEDGER_SCOPED_RESOURCES.length);
    expect(wx.removeStorageSync).toHaveBeenCalledWith(ledgerCacheKey('transactions', 9));
    expect(wx.removeStorageSync).toHaveBeenCalledWith(ledgerCacheKey('accounts', 9));
    expect(wx.removeStorageSync).toHaveBeenCalledWith(ledgerCacheKey('assets', 9));
    expect(wx.removeStorageSync).toHaveBeenCalledWith(ledgerCacheKey('liabilities', 9));
    expect(wx.removeStorageSync).toHaveBeenCalledWith(ledgerCacheKey('repayments', 9));
    expect(wx.removeStorageSync).toHaveBeenCalledWith(ledgerCacheKey('categories', 9));
    expect(wx.removeStorageSync).toHaveBeenCalledWith(ledgerCacheKey('members', 9));
    expect(wx.removeStorageSync).toHaveBeenCalledWith(ledgerCacheKey('statistics', 9));
  });
});
