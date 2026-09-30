export type WebSurface = 'ledger' | 'platform';

export function surfaceForPathname(pathname: string): WebSurface | null {
  if (pathname === '/platform' || pathname.startsWith('/platform/')) return 'platform';
  if (pathname === '/ledger' || pathname.startsWith('/ledger/')) return 'ledger';
  return null;
}
