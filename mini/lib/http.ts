import type { MiniRequestSuccessResult, RequestOptions } from '../types/api';
import { currentLedgerStore } from './currentLedger';
import { getMiniConfig } from './env';
import { ApiError } from './errors';
import { sessionStore } from './session';

function errorFromResponse(status: number, data: unknown): ApiError {
  const body = data !== null && typeof data === 'object' ? data : null;
  const value = body && 'error' in body ? body.error : null;
  const error = value !== null && typeof value === 'object' ? value as {
    code?: unknown;
    message?: unknown;
  } : {};
  const code = typeof error.code === 'string' && error.code.length > 0 ? error.code : 'UNKNOWN';
  const message = typeof error.message === 'string' && error.message.length > 0
    ? error.message
    : '请求失败';
  return new ApiError(status, code, message);
}

function cookieFromResponse(result: MiniRequestSuccessResult): string | null {
  const header = result.header ?? {};
  const raw = header['Set-Cookie'] ?? header['set-cookie'];
  const values: string[] = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const cookie = values
    .flatMap((value) => value.split(','))
    .map((value) => {
      const separator = value.indexOf(';');
      return (separator < 0 ? value : value.slice(0, separator)).trim();
    })
    .find((value) => value.startsWith('ledger_session=') && value.length > 'ledger_session='.length);
  return cookie ?? null;
}

export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const session = sessionStore.get();
  const ledger = currentLedgerStore.get();
  const header = {
    'Content-Type': 'application/json',
    ...(session?.cookie ? { Cookie: session.cookie } : {}),
    ...(ledger ? { 'X-Ledger-Id': String(ledger.id) } : {}),
    ...options.header,
  };

  return new Promise<T>((resolve, reject) => {
    wx.request({
      url: `${getMiniConfig().apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`,
      method: options.method ?? 'GET',
      data: options.data === undefined ? undefined : JSON.stringify(options.data),
      header,
      success: (result: MiniRequestSuccessResult) => {
        if (result.statusCode >= 200 && result.statusCode < 300) {
          const cookie = cookieFromResponse(result);
          if (cookie) sessionStore.set({ cookie });
          resolve(result.data as T);
          return;
        }

        const error = errorFromResponse(result.statusCode, result.data);
        if (result.statusCode === 401) {
          sessionStore.clear();
          wx.redirectTo({ url: '/pages/auth/index' });
        } else if (result.statusCode === 403 && error.code === 'LEDGER_MEMBERSHIP_REQUIRED') {
          currentLedgerStore.clear();
          wx.redirectTo({ url: '/pages/ledger/list' });
        }
        reject(error);
      },
      fail: reject,
    });
  });
}
