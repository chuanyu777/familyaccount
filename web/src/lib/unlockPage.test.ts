import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const unlockPage = readFileSync(resolve(process.cwd(), 'web/public/unlock.html'), 'utf8');
const pageBody = unlockPage.match(/<body>([\s\S]*?)<script>/)?.[1] ?? '';
const pageScript = unlockPage.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';

if (!pageBody || !pageScript) throw new Error('unlock page must contain an inline form and script');

function loadUnlockPage(next: string | null, status: number) {
  const replace = vi.fn();
  vi.stubGlobal('location', {
    search: next === null ? '' : `?next=${encodeURIComponent(next)}`,
    replace,
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ status }) as Response));
  document.body.innerHTML = pageBody;
  new Function(pageScript)();
  return replace;
}

async function submitUnlockForm() {
  document.querySelector<HTMLFormElement>('#unlock-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();
}

describe('unlock page', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a successful unlock to the requested SPA hash route', async () => {
    const replace = loadUnlockPage('#settings', 204);

    await submitUnlockForm();

    expect(replace).toHaveBeenCalledWith('/#settings');
  });

  it.each(['https://example.com', 'javascript:alert(1)', '##settings'])('falls back to root for unsafe next %s', async (next) => {
    const replace = loadUnlockPage(next, 204);

    await submitUnlockForm();

    expect(replace).toHaveBeenCalledWith('/');
  });

  it('falls back to root when next is missing', async () => {
    const replace = loadUnlockPage(null, 204);

    await submitUnlockForm();

    expect(replace).toHaveBeenCalledWith('/');
  });

  it('shows generic failure and rate-limit messages', async () => {
    loadUnlockPage('#settings', 401);
    await submitUnlockForm();
    expect(document.querySelector('#error')!.textContent).toContain('解锁失败');

    document.body.innerHTML = '';
    loadUnlockPage('#settings', 429);
    await submitUnlockForm();
    expect(document.querySelector('#error')!.textContent).toContain('尝试次数过多');
  });
});
