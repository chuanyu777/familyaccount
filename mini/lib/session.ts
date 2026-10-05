import type { MiniSession } from '../types/domain';

const STORAGE_KEY = 'family-ledger.session';

export const sessionStore = {
  get(): MiniSession | null {
    return (wx.getStorageSync(STORAGE_KEY) as MiniSession | undefined) ?? null;
  },

  set(session: MiniSession): void {
    wx.setStorageSync(STORAGE_KEY, session);
  },

  clear(): void {
    wx.removeStorageSync(STORAGE_KEY);
  },
};
