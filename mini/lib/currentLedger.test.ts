import { beforeEach, describe, expect, it, vi } from 'vitest';

import { currentLedgerStore } from './currentLedger';

beforeEach(() => {
  vi.stubGlobal('wx', {
    removeStorageSync: vi.fn(),
    setStorageSync: vi.fn(),
    getStorageSync: vi.fn(),
  });
  currentLedgerStore.clear();
});

describe('currentLedgerStore', () => {
  it('persists the selected ledger in Mini Program storage', () => {
    const ledger = { id: 9, name: '我家', role: 'OWNER' } as const;
    currentLedgerStore.set(ledger);

    expect(wx.setStorageSync).toHaveBeenCalledWith('family-ledger.current-ledger', ledger);
  });

  it('restores persisted ledger state after app reload', () => {
    const ledger = { id: 9, name: '我家', role: 'MEMBER' } as const;
    vi.mocked(wx.getStorageSync).mockReturnValue(ledger);

    expect(currentLedgerStore.get()).toEqual(ledger);
  });

  it('clears the selected ledger after membership is denied', () => {
    currentLedgerStore.set({ id: 9, name: '我家', role: 'OWNER' });

    currentLedgerStore.clear();

    expect(currentLedgerStore.get()).toBeNull();
    expect(wx.removeStorageSync).toHaveBeenCalledWith('family-ledger.current-ledger');
  });
});
