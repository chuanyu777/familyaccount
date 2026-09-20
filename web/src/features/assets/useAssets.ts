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
  const loading = ref(true);
  const refreshing = ref(false);
  const requestErrors = ref<Record<string, string>>({});
  const error = computed(() => Object.values(requestErrors.value)[0] ?? null);
  const snapshotsLoading = ref(false);
  const snapshotsError = ref<string | null>(null);

  function createLoader<T>(path: string, target: { value: T }) {
    const gate = createLatestGate();
    let sequence = 0;
    return async (force = false) => {
      const request = ++sequence;
      try {
        const result = await gate.run(() => cachedGet<T>(path, undefined, { force }));
        if (result.current) {
          target.value = result.value;
          const { [path]: _resolved, ...remaining } = requestErrors.value;
          requestErrors.value = remaining;
        }
      } catch (cause) {
        if (request === sequence) {
          requestErrors.value = {
            ...requestErrors.value,
            [path]: cause instanceof Error ? cause.message : '加载失败',
          };
        }
      }
    };
  }

  const loadAccounts = createLoader('/api/accounts', accounts);
  const loadAssets = createLoader('/api/assets', assets);
  const loadMembers = createLoader('/api/members', members);
  const loadSummary = createLoader('/api/stats/summary', summary);

  async function load(force = false) {
    if (accounts.value.length || assets.value.length) refreshing.value = true;
    else loading.value = true;
    requestErrors.value = {};
    try {
      await Promise.all([loadSummary(force), loadAccounts(force), loadAssets(force), loadMembers(force)]);
    } finally {
      loading.value = false;
      refreshing.value = false;
    }
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
    summary, accounts, assets, members, snapshots, loading, refreshing, error,
    snapshotsLoading, snapshotsError, load, reload: () => load(true),
    loadAccounts, loadAssets, loadMembers, loadSummary, loadSnapshots,
  };
}
