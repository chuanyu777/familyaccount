import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isGuest } from './guest';
import { sessionStore } from './session';

beforeEach(() => {
  const storage = new Map<string, unknown>();
  vi.stubGlobal('wx', {
    getStorageSync: vi.fn((key: string) => storage.get(key)),
    setStorageSync: vi.fn((key: string, value: unknown) => storage.set(key, value)),
    removeStorageSync: vi.fn((key: string) => storage.delete(key)),
  });
  sessionStore.clear();
});

describe('isGuest', () => {
  it('没有会话时判定为游客', () => {
    expect(isGuest()).toBe(true);
  });

  it('存在登录会话时判定为非游客', () => {
    sessionStore.set({ cookie: 'ledger_session=signed-session', userId: 7 });
    expect(isGuest()).toBe(false);
  });

  it('清除会话后重新回到游客', () => {
    sessionStore.set({ cookie: 'ledger_session=signed-session' });
    expect(isGuest()).toBe(false);
    sessionStore.clear();
    expect(isGuest()).toBe(true);
  });

  it('storage 返回空字符串时仍判定为游客（微信未命中的真实行为）', () => {
    vi.stubGlobal('wx', {
      getStorageSync: vi.fn(() => ''),
      setStorageSync: vi.fn(),
      removeStorageSync: vi.fn(),
    });

    expect(isGuest()).toBe(true);
  });
});
