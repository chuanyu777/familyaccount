import type { MiniRequestSuccessResult, RequestOptions } from '../types/api';
import { currentLedgerStore } from './currentLedger';
import { API_BASE_URL } from './env';
import { ApiError } from './errors';
import { sessionStore } from './session';

function errorFromResponse(status: number, data: unknown): ApiError {
  const error = data && typeof data === 'object' && 'error' in data
    ? (data.error as { code?: string; message?: string })
    : {};
  return new ApiError(status, error.code ?? 'UNKNOWN', error.message ?? '请求失败');
}

export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const session = sessionStore.get();
  const ledger = currentLedgerStore.get();
  const header = {
    'Content-Type': 'application/json',
    ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    ...(ledger ? { 'X-Ledger-Id': String(ledger.id) } : {}),
    ...options.header,
  };

  return new Promise<T>((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`,
      method: options.method ?? 'GET',
      data: options.data === undefined ? undefined : JSON.stringify(options.data),
      header,
      success: (result: MiniRequestSuccessResult) => {
        if (result.statusCode >= 200 && result.statusCode < 300) {
          resolve(result.data as T);
          return;
        }

        const error = errorFromResponse(result.statusCode, result.data);
        if (result.statusCode === 401) {
          sessionStore.clear();
          wx.redirectTo({ url: '/pages/auth/index' });
        } else if (result.statusCode === 403) {
          currentLedgerStore.clear();
          wx.redirectTo({ url: '/pages/ledger/list' });
        }
        reject(error);
      },
      fail: reject,
    });
  });
}
