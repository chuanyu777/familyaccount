import { computed, onMounted, ref, watch } from 'vue';
import { cachedGet } from '../../lib/api';
import { createLatestGate } from '../../lib/latestGate';
import { resourceVersion } from '../../lib/resourceInvalidation';
import type { Account, Asset, AssetSnapshot, Member, Summary } from './types';

const EMPTY_SUMMARY: Summary = {
  totalAssetsCents: 0,
  totalLiabilitiesCents: 0,
  netWorthCents: 0,
  monthlyPaymentTotalCents: 0,
  accountsTotalCents: 0,
  assetsTotalCents: 0,
};

export function useAssets() {
  const summary = ref<Summary>(EMPTY_SUMMARY);
  const accounts = ref<Account[]>([]);
  const assets = ref<Asset[]>([]);
  const members = ref<Member[]>([]);
  const snapshots = ref<AssetSnapshot[]>([]);
  const accountLoading = ref(true);
  const assetLoading = ref(true);
  const memberLoading = ref(true);
  const summaryLoading = ref(true);
  const accountError = ref<string | null>(null);
  const assetError = ref<string | null>(null);
  const memberError = ref<string | null>(null);
  const summaryError = ref<string | null>(null);
  const snapshotsLoading = ref(false);
  const snapshotsError = ref<string | null>(null);
  const loading = computed(
    () => accountLoading.value || assetLoading.value || memberLoading.value || summaryLoading.value,
  );
  const refreshing = computed(
    () => loading.value && (accounts.value.length > 0 || assets.value.length > 0),
  );
  const error = computed(
    () => accountError.value ?? assetError.value ?? memberError.value ?? summaryError.value,
  );

  function createLoader<T>(
    path: string,
    target: { value: T },
    requestLoading: { value: boolean },
    requestError: { value: string | null },
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
        if (request === sequence) requestError.value = cause instanceof Error ? cause.message : '加载失败';
      } finally {
        if (request === sequence) requestLoading.value = false;
      }
    };
  }

  const loadAccounts = createLoader('/api/accounts', accounts, accountLoading, accountError);
  const loadAssets = createLoader('/api/assets', assets, assetLoading, assetError);
  const loadMembers = createLoader('/api/members', members, memberLoading, memberError);
  const loadSummary = createLoader('/api/stats/summary', summary, summaryLoading, summaryError);

  function load(force = false) {
    return Promise.all([loadSummary(force), loadAccounts(force), loadAssets(force), loadMembers(force)]);
  }

  let selectedAssetId: number | null = null;
  let snapshotSequence = 0;
  async function loadSnapshots(assetId: number, force = false) {
    const request = ++snapshotSequence;
    if (selectedAssetId !== assetId) snapshots.value = [];
    selectedAssetId = assetId;
    snapshotsLoading.value = true;
    snapshotsError.value = null;
    try {
      const result = await cachedGet<AssetSnapshot[]>(`/api/assets/${assetId}/snapshots`, undefined, { force });
      if (request === snapshotSequence) snapshots.value = result ?? [];
    } catch (cause) {
      if (request === snapshotSequence) {
        snapshotsError.value = cause instanceof Error ? cause.message : '市值记录加载失败';
      }
    } finally {
      if (request === snapshotSequence) snapshotsLoading.value = false;
    }
  }

  watch(resourceVersion(['accounts']), () => void loadAccounts(true));
  watch(resourceVersion(['assets']), () => void loadAssets(true));
  watch(resourceVersion(['members']), () => void loadMembers(true));
  watch(resourceVersion(['statistics']), () => void loadSummary(true));
  onMounted(() => void load());

  return {
    summary,
    accounts,
    assets,
    members,
    snapshots,
    loading,
    refreshing,
    error,
    accountLoading,
    assetLoading,
    memberLoading,
    summaryLoading,
    accountError,
    assetError,
    memberError,
    summaryError,
    snapshotsLoading,
    snapshotsError,
    load,
    reload: () => load(true),
    loadAccounts,
    loadAssets,
    loadMembers,
    loadSummary,
    loadSnapshots,
    reloadAccounts: () => loadAccounts(true),
    reloadAssets: () => loadAssets(true),
    reloadMembers: () => loadMembers(true),
    reloadSummary: () => loadSummary(true),
  };
}
