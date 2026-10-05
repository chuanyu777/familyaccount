import type { LedgerSummary } from '../types/domain';

const STORAGE_KEY = 'family-ledger.current-ledger';

export const currentLedgerStore = {
  get(): LedgerSummary | null {
    return (wx.getStorageSync(STORAGE_KEY) as LedgerSummary | undefined) ?? null;
  },

  set(ledger: LedgerSummary): void {
    wx.setStorageSync(STORAGE_KEY, ledger);
  },

  clear(): void {
    wx.removeStorageSync(STORAGE_KEY);
  },
};
