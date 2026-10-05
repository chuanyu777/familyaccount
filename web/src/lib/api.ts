import { idbGet, idbSet, idbClearByPrefix } from './idbCache';
import { publishResources, resourcesForMutation } from './resourceInvalidation';
import type {
  LedgerSession,
  LedgerSummary,
  MiniBindingCode,
  PlatformSession,
  SessionInfo,
  WebAuthKind,
} from '../auth/types';

// 统一 fetch 封装 + IndexedDB SWR 缓存 + 写后失效。
// 路径既可传 '/api/xxx' 也可传相对 'xxx'，统一规整为 '/api/xxx'。

const API_BASE = '/api';

/**
 * 缓存代次。写操作会把代次 +1，正在飞行的后台刷新发现代次变了就不再落盘——
 * 否则它会在缓存清空后把旧数据写回去，导致「刚删掉的东西又出现了」。
 */
let cacheEpoch = 0;
let activeLedgerId: number | null = null;
const authScopes: Record<WebAuthKind, { principalId: number | null; generation: number }> = {
  ledger: { principalId: null, generation: 0 },
  platform: { principalId: null, generation: 0 },
};
// Serialize disk writes and clears so a pending write cannot overtake logout cleanup.
let cacheIO: Promise<void> = Promise.resolve();
function queueCacheIO(action: () => Promise<void>): Promise<void> {
  cacheIO = cacheIO.then(action).catch(() => {});
  return cacheIO;
}

function kindForPath(path: string): WebAuthKind {
  return fullPath(path).startsWith('/api/platform') ? 'platform' : 'ledger';
}

function scopePrefix(kind: WebAuthKind): string | null {
  const id = authScopes[kind].principalId;
  if (id === null) return null;
  return `v2:${kind}:${id}:${kind === 'ledger' ? activeLedgerId ?? 'none' : 'none'}:`;
}

function clearPreviousScope(prefix: string | null): void {
  if (prefix) void queueCacheIO(() => idbClearByPrefix(prefix));
}

function setSessionScope(kind: WebAuthKind, principalId: number | null): void {
  const state = authScopes[kind];
  if (state.principalId === principalId) return;
  const previous = scopePrefix(kind);
  state.principalId = principalId;
  state.generation += 1;
  if (kind === 'ledger') activeLedgerId = null;
  clearPreviousScope(previous);
  // Retire URL-only entries written by older clients; never read them.
  void queueCacheIO(() => idbClearByPrefix('/api'));
}

export function setActiveLedgerId(ledgerId: number | null): void {
  if (activeLedgerId === ledgerId) return;
  const previous = scopePrefix('ledger');
  activeLedgerId = ledgerId;
  authScopes.ledger.generation += 1;
  clearPreviousScope(previous);
}

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
  authKind?: WebAuthKind,
): Promise<T> {
  const url = buildUrl(path, params);
  const kind = authKind ?? kindForPath(path);
  const generation = authScopes[kind].generation;
  const res = await fetch(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(kind === 'ledger' && activeLedgerId !== null ? { 'X-Ledger-Id': String(activeLedgerId) } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
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
    if (res.status === 401 && generation === authScopes[kind].generation) {
      setSessionScope(kind, null);
      window.dispatchEvent(new CustomEvent('web-auth-lost', { detail: { kind, code } }));
    }
    throw new ApiError(res.status, code, message);
  }

  return data as T;
}

/** 清除缓存：传入前缀只清该前缀，缺省清空全部 */
export async function invalidate(prefix = ''): Promise<void> {
  cacheEpoch += 1;
  const scope = scopePrefix(kindForPath(prefix));
  if (scope) await queueCacheIO(() => idbClearByPrefix(scope + prefix));
}

function assertScope(kind: WebAuthKind, generation: number): void {
  if (generation !== authScopes[kind].generation) {
    throw new ApiError(409, 'CACHE_SCOPE_CHANGED', '登录或账本已变更，请重新加载');
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
  const kind = kindForPath(path);
  const generation = authScopes[kind].generation;
  const epoch = cacheEpoch;
  const prefix = scopePrefix(kind);
  const key = prefix === null ? null : prefix + buildUrl(path, params);
  await cacheIO;
  assertScope(kind, generation);
  const cached = options.force || key === null ? undefined : await idbGet<CacheEntry<T>>(key);
  assertScope(kind, generation);

  async function refresh(): Promise<T> {
    const value = await rawFetch<T>('GET', path, undefined, params);
    assertScope(kind, generation);
    if (key !== null) {
      await queueCacheIO(async () => {
        if (generation === authScopes[kind].generation && epoch === cacheEpoch) {
          await idbSet(key, { value, ts: Date.now() } satisfies CacheEntry<T>);
        }
      });
    }
    assertScope(kind, generation);
    return value;
  }
  if (cached) {
    const fresh = Date.now() - cached.ts <= maxAgeMs;
    if (!fresh) {
      void refresh().catch(() => {});
    }
    return cached.value;
  }
  return refresh();
}

export function apiGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  return rawFetch<T>('GET', path, undefined, params);
}

function expectedSession(kind: WebAuthKind, value: SessionInfo): LedgerSession | PlatformSession {
  const matches = kind === 'ledger'
    ? value.type === 'LEDGER_USER' && typeof value.userId === 'number' && value.webSession === true
    : value.type === 'PLATFORM_ADMIN' && typeof value.platformAdminId === 'number';
  if (!matches) throw new ApiError(403, 'SESSION_KIND_MISMATCH', '当前登录会话不属于此入口');
  return value as LedgerSession | PlatformSession;
}

async function login<T extends LedgerSession | PlatformSession>(
  kind: WebAuthKind,
  path: string,
  username: string,
  password: string,
): Promise<T> {
  const generation = authScopes[kind].generation;
  const response = await rawFetch<Partial<T> | null>('POST', path, { username, password }, undefined, kind);
  assertScope(kind, generation);
  if (response && typeof response === 'object' && 'type' in response) {
    return adoptSession(kind, response as SessionInfo) as T;
  }
  return getSession(kind) as Promise<T>;
}

export function loginLedger(username: string, password: string): Promise<LedgerSession> {
  return login<LedgerSession>('ledger', '/api/auth/web/login', username, password);
}

export function loginPlatform(username: string, password: string): Promise<PlatformSession> {
  return login<PlatformSession>('platform', '/api/auth/platform/login', username, password);
}

export async function getSession(kind: WebAuthKind): Promise<SessionInfo> {
  const generation = authScopes[kind].generation;
  try {
    const session = await rawFetch<SessionInfo>('GET', '/api/auth/session', undefined, { kind }, kind);
    assertScope(kind, generation);
    return adoptSession(kind, session);
  } catch (error) {
    if (generation === authScopes[kind].generation) setSessionScope(kind, null);
    throw error;
  }
}

function adoptSession(kind: WebAuthKind, value: SessionInfo): LedgerSession | PlatformSession {
  const session = expectedSession(kind, value);
  setSessionScope(kind, session.type === 'LEDGER_USER' ? session.userId : session.platformAdminId);
  return session;
}

export async function getLedger(): Promise<LedgerSummary> {
  const ledgers = await cachedGet<LedgerSummary[]>('/api/ledgers', { surface: 'web' }, { force: true });
  const ledger = ledgers?.[0];
  if (!ledger) throw new ApiError(403, 'SPECIAL_LEDGER_REQUIRED', '未找到可用特殊账本');
  setActiveLedgerId(ledger.id);
  return ledger;
}

export async function logout(kind: WebAuthKind): Promise<void> {
  // Invalidate even an anonymous pending discovery before awaiting the logout request.
  authScopes[kind].generation += 1;
  setSessionScope(kind, null);
  try {
    await rawFetch<void>('POST', `/api/auth/logout?kind=${kind}`, undefined, undefined, kind);
  } finally {
    await cacheIO;
  }
}

export async function createMiniBindingCode(): Promise<MiniBindingCode> {
  const result = await rawFetch<MiniBindingCode>(
    'POST',
    '/api/auth/binding-code',
    undefined,
    undefined,
    'ledger',
  );
  return {
    code: result.code,
    expiresAt: result.expiresAt,
  };
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
