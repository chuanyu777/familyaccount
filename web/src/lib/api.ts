import { idbGet, idbSet, idbClearByPrefix } from './idbCache';
import { publishResources, resourcesForMutation } from './resourceInvalidation';

// 统一 fetch 封装 + IndexedDB SWR 缓存 + 写后失效。
// 路径既可传 '/api/xxx' 也可传相对 'xxx'，统一规整为 '/api/xxx'。

const API_BASE = '/api';

/**
 * 缓存代次。写操作会把代次 +1，正在飞行的后台刷新发现代次变了就不再落盘——
 * 否则它会在缓存清空后把旧数据写回去，导致「刚删掉的东西又出现了」。
 */
let cacheEpoch = 0;

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface CacheEntry<T> {
  value: T;
  ts: number;
}

function fullPath(path: string): string {
  if (path.startsWith('/api')) return path;
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

function buildUrl(path: string, params?: Record<string, unknown>): string {
  const base = fullPath(path);
  if (!params) return base;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

async function rawFetch<T>(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, unknown>,
): Promise<T> {
  const url = buildUrl(path, params);
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const errBody = (data ?? {}) as { error?: { code?: string; message?: string } };
    const code = errBody.error?.code ?? 'UNKNOWN';
    const message = errBody.error?.message ?? res.statusText ?? '请求失败';
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent('family-access-lost'));
    }
    throw new ApiError(res.status, code, message);
  }

  return data as T;
}

/** 清除缓存：传入前缀只清该前缀，缺省清空全部 */
export async function invalidate(prefix = ''): Promise<void> {
  cacheEpoch += 1;
  await idbClearByPrefix(prefix);
}

async function networkAndCache<T>(key: string, path: string, params?: Record<string, unknown>): Promise<T> {
  const value = await rawFetch<T>('GET', path, undefined, params);
  void idbSet(key, { value, ts: Date.now() } satisfies CacheEntry<T>).catch(() => {});
  return value;
}

async function backgroundRefresh<T>(key: string, path: string, params?: Record<string, unknown>): Promise<void> {
  const epoch = cacheEpoch;
  try {
    const value = await rawFetch<T>('GET', path, undefined, params);
    // 期间发生过写操作 → 这次结果已经是旧世界的，丢掉别写回缓存
    if (epoch !== cacheEpoch) return;
    await idbSet(key, { value, ts: Date.now() } satisfies CacheEntry<T>);
  } catch {
    // 后台刷新失败不影响已返回的缓存
  }
}

export interface CacheOptions {
  /** 缓存新鲜期，默认 5 秒 */
  maxAgeMs?: number;
  /** 强制走网络（写操作后刷新用它，避免读到刚被清掉又写回的旧值） */
  force?: boolean;
}

/** SWR 读：命中缓存立即返回并（过期时）后台刷新；无缓存回退网络 */
export async function cachedGet<T>(
  path: string,
  params?: Record<string, unknown>,
  options: CacheOptions = {},
): Promise<T> {
  const maxAgeMs = options.maxAgeMs ?? 5000;
  const key = buildUrl(path, params);
  const cached = options.force ? undefined : await idbGet<CacheEntry<T>>(key);
  if (cached) {
    const fresh = Date.now() - cached.ts <= maxAgeMs;
    if (!fresh) {
      void backgroundRefresh<T>(key, path, params);
    }
    return cached.value;
  }
  return networkAndCache<T>(key, path, params);
}

export function apiGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  return rawFetch<T>('GET', path, undefined, params);
}

/** 写操作收尾：清除相关缓存 + 通知依赖对应资源的页面重新拉取。 */
async function afterWrite(path: string, method: string): Promise<void> {
  const resources = resourcesForMutation(fullPath(path), method);
  const prefixes = resources.map((resource) => `/api/${resource === 'statistics' ? 'stats' : resource}`);
  await Promise.all(prefixes.map((prefix) => invalidate(prefix)));
  publishResources(resources);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await rawFetch<T>('POST', path, body);
  await afterWrite(path, 'POST');
  return r;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const r = await rawFetch<T>('PATCH', path, body);
  await afterWrite(path, 'PATCH');
  return r;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const r = await rawFetch<T>('PUT', path, body);
  await afterWrite(path, 'PUT');
  return r;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const r = await rawFetch<T>('DELETE', path);
  await afterWrite(path, 'DELETE');
  return r;
}
