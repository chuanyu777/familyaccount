import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MINI_CONFIG } from '../lib/env';
import { request } from '../lib/http';
import { sessionStore } from '../lib/session';
import { getProfile, updateProfile, uploadAvatar } from './profile';

vi.mock('../lib/http', () => ({ request: vi.fn() }));
const requestMock = vi.mocked(request);

// 头像 URL 由当前环境的 apiBaseUrl 拼出。从配置取值，环境切换时测试不会失效
// （本地 Docker 的 web 容器对外是 80，后端 3001 并未映射到宿主机）。
const BASE = MINI_CONFIG.apiBaseUrl;

beforeEach(() => {
  vi.clearAllMocks();
  const storage = new Map<string, unknown>();
  vi.stubGlobal('wx', {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    uploadFile: vi.fn(),
  });
  sessionStore.set({ cookie: 'ledger_session=profile-test', userId: 7 });
});

describe('profile service', () => {
  it('loads and updates the nickname with an absolute avatar URL', async () => {
    requestMock
      .mockResolvedValueOnce({ userId: 7, displayName: '小周', avatarUrl: '/api/profile/7/avatar?v=1' })
      .mockResolvedValueOnce({ userId: 7, displayName: '周周', avatarUrl: null });
    await expect(getProfile()).resolves.toMatchObject({ displayName: '小周', avatarUrl: `${BASE}/api/profile/7/avatar?v=1` });
    await expect(updateProfile(' 周周 ')).resolves.toMatchObject({ displayName: '周周' });
    expect(requestMock).toHaveBeenLastCalledWith('/api/profile', { method: 'PATCH', data: { displayName: '周周' } });
  });

  it('uploads the chosen temporary avatar with the current session', async () => {
    vi.mocked(wx.uploadFile).mockImplementation(({ success }: any) => {
      success?.({ statusCode: 200, data: JSON.stringify({ userId: 7, displayName: '小周', avatarUrl: '/api/profile/7/avatar?v=2' }) });
      return {} as any;
    });
    await expect(uploadAvatar('wxfile://chosen-avatar')).resolves.toMatchObject({ avatarUrl: `${BASE}/api/profile/7/avatar?v=2` });
    expect(wx.uploadFile).toHaveBeenCalledWith(expect.objectContaining({
      url: `${BASE}/api/profile/avatar`, filePath: 'wxfile://chosen-avatar', name: 'file', header: { Cookie: 'ledger_session=profile-test' },
    }));
  });
});
