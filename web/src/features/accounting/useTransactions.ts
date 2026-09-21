import { computed, onMounted, ref, watch } from 'vue';
import { cachedGet } from '../../lib/api';
import { currentMonth } from '../../lib/format';
import { createLatestGate } from '../../lib/latestGate';
import { resourceVersion } from '../../lib/resourceInvalidation';
import type {
  Account,
  Category,
  Member,
  Transaction,
  TransactionType,
  TransactionsResponse,
} from './types';

const PAGE_SIZE = 20;

export type TransactionTypeFilter = '' | TransactionType;

export function useTransactions() {
  const month = ref(currentMonth());
  const type = ref<TransactionTypeFilter>('');
  const accountFilter = ref('');
  const memberFilter = ref('');
  const page = ref(1);

  const items = ref<Transaction[]>([]);
  const totals = ref({ income: 0, expense: 0, net: 0 });
  const total = ref(0);
  const accounts = ref<Account[]>([]);
  const members = ref<Member[]>([]);
  const expenseCategories = ref<Category[]>([]);
  const incomeCategories = ref<Category[]>([]);

  const loading = ref(true);
  const refreshing = ref(false);
  const error = ref<string | null>(null);
  const query = computed(() => ({
    month: month.value,
    type: type.value,
    accountFilter: accountFilter.value,
    memberFilter: memberFilter.value,
  }));
  const queryKey = computed(() => JSON.stringify(query.value));
  const loadedQuery = ref<typeof query.value | null>(null);
  const firstPageReady = ref(false);
  const retainedQuery = computed(() =>
    loadedQuery.value && JSON.stringify(loadedQuery.value) !== queryKey.value ? loadedQuery.value : null,
  );
  const hasMore = computed(() => firstPageReady.value && !retainedQuery.value && items.value.length < total.value);
  const referenceLoading = ref(true);
  const referenceError = ref<string | null>(null);

  const listGate = createLatestGate();
  const referenceGate = createLatestGate();
  const transactionVersion = resourceVersion(['transactions']);
  const referenceVersion = resourceVersion(['accounts', 'members', 'categories']);
  let loadSequence = 0;

  function requestParams(): Record<string, unknown> {
    const params: Record<string, unknown> = {
      month: month.value,
      page: page.value,
      pageSize: PAGE_SIZE,
    };
    if (type.value) params.type = type.value;
    if (accountFilter.value) params.accountId = Number(accountFilter.value);
    if (memberFilter.value) params.memberId = Number(memberFilter.value);
    return params;
  }

  async function load(options: { force?: boolean; append?: boolean } = {}) {
    if (options.append && (!hasMore.value || loading.value || refreshing.value)) return false;
    const request = ++loadSequence;
    const requestedQuery = query.value;
    const requestedKey = queryKey.value;
    if (!options.append) firstPageReady.value = false;
    if (items.value.length === 0) loading.value = true;
    else refreshing.value = true;
    error.value = null;

    try {
      const result = await listGate.run(() =>
        cachedGet<TransactionsResponse>('/api/transactions', requestParams(), {
          force: options.force,
        }),
      );
      if (!result.current || requestedKey !== queryKey.value) return false;
      items.value = options.append ? [...items.value, ...result.value.items] : result.value.items;
      totals.value = {
        income: result.value.incomeTotalCents,
        expense: result.value.expenseTotalCents,
        net: result.value.netCents,
      };
      total.value = result.value.total;
      loadedQuery.value = requestedQuery;
      firstPageReady.value = true;
      return true;
    } catch (cause) {
      if (request !== loadSequence || requestedKey !== queryKey.value) return false;
      error.value = cause instanceof Error ? cause.message : '流水加载失败';
      return false;
    } finally {
      if (request === loadSequence) {
        loading.value = false;
        refreshing.value = false;
      }
    }
  }

  async function loadReferences(force = false) {
    referenceLoading.value = true;
    referenceError.value = null;
    const result = await referenceGate.run(() => Promise.allSettled([
      cachedGet<Account[]>('/api/accounts', undefined, { force }),
      cachedGet<Member[]>('/api/members', undefined, { force }),
      cachedGet<Category[]>('/api/categories', { kind: 'expense' }, { force }),
      cachedGet<Category[]>('/api/categories', { kind: 'income' }, { force }),
    ]));
    if (!result.current) return;
    const [accountItems, memberItems, expenseItems, incomeItems] = result.value;
    if (accountItems.status === 'fulfilled') accounts.value = accountItems.value ?? [];
    if (memberItems.status === 'fulfilled') members.value = memberItems.value ?? [];
    if (expenseItems.status === 'fulfilled') expenseCategories.value = expenseItems.value ?? [];
    if (incomeItems.status === 'fulfilled') incomeCategories.value = incomeItems.value ?? [];
    const labels = ['账户', '成员', '支出分类', '收入分类'];
    referenceError.value = result.value.flatMap((item, index) => item.status === 'rejected'
      ? [`${labels[index]}：${item.reason instanceof Error ? item.reason.message : '加载失败'}`]
      : []).join('；') || null;
    referenceLoading.value = false;
  }

  function resetAndLoad() {
    page.value = 1;
    return load();
  }

  async function loadMore() {
    if (!hasMore.value || loading.value || refreshing.value) return;
    page.value += 1;
    const requestedPage = page.value;
    const pending = load({ append: true });
    const request = loadSequence;
    const applied = await pending;
    if (!applied && request === loadSequence && page.value === requestedPage) page.value -= 1;
  }

  function reload() {
    page.value = 1;
    return load({ force: true });
  }

  watch([type, accountFilter, memberFilter, month], () => {
    void resetAndLoad();
  });
  watch(transactionVersion, () => {
    page.value = 1;
    void load({ force: true });
  });
  watch(referenceVersion, () => {
    void loadReferences(true);
  });

  onMounted(() => {
    void loadReferences();
    void load();
  });

  return {
    month,
    type,
    accountFilter,
    memberFilter,
    items,
    totals,
    total,
    accounts,
    members,
    expenseCategories,
    incomeCategories,
    loading,
    refreshing,
    error,
    hasMore,
    retainedQuery,
    referenceLoading,
    referenceError,
    reloadReferences: () => loadReferences(true),
    load,
    loadMore,
    reload,
  };
}
