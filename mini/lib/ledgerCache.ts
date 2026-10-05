const LEDGER_CACHE_PREFIX = 'family-ledger.cache';

export const LEDGER_SCOPED_RESOURCES = [
  'transactions', 'accounts', 'assets', 'liabilities',
  'repayments', 'categories', 'members', 'statistics',
] as const;

export function ledgerCacheKey(resource: string, ledgerId: number): string {
  return `${LEDGER_CACHE_PREFIX}.${resource}.${ledgerId}`;
}

export function invalidateLedgerScopedCache(ledgerId: number): void {
  for (const resource of LEDGER_SCOPED_RESOURCES) {
    wx.removeStorageSync(ledgerCacheKey(resource, ledgerId));
  }
}
