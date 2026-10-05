import { apiGet } from '../lib/api';
import type { PlatformLedgerSummary, PlatformLedgerView } from './types';

export const platformApi = {
  listLedgers(query?: string): Promise<PlatformLedgerSummary[]> {
    return apiGet('/api/platform/ledgers', query ? { query } : undefined);
  },
  getLedger(ledgerId: number): Promise<PlatformLedgerView> {
    return apiGet(`/api/platform/ledgers/${ledgerId}`);
  },
};
