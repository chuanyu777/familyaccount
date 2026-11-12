import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireLogin } from './requireLogin';
import { sessionStore } from './session';

beforeEach(() => {
  vi.clearAllMocks();
  const storage = new Map<string, unknown>();
  vi.stubGlobal('wx', {
    getStorageSync: vi.fn((key: string) => storage.get(key)),
    setStorageSync: vi.fn((key: string, value: unknown) => storage.set(key, value)),
    removeStorageSync: vi.fn((key: string) => storage.delete(key)),
    showModal: vi.fn(),
    navigateTo: vi.fn(),
  });
  sessionStore.clear();
});

describe('requireLogin', () => {
  it('已登录时直接放行且不弹窗', () => {
    sessionStore.set({ cookie: 'ledger_session=signed-session' });

    expect(requireLogin()).toBe(true);
    expect(wx.showModal).not.toHaveBeenCalled();
    expect(wx.navigateTo).not.toHaveBeenCalled();
  });

  it('游客时返回 false 并弹出登录提示', () => {
    expect(requireLogin()).toBe(false);
    expect(wx.showModal).toHaveBeenCalledTimes(1);
  });

  it('游客确认后跳转登录页', () => {
    vi.mocked(wx.showModal).mockImplementation((options: any) => {
      options.success?.({ confirm: true });
    });

    requireLogin();

    expect(wx.navigateTo).toHaveBeenCalledWith({ url: '/pages/auth/index' });
  });

  it('游客选择继续逛逛时不跳转', () => {
    vi.mocked(wx.showModal).mockImplementation((options: any) => {
      options.success?.({ confirm: false });
    });

    requireLogin();

    expect(wx.navigateTo).not.toHaveBeenCalled();
  });
});
