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

  const summaryLoading = ref(true);
  const liabilityLoading = ref(true);
  const accountLoading = ref(true);
  const memberLoading = ref(true);
  const repaymentsLoading = ref(false);
  const summaryError = ref<string | null>(null);
  const liabilityError = ref<string | null>(null);
  const accountError = ref<string | null>(null);
  const memberError = ref<string | null>(null);
  const repaymentsError = ref<string | null>(null);

  const loading = computed(
    () => summaryLoading.value || liabilityLoading.value || accountLoading.value || memberLoading.value,
  );
  const refreshing = computed(
    () => loading.value && liabilities.value.length > 0,
  );
  const error = computed(
    () => liabilityError.value ?? summaryError.value ?? accountError.value ?? memberError.value,
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

  let repaymentSequence = 0;
  async function loadRepayments(liabilityId: number, force = false) {
    const request = ++repaymentSequence;
    if (selectedLiabilityId.value !== liabilityId) repayments.value = [];
    selectedLiabilityId.value = liabilityId;
    repaymentsLoading.value = true;
    repaymentsError.value = null;
    try {
      const result = await cachedGet<Repayment[]>(
        '/api/repayments',
        { liabilityId },
        { force },
      );
      if (request === repaymentSequence && selectedLiabilityId.value === liabilityId) {
        repayments.value = result ?? [];
      }
    } catch (cause) {
      if (request === repaymentSequence && selectedLiabilityId.value === liabilityId) {
        repaymentsError.value = messageOf(cause, '还款记录加载失败');
      }
    } finally {
      if (request === repaymentSequence && selectedLiabilityId.value === liabilityId) {
        repaymentsLoading.value = false;
      }
    }
  }

  function load(force = false) {
    return Promise.all([
      loadSummary(force),
      loadLiabilities(force),
      loadAccounts(force),
      loadMembers(force),
    ]);
  }

  function reloadRepayments() {
    if (selectedLiabilityId.value == null) return Promise.resolve();
    return loadRepayments(selectedLiabilityId.value, true);
  }

  watch(resourceVersion(['statistics']), () => void loadSummary(true));
  watch(resourceVersion(['liabilities']), () => void loadLiabilities(true));
  watch(resourceVersion(['accounts']), () => void loadAccounts(true));
  watch(resourceVersion(['members']), () => void loadMembers(true));
  watch(resourceVersion(['repayments']), () => void reloadRepayments());
  onMounted(() => void load());

  return {
    summary,
    liabilities,
    repayments,
    accounts,
    members,
    selectedLiabilityId,
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
  };
}
