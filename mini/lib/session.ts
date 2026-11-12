import type { MiniSession } from '../types/domain';

const STORAGE_KEY = 'family-ledger.session';

export const sessionStore = {
  get(): MiniSession | null {
    // 微信 getStorageSync 在 key 不存在时返回空字符串，不是 null；
    // 不归一化会让「未登录」被误判成已登录。
    const value = wx.getStorageSync(STORAGE_KEY) as MiniSession | string | undefined | null;
    if (!value || typeof value !== 'object') return null;
    return value as MiniSession;
  },

  set(session: MiniSession): void {
    wx.setStorageSync(STORAGE_KEY, session);
  },

  clear(): void {
    wx.removeStorageSync(STORAGE_KEY);
  },
};
