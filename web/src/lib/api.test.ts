import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock 整个 idbCache 模块，避免依赖真实 IndexedDB
vi.mock('./idbCache', () => ({
  idbGet: vi.fn(),
  idbSet: vi.fn(),
  idbDel: vi.fn(),
  idbClearByPrefix: vi.fn(),
}));

import {
  apiGet,
  apiPost,
  cachedGet,
  invalidate,
} from './api';
import { revision } from './revision';
import { idbGet, idbSet, idbClearByPrefix } from './idbCache';

const mockedIdbGet = vi.mocked(idbGet);
const mockedIdbSet = vi.mocked(idbSet);
const mockedClear = vi.mocked(idbClearByPrefix);

function mockFetch(json: unknown, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200;
  const res = {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    text: async () => JSON.stringify(json),
    json: async () => json,
  };
  vi.stubGlobal('fetch', vi.fn(async () => res as unknown as Response));
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedIdbGet.mockResolvedValue(undefined);
  mockedIdbSet.mockResolvedValue(undefined);
  mockedClear.mockResolvedValue(undefined);
});

describe('cachedGet 缓存命中', () => {
  it('命中缓存时立即返回缓存值且后台不请求网络', async () => {
    const cached = { id: 1, name: '我家' };
    mockedIdbGet.mockResolvedValue({ value: cached, ts: Date.now() });

    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(cached),
      json: async () => cached,
    }) as unknown as Response);
    vi.stubGlobal('fetch', fetchSpy);

    const result = await cachedGet<{ id: number; name: string }>('/api/family');

    expect(result).toEqual(cached);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockedIdbGet).toHaveBeenCalled();
  });

  it('无缓存时回退网络并把结果写入缓存', async () => {
    const data = { id: 2, name: '网络' };
    mockedIdbGet.mockResolvedValue(undefined);
    mockFetch(data);

    const result = await cachedGet<{ id: number; name: string }>('/api/family');

    expect(result).toEqual(data);
    expect(mockedIdbSet).toHaveBeenCalled();
  });
});

describe('写操作触发 invalidate', () => {
  it('apiPost 成功后清除相关缓存', async () => {
    mockFetch({ id: 1, name: '新成员' }, { status: 201 });

    await apiPost<{ id: number }>('/api/members', { name: '小明' });

    expect(mockedClear).toHaveBeenCalled();
  });

  it('invalidate 清空指定前缀', async () => {
    await invalidate('/api/transactions');
    expect(mockedClear).toHaveBeenCalledWith('/api/transactions');
  });
});

describe('apiGet 错误包装', () => {
  it('非 2xx 抛出带 code/status 的错误', async () => {
    mockFetch({ error: { code: 'NOT_FOUND', message: '没找到' } }, { status: 404, ok: false });
    await expect(apiGet('/api/unknown')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });
});

describe('写后刷新', () => {
  it('force: true 时无视缓存直接走网络', async () => {
    mockedIdbGet.mockResolvedValue({ value: { stale: true }, ts: Date.now() });
    const fresh = { stale: false };
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(fresh),
      json: async () => fresh,
    }) as unknown as Response);
    vi.stubGlobal('fetch', fetchSpy);

    const result = await cachedGet<{ stale: boolean }>('/api/assets', undefined, { force: true });

    expect(result).toEqual(fresh);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(mockedIdbGet).not.toHaveBeenCalled();
  });

  it('写操作后 revision 递增，页面据此重拉', async () => {
    const before = revision.value;
    mockFetch({ id: 1 }, { status: 201 });
    await apiPost('/api/transactions', { type: 'expense' });
    expect(revision.value).toBe(before + 1);
  });

  it('写操作后不再把飞行中的旧结果写回缓存', async () => {
    // 第一次读：缓存过期 → 后台刷新起飞（这一步会 await 到网络返回）
    mockedIdbGet.mockResolvedValue({ value: { v: 1 }, ts: Date.now() - 60_000 });
    mockFetch({ v: 1 });
    await cachedGet('/api/assets');

    // 期间发生写操作
    mockFetch({ ok: true }, { status: 201 });
    await apiPost('/api/assets', { name: 'A' });

    mockedIdbSet.mockClear();
    await Promise.resolve(); // 让上一条后台刷新的尾巴跑完
    expect(mockedIdbSet).not.toHaveBeenCalled();
  });
});
