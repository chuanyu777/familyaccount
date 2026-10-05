import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import LedgerLogin from './LedgerLogin.vue';
import PlatformLogin from './PlatformLogin.vue';
import { useWebAuth } from './useWebAuth';
import { loginLedger, loginPlatform, getSession, getLedger, logout } from '../lib/api';
import { surfaceForPathname } from './entryPoint';

vi.mock('../App.vue', () => ({
  default: { template: '<div data-surface="ledger">家庭财务</div>' },
}));

vi.mock('../lib/api', () => ({
  cachedGet: vi.fn(async (path: string) => path === '/api/family' ? { id: 1, name: '我的家' } : []),
  apiGet: vi.fn(async () => []),
  apiPost: vi.fn(async () => ({})),
  apiPatch: vi.fn(async () => ({})),
  apiPut: vi.fn(async () => ({})),
  apiDelete: vi.fn(async () => ({ ok: true })),
  invalidate: vi.fn(async () => undefined),
  loginLedger: vi.fn(),
  loginPlatform: vi.fn(),
  getSession: vi.fn(),
  getLedger: vi.fn(),
  logout: vi.fn(),
  createMiniBindingCode: vi.fn(),
}));

const mockedLoginLedger = vi.mocked(loginLedger);
const mockedLoginPlatform = vi.mocked(loginPlatform);
const mockedGetSession = vi.mocked(getSession);
const mockedLogout = vi.mocked(logout);

const ledgerSession = { type: 'LEDGER_USER' as const, userId: 7, webSession: true as const };
const platformSession = { type: 'PLATFORM_ADMIN' as const, platformAdminId: 9 };

async function settle() {
  await flushPromises();
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetSession.mockRejectedValue(new Error('not signed in'));
  mockedLoginLedger.mockResolvedValue(ledgerSession);
  mockedLoginPlatform.mockResolvedValue(platformSession);
  mockedLogout.mockResolvedValue(undefined);
  vi.mocked(getLedger).mockResolvedValue({ id: 1, name: 'Special', role: 'OWNER', active: true, webLoginAllowed: true });
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('web authentication entry points', () => {
  it('maps only platform and ledger pathnames to their matching surfaces', () => {
    expect(surfaceForPathname('/platform')).toBe('platform');
    expect(surfaceForPathname('/platform/ledgers')).toBe('platform');
    expect(surfaceForPathname('/ledger')).toBe('ledger');
    expect(surfaceForPathname('/ledger/settings')).toBe('ledger');
    expect(surfaceForPathname('/')).toBeNull();
  });

  it('logs into the ledger surface with the ledger session only', async () => {
    const wrapper = mount(LedgerLogin, { attachTo: document.body });
    await settle();

    await wrapper.get('input[name="username"]').setValue('ledger-user');
    await wrapper.get('input[name="password"]').setValue('secret');
    await wrapper.get('form').trigger('submit');
    await settle();

    expect(mockedLoginLedger).toHaveBeenCalledWith('ledger-user', 'secret');
    expect(mockedLoginPlatform).not.toHaveBeenCalled();
    expect(wrapper.find('[data-surface="ledger"]').exists()).toBe(true);
    expect(wrapper.find('form').exists()).toBe(false);
    wrapper.unmount();
  });

  it('logs into the platform surface without rendering ledger controls', async () => {
    const wrapper = mount(PlatformLogin, { attachTo: document.body });
    await settle();

    await wrapper.get('input[name="username"]').setValue('operator');
    await wrapper.get('input[name="password"]').setValue('secret');
    await wrapper.get('form').trigger('submit');
    await settle();

    expect(mockedLoginPlatform).toHaveBeenCalledWith('operator', 'secret');
    expect(mockedLoginLedger).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('平台控制台');
    expect(wrapper.find('input[name="password"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('绑定小程序');
    expect(wrapper.find('button[data-mutation-control]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not accept a ledger session for the platform auth surface', async () => {
    mockedGetSession.mockResolvedValue(ledgerSession);
    const wrapper = mount(PlatformLogin, { attachTo: document.body });
    await settle();

    expect(wrapper.find('form').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('平台控制台');
    wrapper.unmount();
  });

  it.each([
    { type: 'LEDGER_USER' as const, userId: 7, webSession: false },
    { type: 'LEDGER_USER' as const, userId: 7 },
    platformSession,
  ])('does not mount the ledger app with a non-Web ledger session: %j', async (session) => {
    mockedGetSession.mockResolvedValue(session);
    const wrapper = mount(LedgerLogin);
    await settle();
    expect(wrapper.find('[data-surface="ledger"]').exists()).toBe(false);
    expect(wrapper.find('input[name="password"]').exists()).toBe(true);
    expect(getLedger).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('requires successful fixed-ledger discovery before mounting authenticated content', async () => {
    mockedGetSession.mockResolvedValue(ledgerSession);
    vi.mocked(getLedger).mockRejectedValue(new Error('Forbidden'));
    const wrapper = mount(LedgerLogin);
    await settle();
    expect(wrapper.find('[data-surface="ledger"]').exists()).toBe(false);
    expect(wrapper.find('input[name="password"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('clears only the matching session when its API returns 401', async () => {
    window.history.replaceState(null, '', '/ledger');
    mockedGetSession.mockImplementation(async (kind) => kind === 'ledger' ? ledgerSession : platformSession);
    const ledger = mount(LedgerLogin, { attachTo: document.body });
    const platform = mount(PlatformLogin, { attachTo: document.body });
    await settle();

    expect(ledger.find('[data-surface="ledger"]').exists()).toBe(true);
    expect(platform.find('input[name="password"]').exists()).toBe(false);

    window.dispatchEvent(new CustomEvent('web-auth-lost', { detail: { kind: 'ledger' } }));
    await settle();

    expect(ledger.find('form').exists()).toBe(true);
    expect(platform.text()).toContain('平台控制台');
    ledger.unmount();
    platform.unmount();
    window.history.replaceState(null, '', '/');
  });

  it('keeps ledger auth state independent from platform auth state', async () => {
    mockedGetSession.mockImplementation(async (kind) => kind === 'ledger' ? ledgerSession : platformSession);
    const ledger = useWebAuth('ledger');
    const platform = useWebAuth('platform');

    await Promise.all([ledger.refresh(), platform.refresh()]);
    await ledger.logout();

    expect(ledger.session.value).toBeNull();
    expect(platform.session.value).toEqual(platformSession);
    expect(mockedLogout).toHaveBeenCalledWith('ledger');
  });
});
