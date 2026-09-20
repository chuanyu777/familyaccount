import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { cachedGet } from '../../lib/api';
import { publishResources } from '../../lib/resourceInvalidation';
import { useAssets } from './useAssets';

vi.mock('../../lib/api', () => ({ cachedGet: vi.fn() }));
const mockedCachedGet = vi.mocked(cachedGet);
let wrapper: VueWrapper | undefined;

function setup() {
  let state!: ReturnType<typeof useAssets>;
  wrapper = mount(defineComponent({
    setup() {
      state = useAssets();
      return () => h('div');
    },
  }));
  return state;
}

beforeEach(() => {
  mockedCachedGet.mockReset();
  mockedCachedGet.mockImplementation(async (path) => {
    if (path === '/api/stats/summary') return { netWorthCents: 100 };
    return [];
  });
});
afterEach(() => { wrapper?.unmount(); });

describe('useAssets', () => {
  it('reloads assets and statistics but not members after an asset update', async () => {
    const state = setup();
    await state.load();
    mockedCachedGet.mockClear();
    publishResources(['assets', 'statistics']);
    await nextTick();
    await flushPromises();
    expect(mockedCachedGet).toHaveBeenCalledWith('/api/assets', undefined, { force: true });
    expect(mockedCachedGet).toHaveBeenCalledWith('/api/stats/summary', undefined, { force: true });
    expect(mockedCachedGet).not.toHaveBeenCalledWith('/api/members', undefined, { force: true });
    expect(mockedCachedGet).not.toHaveBeenCalledWith('/api/accounts', undefined, { force: true });
  });

  it('keeps snapshot history tied to the most recently selected asset', async () => {
    const state = setup();
    let resolveFirst!: (value: unknown) => void;
    mockedCachedGet.mockImplementation((path) => {
      if (path === '/api/assets/1/snapshots') return new Promise((resolve) => { resolveFirst = resolve; });
      if (path === '/api/assets/2/snapshots') return Promise.resolve([{ id: 22 }]);
      return Promise.resolve([]);
    });
    const first = state.loadSnapshots(1);
    await state.loadSnapshots(2);
    resolveFirst([{ id: 11 }]);
    await first;
    expect(state.snapshots.value).toEqual([{ id: 22 }]);
  });

  it('clears a resource error after a successful scoped refresh', async () => {
    const state = setup();
    await state.load();
    mockedCachedGet.mockRejectedValueOnce(new Error('assets offline'));
    publishResources(['assets']);
    await nextTick();
    await flushPromises();
    expect(state.error.value).toBe('assets offline');
    publishResources(['assets']);
    await nextTick();
    await flushPromises();
    expect(state.error.value).toBeNull();
  });
});
