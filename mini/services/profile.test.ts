import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '../lib/http';
import { sessionStore } from '../lib/session';
import { getProfile, updateProfile, uploadAvatar } from './profile';

vi.mock('../lib/http', () => ({ request: vi.fn() }));
const requestMock = vi.mocked(request);

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
    await expect(getProfile()).resolves.toMatchObject({ displayName: '小周', avatarUrl: 'http://127.0.0.1:3001/api/profile/7/avatar?v=1' });
    await expect(updateProfile(' 周周 ')).resolves.toMatchObject({ displayName: '周周' });
    expect(requestMock).toHaveBeenLastCalledWith('/api/profile', { method: 'PATCH', data: { displayName: '周周' } });
  });

  it('uploads the chosen temporary avatar with the current session', async () => {
    vi.mocked(wx.uploadFile).mockImplementation(({ success }: any) => {
      success?.({ statusCode: 200, data: JSON.stringify({ userId: 7, displayName: '小周', avatarUrl: '/api/profile/7/avatar?v=2' }) });
      return {} as any;
    });
    await expect(uploadAvatar('wxfile://chosen-avatar')).resolves.toMatchObject({ avatarUrl: 'http://127.0.0.1:3001/api/profile/7/avatar?v=2' });
    expect(wx.uploadFile).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://127.0.0.1:3001/api/profile/avatar', filePath: 'wxfile://chosen-avatar', name: 'file', header: { Cookie: 'ledger_session=profile-test' },
    }));
  });
});
