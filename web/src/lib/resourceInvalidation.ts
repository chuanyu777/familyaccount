import { computed, reactive } from 'vue';

export type ResourceKey = 'family' | 'members' | 'categories' | 'accounts' |
  'transactions' | 'assets' | 'liabilities' | 'repayments' | 'statistics';

const versions = reactive<Record<ResourceKey, number>>({
  family: 0, members: 0, categories: 0, accounts: 0, transactions: 0,
  assets: 0, liabilities: 0, repayments: 0, statistics: 0,
});

export function publishResources(keys: readonly ResourceKey[]) {
  for (const key of new Set(keys)) versions[key] += 1;
}

export function resourceVersion(keys: readonly ResourceKey[]) {
  return computed(() => keys.map((key) => versions[key]).join(':'));
}

export function resourcesForMutation(path: string, method: string): ResourceKey[] {
  if (path.startsWith('/api/repayments')) return ['repayments', 'transactions', 'accounts', 'liabilities', 'statistics'];
  if (path.startsWith('/api/transactions')) return ['transactions', 'accounts', 'statistics'];
  if (path.startsWith('/api/accounts')) return ['accounts', 'transactions', 'statistics'];
  if (path.startsWith('/api/assets')) return ['assets', 'statistics'];
  if (path.startsWith('/api/liabilities') && method === 'DELETE') {
    return ['liabilities', 'repayments', 'transactions', 'accounts', 'statistics'];
  }
  if (path.startsWith('/api/liabilities')) return ['liabilities', 'repayments', 'statistics'];
  if (path.startsWith('/api/members')) return ['members', 'transactions', 'assets', 'liabilities'];
  if (path.startsWith('/api/categories')) return ['categories'];
  if (path.startsWith('/api/family')) return ['family'];
  return [];
}
