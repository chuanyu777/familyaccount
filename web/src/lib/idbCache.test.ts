import { afterEach, expect, it, vi } from 'vitest';

function createIndexedDB(initial: Record<string, unknown>) {
  const records = new Map<string, unknown>(Object.entries(initial));

  const db = {
    objectStoreNames: { contains: () => true },
    transaction() {
      const transaction: {
        oncomplete: (() => void) | null;
        onerror: (() => void) | null;
        onabort: (() => void) | null;
        objectStore: () => unknown;
      } = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: () => store,
      };

      function cursorRequest(canDelete: boolean) {
        const keys = [...records.keys()];
        let index = 0;
        const request: {
          result: null | { key: string; delete: () => void; continue: () => void };
          onsuccess: (() => void) | null;
        } = { result: null, onsuccess: null };

        const advance = () => {
          const key = keys[index];
          if (key === undefined) {
            request.result = null;
            request.onsuccess?.();
            queueMicrotask(() => transaction.oncomplete?.());
            return;
          }
          request.result = {
            key,
            delete: () => {
              if (canDelete) records.delete(key);
            },
            continue: () => {
              index += 1;
              queueMicrotask(advance);
            },
          };
          request.onsuccess?.();
        };
        queueMicrotask(advance);
        return request;
      }

      const store = {
        openCursor: () => cursorRequest(true),
        openKeyCursor: () => cursorRequest(false),
      };
      return transaction;
    },
  };

  const factory = {
    open() {
      const request: {
        result: typeof db;
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
        onblocked: (() => void) | null;
        onupgradeneeded: (() => void) | null;
      } = {
        result: db,
        onsuccess: null,
        onerror: null,
        onblocked: null,
        onupgradeneeded: null,
      };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };

  return { factory: factory as unknown as IDBFactory, records };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('deletes only cached records whose keys match the prefix', async () => {
  const fake = createIndexedDB({
    '/api/transactions?month=2026-09': { total: 1 },
    '/api/transactions?month=2026-08': { total: 2 },
    '/api/accounts': [{ id: 1 }],
  });
  vi.stubGlobal('indexedDB', fake.factory);
  const { idbClearByPrefix } = await import('./idbCache');

  await idbClearByPrefix('/api/transactions');

  expect([...fake.records.keys()]).toEqual(['/api/accounts']);
});
