import { getCurrentInstance, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  getSession,
  loginLedger,
  loginPlatform,
  logout as logoutApi,
} from '../lib/api';
import type { LedgerSession, PlatformSession, SessionInfo, WebAuthKind } from './types';

type AuthSession = LedgerSession | PlatformSession;

function routeFor(kind: WebAuthKind): string {
  return kind === 'ledger' ? '/ledger' : '/platform';
}

function isExpectedSession(kind: WebAuthKind, value: SessionInfo): value is AuthSession {
  return kind === 'ledger' ? value.type === 'LEDGER_USER' : value.type === 'PLATFORM_ADMIN';
}

export function useWebAuth(kind: WebAuthKind) {
  const session = ref<AuthSession | null>(null);

  const handleAuthLost = (event: Event) => {
    const detail = (event as CustomEvent<{ kind?: WebAuthKind }>).detail;
    if (detail?.kind !== kind) return;
    session.value = null;
    if (window.location.pathname !== routeFor(kind)) {
      window.location.replace(routeFor(kind));
    }
  };

  if (getCurrentInstance()) {
    onMounted(() => window.addEventListener('web-auth-lost', handleAuthLost));
    onBeforeUnmount(() => window.removeEventListener('web-auth-lost', handleAuthLost));
  }

  async function refresh(): Promise<AuthSession | null> {
    try {
      const current = await getSession(kind);
      session.value = isExpectedSession(kind, current) ? current : null;
    } catch {
      session.value = null;
    }
    return session.value;
  }

  async function login(username: string, password: string): Promise<AuthSession> {
    const current = kind === 'ledger'
      ? await loginLedger(username, password)
      : await loginPlatform(username, password);
    session.value = current;
    return current;
  }

  async function logout(): Promise<void> {
    await logoutApi(kind);
    session.value = null;
  }

  return { session, login, logout, refresh };
}
