import { computed, onMounted, ref, watch, type Ref } from 'vue';
import { cachedGet } from '../../lib/api';
import { createLatestGate } from '../../lib/latestGate';
import { resourceVersion } from '../../lib/resourceInvalidation';
import type { Account, Liability, Member, Repayment, Summary } from './types';

const EMPTY_SUMMARY: Summary = {
  totalAssetsCents: 0,
  totalLiabilitiesCents: 0,
  netWorthCents: 0,
  monthlyPaymentTotalCents: 0,
  accountsTotalCents: 0,
  assetsTotalCents: 0,
};

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export function useLiabilities() {
  const summary = ref<Summary>(EMPTY_SUMMARY);
  const liabilities = ref<Liability[]>([]);
  const accounts = ref<Account[]>([]);
  const members = ref<Member[]>([]);
  const repayments = ref<Repayment[]>([]);
  const selectedLiabilityId = ref<number | null>(null);
  const selectedLiability = computed(
    () => liabilities.value.find(({ id }) => id === selectedLiabilityId.value) ?? null,
  );
  const selectedRepayments = computed(() =>
    repayments.value.filter(({ liability_id }) => liability_id === selectedLiabilityId.value),
  );

  const summaryLoading = ref(true);
  const liabilityLoading = ref(true);
  const accountLoading = ref(true);
  const memberLoading = ref(true);
  const repaymentsLoading = ref(true);
  const summaryError = ref<string | null>(null);
  const liabilityError = ref<string | null>(null);
  const accountError = ref<string | null>(null);
  const memberError = ref<string | null>(null);
  const repaymentsError = ref<string | null>(null);

  const loading = computed(
    () =>
      summaryLoading.value ||
      liabilityLoading.value ||
      accountLoading.value ||
      memberLoading.value ||
      repaymentsLoading.value,
  );
  const refreshing = computed(
    () => loading.value && liabilities.value.length > 0,
  );
  const error = computed(
    () =>
      liabilityError.value ??
      repaymentsError.value ??
      summaryError.value ??
      accountError.value ??
      memberError.value,
  );

  function createLoader<T>(
    path: string,
    target: Ref<T>,
    requestLoading: Ref<boolean>,
    requestError: Ref<string | null>,
    fallback: string,
  ) {
    const gate = createLatestGate();
    let sequence = 0;
    return async (force = false) => {
      const request = ++sequence;
      requestLoading.value = true;
      requestError.value = null;
      try {
        const result = await gate.run(() => cachedGet<T>(path, undefined, { force }));
        if (result.current) target.value = result.value;
      } catch (cause) {
        if (request === sequence) requestError.value = messageOf(cause, fallback);
      } finally {
        if (request === sequence) requestLoading.value = false;
      }
    };
  }

  const loadSummary = createLoader(
    '/api/stats/summary',
    summary,
    summaryLoading,
    summaryError,
    '负债汇总加载失败',
  );
  const loadLiabilities = createLoader(
    '/api/liabilities',
    liabilities,
    liabilityLoading,
    liabilityError,
    '负债加载失败',
  );
  const loadAccounts = createLoader(
    '/api/accounts',
    accounts,
    accountLoading,
    accountError,
    '账户加载失败',
  );
  const loadMembers = createLoader(
    '/api/members',
    members,
    memberLoading,
    memberError,
    '成员加载失败',
  );
  const loadRepayments = createLoader(
    '/api/repayments',
    repayments,
    repaymentsLoading,
    repaymentsError,
    '还款记录加载失败',
  );

  function load(force = false) {
    return Promise.all([
      loadSummary(force),
      loadLiabilities(force),
      loadAccounts(force),
      loadMembers(force),
      loadRepayments(force),
    ]);
  }

  function reloadRepayments() {
    return loadRepayments(true);
  }

  function selectLiability(id: number) {
    selectedLiabilityId.value = id;
  }

  function clearSelection() {
    selectedLiabilityId.value = null;
  }

  watch(resourceVersion(['statistics']), () => void loadSummary(true));
  watch(resourceVersion(['liabilities']), () => void loadLiabilities(true));
  watch(resourceVersion(['accounts']), () => void loadAccounts(true));
  watch(resourceVersion(['members']), () => void loadMembers(true));
  watch(resourceVersion(['repayments']), () => void loadRepayments(true));
  watch(liabilities, (items) => {
    if (
      selectedLiabilityId.value != null &&
      !items.some(({ id }) => id === selectedLiabilityId.value)
    ) {
      clearSelection();
    }
  });
  onMounted(() => void load());

  return {
    summary,
    liabilities,
    repayments,
    accounts,
    members,
    selectedLiabilityId,
    selectedLiability,
    selectedRepayments,
    loading,
    refreshing,
    error,
    summaryLoading,
    liabilityLoading,
    accountLoading,
    memberLoading,
    repaymentsLoading,
    summaryError,
    liabilityError,
    accountError,
    memberError,
    repaymentsError,
    load,
    reload: () => load(true),
    loadSummary,
    loadLiabilities,
    loadAccounts,
    loadMembers,
    loadRepayments,
    reloadSummary: () => loadSummary(true),
    reloadLiabilities: () => loadLiabilities(true),
    reloadAccounts: () => loadAccounts(true),
    reloadMembers: () => loadMembers(true),
    reloadRepayments,
    selectLiability,
    clearSelection,
  };
}
