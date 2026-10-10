import { request } from '../lib/http';
import { currentLedgerStore } from '../lib/currentLedger';
import { sessionStore } from '../lib/session';
import type { LedgerSummary } from '../types/domain';
import { resetAssistantConversation } from './assistant';

const INVITATION_TOKEN_KEY = 'family-ledger.invitation-token';

export interface AuthResult {
  userId: number;
  type: 'LEDGER_USER';
  webSession: boolean;
  ledgers: LedgerSummary[];
}

export interface WebLedgerImportPreview {
  ledgerId: number;
  ledgerName: string;
  role: 'OWNER' | 'MEMBER';
}

interface AuthResponse {
  userId: number;
  type: 'LEDGER_USER';
  webSession: boolean;
}

export const invitationTokenStore = {
  get(): string | null {
    return (wx.getStorageSync(INVITATION_TOKEN_KEY) as string | undefined) ?? null;
  },
  set(token: string): void {
    wx.setStorageSync(INVITATION_TOKEN_KEY, token);
  },
  clear(): void {
    wx.removeStorageSync(INVITATION_TOKEN_KEY);
  },
};

export function captureInvitationToken(query: Record<string, unknown> | undefined): void {
  const token = query?.token;
  if (typeof token === 'string' && token.length > 0) invitationTokenStore.set(token);
}

function getWeChatCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({ success: ({ code }) => resolve(code), fail: reject });
  });
}

async function finishAuthentication(response: AuthResponse): Promise<AuthResult> {
  const session = sessionStore.get();
  if (session) sessionStore.set({ ...session, userId: response.userId });
  const ledgers = await request<LedgerSummary[]>('/api/ledgers');
  const storedLedger = currentLedgerStore.get();
  const currentLedger =
    (storedLedger && ledgers.find((ledger) => ledger.id === storedLedger.id)) ?? ledgers[0];
  if (currentLedger) currentLedgerStore.set(currentLedger);
  else currentLedgerStore.clear();
  return { ...response, ledgers };
}

export async function loginWithWeChat(): Promise<AuthResult> {
  const code = await getWeChatCode();
  const response = await request<AuthResponse>('/api/auth/wechat/login', {
    method: 'POST',
    data: { code },
  });
  return finishAuthentication(response);
}

export async function bindExistingWebAccount(bindingCode: string): Promise<AuthResult> {
  const code = await getWeChatCode();
  const response = await request<AuthResponse>('/api/auth/wechat/bind', {
    method: 'POST',
    data: { bindingCode, code },
  });
  return finishAuthentication(response);
}

export function previewWebLedgerImport(bindingCode: string): Promise<WebLedgerImportPreview> {
  return request<WebLedgerImportPreview>('/api/auth/web-ledger/preview', {
    method: 'POST',
    data: { bindingCode },
  });
}

export function importWebLedger(bindingCode: string): Promise<WebLedgerImportPreview> {
  return request<WebLedgerImportPreview>('/api/auth/web-ledger/import', {
    method: 'POST',
    data: { bindingCode },
  });
}

export async function logout(): Promise<void> {
  await request<void>('/api/auth/logout', { method: 'POST' });
  sessionStore.clear();
  currentLedgerStore.clear();
  resetAssistantConversation();
}

export function getPostAuthRoute(ledgers: LedgerSummary[]): string {
  const token = invitationTokenStore.get();
  if (token) return `/pages/invitation/detail?token=${encodeURIComponent(token)}`;
  return ledgers.length === 0 ? '/pages/ledger/empty' : '/pages/ledger/list';
}
