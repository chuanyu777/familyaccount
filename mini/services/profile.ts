import { getMiniConfig } from '../lib/env';
import { ApiError } from '../lib/errors';
import { sessionStore } from '../lib/session';
import { request } from '../lib/http';

export interface UserProfile {
  userId: number;
  displayName: string;
  avatarUrl: string | null;
}

function withAbsoluteAvatar(profile: UserProfile): UserProfile {
  return {
    ...profile,
    avatarUrl: profile.avatarUrl
      ? `${getMiniConfig().apiBaseUrl}${profile.avatarUrl.startsWith('/') ? profile.avatarUrl : `/${profile.avatarUrl}`}`
      : null,
  };
}

export async function getProfile(): Promise<UserProfile> {
  return withAbsoluteAvatar(await request<UserProfile>('/api/profile'));
}

export async function updateProfile(displayName: string): Promise<UserProfile> {
  return withAbsoluteAvatar(await request<UserProfile>('/api/profile', {
    method: 'PATCH',
    data: { displayName: displayName.trim() },
  }));
}

export function uploadAvatar(filePath: string): Promise<UserProfile> {
  const session = sessionStore.get();
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${getMiniConfig().apiBaseUrl}/api/profile/avatar`,
      filePath,
      name: 'file',
      header: session?.cookie ? { Cookie: session.cookie } : {},
      success: (result) => {
        let body: unknown;
        try { body = JSON.parse(result.data); } catch { body = null; }
        if (result.statusCode >= 200 && result.statusCode < 300 && body && typeof body === 'object') {
          resolve(withAbsoluteAvatar(body as UserProfile));
          return;
        }
        const error = body && typeof body === 'object' && 'error' in body
          ? (body as { error?: { code?: string; message?: string } }).error
          : null;
        reject(new ApiError(result.statusCode, error?.code ?? 'AVATAR_UPLOAD_FAILED', error?.message ?? '头像上传失败'));
      },
      fail: reject,
    });
  });
}
