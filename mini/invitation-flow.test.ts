import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { currentLedgerStore } from './lib/currentLedger';
import { sessionStore } from './lib/session';
import { invitationTokenStore } from './services/auth';
import type { MiniRequestOptions, MiniRequestSuccessResult } from './types/api';
import type { LedgerSummary } from './types/domain';

type PageInstance = Record<string, any>;
type Reply = MiniRequestSuccessResult | { failure: unknown };
let replies: Reply[];
let requests: MiniRequestOptions[];
let stack: string[];
let definitions: Map<string, PageInstance>;

const ledger: LedgerSummary = { id: 9, name: '我家', role: 'OWNER' };
const invitedLedger: LedgerSummary = { id: 17, name: '爸妈家', role: 'MEMBER' };
const membership = { id: 23, ledgerId: 17, userId: 7, role: 'MEMBER', active: true, displayName: '小明' };
const imports: Record<string, () => Promise<unknown>> = {
  'auth/index': () => import('./pages/auth/index'),
  'bind-web/index': () => import('./pages/bind-web/index'),
  'invitation/detail': () => import('./pages/invitation/detail'),
  'ledger/list': () => import('./pages/ledger/list'),
  'ledger/empty': () => import('./pages/ledger/empty'),
};

async function page(path: string): Promise<PageInstance> {
  if (!definitions.has(path)) {
    const register = vi.fn();
    vi.stubGlobal('Page', register);
    await imports[path]!();
    definitions.set(path, register.mock.calls[0]![0] as PageInstance);
  }
  const definition = definitions.get(path)!;
  const instance: PageInstance = { ...definition, data: structuredClone(definition.data) };
  instance.setData = (patch: Record<string, unknown>) => Object.assign(instance.data, patch);
  return instance;
}

function respond(...data: unknown[]): void {
  replies.push(...data.map((value) => ({ statusCode: 200, data: value })));
}

function fail(statusCode: number, code: string, message: string): void {
  replies.push({ statusCode, data: { error: { code, message } } });
}

function paths(): string[] { return requests.map(({ url }) => new URL(url).pathname); }

// Exercise the handler wired to the visible exit, so an unwired method cannot pass.
async function exitInvitation(instance: PageInstance): Promise<void> {
  const template = readFileSync(new URL('./pages/invitation/detail.wxml', import.meta.url), 'utf8');
  const button = template.match(/<button\b[^>]*>[^<]*(?:暂不加入|返回我的账本)[^<]*<\/button>/)?.[0];
  expect(button, 'invitation confirmation needs a visible business exit').toBeDefined();
  const handler = button!.match(/bindtap="([^"]+)"/)?.[1];
  expect(typeof instance[handler!], 'the visible exit must have a callable handler').toBe('function');
  await instance[handler!]();
}

async function ordinaryLogin(ledgers: LedgerSummary[]): Promise<void> {
  const auth = await page('auth/index');
  auth.onLoad({});
  replies.push({
    statusCode: 200,
    data: { userId: 7, type: 'LEDGER_USER', webSession: false },
    header: { 'Set-Cookie': 'ledger_session=logged-in; HttpOnly' },
  });
  respond(ledgers);
  await auth.handleLogin();
  expect(auth.data.errorMessage).toBe('');
}

async function coldShare(ledgers: LedgerSummary[], token: string): Promise<PageInstance> {
  stack = [`/pages/invitation/detail?token=${encodeURIComponent(token)}`];
  const register = vi.fn();
  vi.stubGlobal('App', register);
  await import('./app');
  const app = register.mock.calls[0]![0] as PageInstance;
  app.onLaunch({ query: { token } });
  app.onShow({ path: 'pages/invitation/detail', query: { token } });
  const initial = await page('invitation/detail');
  initial.onLoad({ token });
  expect(stack).toEqual(['/pages/auth/index']);
  expect(invitationTokenStore.get()).toBe(token);
  expect(requests).toHaveLength(0);
  await ordinaryLogin(ledgers);
  expect(stack).toEqual([`/pages/invitation/detail?token=${encodeURIComponent(token)}`]);
  const confirmation = await page('invitation/detail');
  confirmation.onLoad({ token });
  expect(confirmation.data.token).toBe(token);
  return confirmation;
}

async function reachBusiness(ledgers: LedgerSummary[]): Promise<void> {
  if (ledgers.length) {
    expect(stack).toEqual(['/pages/ledger/list']);
    const list = await page('ledger/list');
    respond(ledgers);
    await list.onShow();
    expect(list.data.ledgers).toEqual(ledgers);
    list.handleSwitch({ currentTarget: { dataset: { ledger: list.data.ledgers[0] } } });
    expect(stack).toEqual(['/pages/ledger/home']);
    expect(currentLedgerStore.get()).toEqual(ledger);
  } else {
    expect(stack).toEqual(['/pages/ledger/empty']);
    const empty = await page('ledger/empty');
    empty.onShow();
    expect(empty.data.hasInvitation).toBe(false);
    empty.handleCreateLedger();
    expect(stack).toEqual(['/pages/ledger/empty', '/pages/ledger/create']);
    expect(currentLedgerStore.get()).toBeNull();
  }
}

beforeEach(() => {
  vi.resetModules();
  replies = [];
  requests = [];
  stack = [];
  definitions = new Map();
  const storage = new Map<string, unknown>();
  vi.stubGlobal('wx', {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    login: ({ success }: { success: (result: { code: string }) => void }) => success({ code: 'wx-code' }),
    request: (options: MiniRequestOptions) => {
      requests.push(options);
      const reply = replies.shift();
      if (!reply) throw new Error(`Missing HTTP fixture: ${options.url}`);
      if ('failure' in reply) options.fail?.(reply.failure);
      else options.success?.(reply);
    },
    redirectTo: ({ url }: { url: string }) => { stack.splice(Math.max(0, stack.length - 1), 1, url); },
    navigateTo: ({ url }: { url: string }) => { stack.push(url); },
    reLaunch: ({ url }: { url: string }) => { stack = [url]; },
  });
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('R1 invitation exit and retry flows', () => {
  it.each([
    { name: 'existing ledger', ledgers: [ledger], route: '/pages/ledger/list' },
    { name: 'no ledger', ledgers: [], route: '/pages/ledger/empty' },
  ])('escapes a cold-start invalid invitation into $name and later ordinary login', async ({ ledgers, route }) => {
    const confirmation = await coldShare(ledgers, 'expired/token');
    fail(409, 'INVITATION_INVALID', '邀请无效、已过期或已被使用');
    await confirmation.handleAccept();
    expect(confirmation.data.errorMessage).toBe('邀请无效或已失效');
    expect(invitationTokenStore.get()).toBe('expired/token');
    expect(stack).toEqual(['/pages/invitation/detail?token=expired%2Ftoken']);
    respond(ledgers);
    await exitInvitation(confirmation);
    expect(invitationTokenStore.get()).toBeNull();
    expect(confirmation.data.token).toBe('');
    expect(paths()).toEqual(['/api/auth/wechat/login', '/api/ledgers', '/api/invitations/accept', '/api/ledgers']);
    expect(JSON.parse(requests[2]!.data as string)).toEqual({ token: 'expired/token' });
    await reachBusiness(ledgers);

    // Keep persisted storage across a fresh ordinary entry after the user exits.
    sessionStore.clear();
    stack = ['/pages/auth/index'];
    await ordinaryLogin(ledgers);
    expect(stack).toEqual([route]);
    expect(invitationTokenStore.get()).toBeNull();
  });

  it.each([
    { name: 'existing ledger', ledgers: [ledger] },
    { name: 'no ledger', ledgers: [] },
  ])('can explicitly defer a valid invitation into $name without accepting it', async ({ ledgers }) => {
    const confirmation = await coldShare(ledgers, 'valid-token');
    respond(ledgers);
    await exitInvitation(confirmation);
    expect(invitationTokenStore.get()).toBeNull();
    expect(paths()).toEqual(['/api/auth/wechat/login', '/api/ledgers', '/api/ledgers']);
    expect(sessionStore.get()?.userId).toBe(7);
    await reachBusiness(ledgers);

    // A later explicit share can still be accepted with the same valid token.
    stack = ['/pages/invitation/detail?token=valid-token'];
    const later = await page('invitation/detail');
    later.onLoad({ token: 'valid-token' });
    respond(membership, invitedLedger);
    await later.handleAccept();
    expect(stack).toEqual(['/pages/ledger/home']);
    expect(currentLedgerStore.get()).toEqual(invitedLedger);
    expect(invitationTokenStore.get()).toBeNull();
  });

  it.each([
    { name: 'network', reply: { failure: { errMsg: 'request:fail timeout' } } },
    { name: '5xx', reply: { statusCode: 503, data: { error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用' } } } },
    { name: 'retryable 429', reply: { statusCode: 429, data: { error: { code: 'RATE_LIMITED', message: '请稍后重试' } } } },
  ] satisfies Array<{ name: string; reply: Reply }>)('keeps the token after $name failure and retries successfully', async ({ reply }) => {
    const confirmation = await coldShare([ledger], 'retry-token');
    replies.push(reply);
    await confirmation.handleAccept();
    expect(confirmation.data.errorMessage).not.toBe('');
    expect(confirmation.data.loading).toBe(false);
    expect(invitationTokenStore.get()).toBe('retry-token');
    expect(currentLedgerStore.get()).toEqual(ledger);
    expect(stack).toEqual(['/pages/invitation/detail?token=retry-token']);
    sessionStore.clear();
    stack = ['/pages/auth/index'];
    await ordinaryLogin([ledger]);
    expect(stack).toEqual(['/pages/invitation/detail?token=retry-token']);

    respond(membership, invitedLedger);
    await confirmation.handleAccept();
    expect(stack).toEqual(['/pages/ledger/home']);
    expect(invitationTokenStore.get()).toBeNull();
    expect(currentLedgerStore.get()).toEqual(invitedLedger);
    const accepts = requests.filter(({ url }) => new URL(url).pathname === '/api/invitations/accept');
    expect(accepts.map(({ data }) => JSON.parse(data as string))).toEqual([{ token: 'retry-token' }, { token: 'retry-token' }]);
  });

  it('retries business routing after explicit abandonment when the ledger fetch fails', async () => {
    const confirmation = await coldShare([ledger], 'valid-token');
    fail(503, 'INTERNAL_ERROR', '账本加载失败');
    await exitInvitation(confirmation);
    expect(invitationTokenStore.get()).toBeNull();
    expect(confirmation.data.errorMessage).not.toBe('');
    expect(confirmation.data.loading).toBe(false);
    respond([ledger]);
    await exitInvitation(confirmation);
    await reachBusiness([ledger]);
  });

  it('blocks exit while acceptance is in flight and preserves the accepted ledger', async () => {
    const confirmation = await coldShare([ledger], 'valid-token');
    const request = wx.request;
    let pending: MiniRequestOptions | undefined;
    wx.request = (options) => { pending = options; requests.push(options); };
    const accepting = confirmation.handleAccept();
    await exitInvitation(confirmation);
    expect(invitationTokenStore.get()).toBe('valid-token');
    expect(paths()).toEqual(['/api/auth/wechat/login', '/api/ledgers', '/api/invitations/accept']);
    wx.request = request;
    respond(invitedLedger);
    pending!.success?.({ statusCode: 200, data: membership });
    await accepting;
    expect(stack).toEqual(['/pages/ledger/home']);
    expect(currentLedgerStore.get()).toEqual(invitedLedger);
    expect(invitationTokenStore.get()).toBeNull();
  });

  it('preserves session, ledger and pending invitation on a Web binding conflict', async () => {
    sessionStore.set({ cookie: 'ledger_session=existing', userId: 7 });
    currentLedgerStore.set(ledger);
    invitationTokenStore.set('pending-token');
    stack = ['/pages/bind-web/index'];
    const bind = await page('bind-web/index');
    bind.data.bindingCode = 'one-time-code';
    fail(409, 'WECHAT_ALREADY_BOUND', '微信身份已绑定其他用户');
    await bind.handleBind();
    expect(bind.data.errorMessage).toBe('微信身份已绑定其他用户');
    expect(sessionStore.get()).toEqual({ cookie: 'ledger_session=existing', userId: 7 });
    expect(currentLedgerStore.get()).toEqual(ledger);
    expect(invitationTokenStore.get()).toBe('pending-token');
    expect(stack).toEqual(['/pages/bind-web/index']);
    expect(paths()).toEqual(['/api/auth/wechat/bind']);
  });
});
