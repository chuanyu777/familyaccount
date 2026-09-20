<script setup lang="ts">
import { computed, ref } from 'vue';
import MoneyText from '../../components/MoneyText.vue';
import PageHeader from '../../components/PageHeader.vue';
import SummaryStrip, { type SummaryMetric } from '../../components/SummaryStrip.vue';
import SegmentedControl from '../../components/SegmentedControl.vue';
import SectionBlock from '../../components/SectionBlock.vue';
import AsyncState from '../../components/AsyncState.vue';
import AppSheet from '../../components/AppSheet.vue';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import AccountForm from './AccountForm.vue';
import AssetForm from './AssetForm.vue';
import AssetSnapshotForm from './AssetSnapshotForm.vue';
import { apiPost, apiDelete, ApiError } from '../../lib/api';
import { monthLabel } from '../../lib/format';
import { memberName } from './util';
import AccountList from './AccountList.vue';
import AssetList from './AssetList.vue';
import { useAssets } from './useAssets';
import type { Account, Asset } from './types';

type AssetView = 'detail' | 'byMember' | 'byKind';

const VIEW_OPTIONS: { value: AssetView; label: string }[] = [
  { value: 'detail', label: '明细' },
  { value: 'byMember', label: '按成员' },
  { value: 'byKind', label: '按类型' },
];

interface Group {
  key: string;
  label: string;
  cents: number;
}

const {
  summary,
  accounts,
  assets,
  members,
  snapshots,
  accountLoading,
  assetLoading,
  accountError: accountLoadError,
  assetError,
  memberError,
  summaryError,
  snapshotsLoading,
  snapshotsError,
  reloadAccounts,
  reloadAssets,
  reloadMembers,
  reloadSummary,
  loadSnapshots,
} = useAssets();

const netWorthMetric = computed<SummaryMetric>(() => ({
  label: '净资产',
  cents: summary.value.netWorthCents,
  tone: summary.value.netWorthCents < 0 ? 'expense' : 'neutral',
}));
const assetsMetric = computed<SummaryMetric>(() => ({
  label: '总资产',
  cents: summary.value.totalAssetsCents,
  tone: 'income',
}));
const liabilitiesMetric = computed<SummaryMetric>(() => ({
  label: '总负债',
  cents: -summary.value.totalLiabilitiesCents,
  tone: 'expense',
}));

const assetView = ref<AssetView>('detail');
const accountError = ref<string | null>(null);

const accountFormOpen = ref(false);
const accountFormMode = ref<'create' | 'edit'>('create');
const accountFormInitial = ref<Account | undefined>(undefined);
const assetFormOpen = ref(false);
const assetFormInitial = ref<Asset | undefined>(undefined);

/** 编辑、删除这类低频操作收进详情弹层，列表只留干净的一行 */
const detailAccount = ref<Account | null>(null);
const detailAsset = ref<Asset | null>(null);

const snapshotFormAsset = ref<Asset | null>(null);

const confirmDeleteAccountId = ref<number | null>(null);
const confirmDeleteAssetId = ref<number | null>(null);

const groups = computed<Group[]>(() => {
  if (assetView.value === 'detail') return [];
  const map = new Map<string, number>();
  for (const a of assets.value) {
    const key =
      assetView.value === 'byMember' ? String(a.member_id ?? 'family') : a.kind || 'uncat';
    map.set(key, (map.get(key) ?? 0) + a.value_cents);
  }
  return Array.from(map.entries()).map(([key, cents]) => ({
    key,
    label:
      assetView.value === 'byMember'
        ? key === 'family'
          ? '家庭共有'
          : memberName(members.value, Number(key))
        : key === 'uncat'
          ? '未分类'
          : key,
    cents,
  }));
});

function openAccount(initial?: Account) {
  accountFormMode.value = initial ? 'edit' : 'create';
  accountFormInitial.value = initial;
  accountFormOpen.value = true;
}

function openAsset(initial?: Asset) {
  assetFormInitial.value = initial;
  assetFormOpen.value = true;
}

function editAccountFromDetail(a: Account) {
  detailAccount.value = null;
  openAccount(a);
}

function editAssetFromDetail(a: Asset) {
  detailAsset.value = null;
  openAsset(a);
}

/** 打开资产详情时顺带把它历次记过的市值拉出来 */
async function openAssetDetail(a: Asset) {
  detailAsset.value = a;
  await loadSnapshots(a.id);
}

function openSnapshotForm(a: Asset) {
  detailAsset.value = null;
  snapshotFormAsset.value = a;
}

function retrySnapshots() {
  if (detailAsset.value) void loadSnapshots(detailAsset.value.id, true);
}

function onSnapshotSaved() {
  snapshotFormAsset.value = null;
}

async function removeSnapshot(id: number) {
  try {
    await apiDelete(`/api/assets/snapshots/${id}`);
    if (detailAsset.value) await loadSnapshots(detailAsset.value.id, true);
  } catch {
    /* 删除失败保持原样 */
  }
}

function onAccountSaved() {
  accountFormOpen.value = false;
}

function onAssetSaved() {
  assetFormOpen.value = false;
}

async function setDefault(id: number) {
  detailAccount.value = null;
  try {
    await apiPost(`/api/accounts/${id}/set-default`, {});
  } catch {
    /* 设为默认失败不影响列表 */
  }
}

function askDeleteAccount(id: number) {
  accountError.value = null;
  detailAccount.value = null;
  confirmDeleteAccountId.value = id;
}

async function doDeleteAccount() {
  const id = confirmDeleteAccountId.value;
  confirmDeleteAccountId.value = null;
  if (id == null) return;
  accountError.value = null;
  try {
    await apiDelete(`/api/accounts/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'ACCOUNT_IN_USE') {
      accountError.value = '该账户存在交易记录，无法删除';
    } else {
      accountError.value = e instanceof Error ? e.message : '删除失败';
    }
  }
}

function askDeleteAsset(id: number) {
  detailAsset.value = null;
  confirmDeleteAssetId.value = id;
}

async function doDeleteAsset() {
  const id = confirmDeleteAssetId.value;
  confirmDeleteAssetId.value = null;
  if (id == null) return;
  try {
    await apiDelete(`/api/assets/${id}`);
  } catch {
    /* 删除失败保持列表 */
  }
}

function updatedLabel(a: Asset): string {
  if (!a.updated_at) return '未更新';
  return String(a.updated_at).slice(0, 10);
}
</script>

<template>
  <div class="assets">
    <PageHeader title="资产" context="账户与资产项">
      <button type="button" class="btn btn--primary" @click="openAsset()">新增资产</button>
    </PageHeader>

    <SummaryStrip :primary="netWorthMetric" :secondary="[assetsMetric, liabilitiesMetric]" />

    <div v-if="summaryError" class="assets__status" role="alert" data-summary-status>
      <span>{{ summaryError }}</span>
      <button type="button" class="btn" @click="reloadSummary">重试资产汇总</button>
    </div>

    <div v-if="memberError" class="assets__status" role="alert" data-member-status>
      <span>{{ memberError }}</span>
      <button type="button" class="btn" @click="reloadMembers">重试成员信息</button>
    </div>

    <div class="asset-groups">
      <SectionBlock title="资金账户" data-account-group>
        <template #aside>
          <button type="button" class="btn btn--sm" @click="openAccount()">新增账户</button>
        </template>

        <p v-if="accountError" class="form-error">{{ accountError }}</p>

        <AsyncState
          :loading="accountLoading"
          :error="accountLoadError ?? ''"
          :empty="accounts.length === 0"
          empty-title="还没有资金账户"
          empty-hint="点「新增账户」记下你的第一个账户。"
          @retry="reloadAccounts"
        >
          <AccountList :accounts="accounts" :members="members" @select-account="detailAccount = $event" />
        </AsyncState>
      </SectionBlock>

      <SectionBlock title="资产项" data-asset-group>
        <template #aside>
          <SegmentedControl v-model="assetView" :options="VIEW_OPTIONS" label="资产视图" />
        </template>

        <div v-if="assetView !== 'detail'">
          <ul class="list">
            <li v-for="g in groups" :key="g.key">
              <div class="row row--static card">
                <span class="row__title">{{ g.label }}</span>
                <MoneyText :cents="g.cents" class="row__amount" />
              </div>
            </li>
          </ul>
        </div>

        <AsyncState
          v-else
          :loading="assetLoading"
          :error="assetError ?? ''"
          :empty="assets.length === 0"
          empty-title="还没有资产项"
          empty-hint="点「新增资产」记录房产、投资等市值。"
          @retry="reloadAssets"
        >
          <AssetList :assets="assets" :members="members" @select-asset="openAssetDetail" />
        </AsyncState>
      </SectionBlock>
    </div>

    <AppSheet v-if="detailAccount" :title="detailAccount.name" @close="detailAccount = null">
      <dl class="detail">
        <div class="detail__row">
          <dt>余额</dt>
          <dd>
            <MoneyText
              :cents="detailAccount.balance_cents"
              :tone="detailAccount.balance_cents < 0 ? 'expense' : 'neutral'"
              size="lg"
            />
          </dd>
        </div>
        <div class="detail__row">
          <dt>归属</dt>
          <dd>{{ memberName(members, detailAccount.member_id) }}</dd>
        </div>
        <div class="detail__row">
          <dt>状态</dt>
          <dd>{{ detailAccount.is_default ? '默认账户' : '非默认' }}</dd>
        </div>
      </dl>
      <div class="detail__actions">
        <button type="button" class="btn" @click="editAccountFromDetail(detailAccount!)">
          编辑
        </button>
        <button
          v-if="!detailAccount.is_default"
          type="button"
          class="btn"
          @click="setDefault(detailAccount!.id)"
        >
          设为默认
        </button>
        <button
          type="button"
          class="btn btn--danger"
          @click="askDeleteAccount(detailAccount!.id)"
        >
          删除
        </button>
      </div>
    </AppSheet>

    <AppSheet v-if="detailAsset" :title="detailAsset.name" @close="detailAsset = null">
      <dl class="detail">
        <div class="detail__row">
          <dt>当前市值</dt>
          <dd><MoneyText :cents="detailAsset.value_cents" size="lg" /></dd>
        </div>
        <div class="detail__row">
          <dt>类型</dt>
          <dd>{{ detailAsset.kind || '未分类' }}</dd>
        </div>
        <div class="detail__row">
          <dt>归属</dt>
          <dd>{{ memberName(members, detailAsset.member_id) }}</dd>
        </div>
        <div class="detail__row">
          <dt>最后更新</dt>
          <dd>{{ updatedLabel(detailAsset) }}</dd>
        </div>
      </dl>

      <section class="history">
        <h3 class="history__title">市值记录</h3>
        <div v-if="snapshotsLoading || snapshotsError" class="history__status" data-snapshot-status>
          <span v-if="snapshotsLoading">正在更新市值记录…</span>
          <template v-if="snapshotsError">
            <span role="alert">{{ snapshotsError }}</span>
            <button type="button" class="btn" @click="retrySnapshots">重试市值记录</button>
          </template>
        </div>
        <p v-if="!snapshotsLoading && !snapshotsError && snapshots.length === 0" class="history__empty">
          还没有记过市值
        </p>
        <ul v-if="snapshots.length > 0" class="history__list">
          <li v-for="s in snapshots" :key="s.id" class="history__row">
            <span class="history__month">{{ monthLabel(s.month) }}</span>
            <MoneyText :cents="s.value_cents" class="history__value" />
            <span v-if="s.note" class="history__note">{{ s.note }}</span>
            <button
              type="button"
              class="history__del"
              style="width: 44px; height: 44px"
              aria-label="删除这条市值记录"
              @click="removeSnapshot(s.id)"
            >
              ×
            </button>
          </li>
        </ul>
      </section>

      <div class="detail__actions">
        <button type="button" class="btn btn--primary" @click="openSnapshotForm(detailAsset!)">
          更新市值
        </button>
        <button type="button" class="btn" @click="editAssetFromDetail(detailAsset!)">编辑</button>
        <button type="button" class="btn btn--danger" @click="askDeleteAsset(detailAsset!.id)">
          删除
        </button>
      </div>
    </AppSheet>

    <AccountForm
      v-if="accountFormOpen"
      :mode="accountFormMode"
      :initial="accountFormInitial"
      :members="members"
      @close="accountFormOpen = false"
      @saved="onAccountSaved"
    />

    <AssetForm
      v-if="assetFormOpen"
      :mode="assetFormInitial ? 'edit' : 'create'"
      :initial="assetFormInitial"
      :members="members"
      @close="assetFormOpen = false"
      @saved="onAssetSaved"
    />

    <AssetSnapshotForm
      v-if="snapshotFormAsset"
      :asset="snapshotFormAsset"
      @close="snapshotFormAsset = null"
      @saved="onSnapshotSaved"
    />

    <ConfirmDialog
      v-if="confirmDeleteAccountId !== null"
      title="删除账户"
      description="删除后不可恢复，确认删除？"
      confirm-text="删除"
      @confirm="doDeleteAccount"
      @cancel="confirmDeleteAccountId = null"
    />

    <ConfirmDialog
      v-if="confirmDeleteAssetId !== null"
      title="删除资产"
      description="删除后不可恢复，确认删除？"
      confirm-text="删除"
      @confirm="doDeleteAsset"
      @cancel="confirmDeleteAssetId = null"
    />
  </div>
</template>

<style scoped>
.assets {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}

.assets__status,
.history__status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  color: var(--expense-deep);
  font-size: var(--text-sm);
}

.assets__status {
  padding: var(--sp-3);
  border: 1px solid var(--expense);
  border-radius: var(--radius-sm);
  background: var(--expense-wash);
}

.asset-groups {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--sp-5);
  align-items: start;
}

.asset-groups :deep(.section) {
  margin-top: 0;
  min-width: 0;
}

@media (max-width: 600px) {
  .asset-groups :deep(.section__head) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .asset-groups :deep(.section__head .segmented) {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .assets :deep(.summary-strip) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    row-gap: var(--sp-3);
  }

  .assets :deep(.summary-strip__primary) {
    grid-column: 1 / -1;
  }

  .assets :deep(.summary-strip__secondary:nth-child(2)) {
    padding-left: 0;
    border-left: 0;
  }
}

@media (min-width: 1024px) {
  .asset-groups {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.row--static {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px var(--sp-3);
}

.row--static .row__title {
  font-size: var(--text-base);
}

/* 市值记录：一条一行，删除只在悬停/聚焦时才明显 */
.history {
  margin-top: var(--sp-5);
}

.history__title {
  margin: 0 0 var(--sp-2);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--ink-2);
  letter-spacing: 0.06em;
}

.history__empty {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--ink-2);
}

.history__status {
  min-height: 44px;
  margin-bottom: var(--sp-2);
}

.history__list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 220px;
  overflow-y: auto;
}

.history__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 7px 0;
  border-bottom: 1px solid var(--rule-soft);
  font-size: var(--text-sm);
}

.history__row:last-child {
  border-bottom: none;
}

.history__month {
  flex: none;
  width: 84px;
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}

.history__value {
  flex: none;
  min-width: 96px;
  text-align: right;
}

.history__note {
  flex: 1;
  min-width: 0;
  color: var(--ink-2);
  font-size: var(--text-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history__del {
  flex: none;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--ink-2);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  opacity: 0.5;
  transition:
    opacity var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}

.history__del:hover {
  opacity: 1;
  background: var(--expense-wash);
  color: var(--expense-deep);
}
</style>
