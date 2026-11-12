import type { LedgerSummary } from '../types/domain';

const STORAGE_KEY = 'family-ledger.current-ledger';

export const currentLedgerStore = {
  get(): LedgerSummary | null {
    // 同 session：微信未命中时返回空字符串，统一归一为 null。
    const value = wx.getStorageSync(STORAGE_KEY) as LedgerSummary | string | undefined | null;
    if (!value || typeof value !== 'object') return null;
    return value as LedgerSummary;
  },

  set(ledger: LedgerSummary): void {
    wx.setStorageSync(STORAGE_KEY, ledger);
  },

  clear(): void {
    wx.removeStorageSync(STORAGE_KEY);
  },
};
