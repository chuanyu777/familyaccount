<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import MoneyText from '../../components/MoneyText.vue';
import StatHero from '../../components/StatHero.vue';
import SegmentedControl from '../../components/SegmentedControl.vue';
import SectionBlock from '../../components/SectionBlock.vue';
import EmptyState from '../../components/EmptyState.vue';
import AppSheet from '../../components/AppSheet.vue';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import AccountForm from './AccountForm.vue';
import AssetForm from './AssetForm.vue';
import AssetSnapshotForm from './AssetSnapshotForm.vue';
import { cachedGet, apiPost, apiDelete, ApiError } from '../../lib/api';
import { revision } from '../../lib/revision';
import { monthLabel } from '../../lib/format';
import { memberName } from './util';
import type { Account, Asset, AssetSnapshot, Member, Summary } from './types';

const EMPTY_SUMMARY: Summary = {
  totalAssetsCents: 0,
  totalLiabilitiesCents: 0,
  netWorthCents: 0,
  monthlyPaymentTotalCents: 0,
  accountsTotalCents: 0,
  assetsTotalCents: 0,
};

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

const summary = ref<Summary>(EMPTY_SUMMARY);
const accounts = ref<Account[]>([]);
const assets = ref<Asset[]>([]);
const members = ref<Member[]>([]);
const loading = ref(false);

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
const detailSnapshots = ref<AssetSnapshot[]>([]);

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

async function load(force = false) {
  loading.value = true;
  try {
    const [s, a, as, m] = await Promise.all([
      cachedGet<Summary>('/api/stats/summary', undefined, { force }),
      cachedGet<Account[]>('/api/accounts', undefined, { force }),
      cachedGet<Asset[]>('/api/assets', undefined, { force }),
      cachedGet<Member[]>('/api/members', undefined, { force }),
    ]);
    summary.value = s ?? EMPTY_SUMMARY;
    accounts.value = a ?? [];
    assets.value = as ?? [];
    members.value = m ?? [];
  } catch {
    summary.value = EMPTY_SUMMARY;
    accounts.value = [];
    assets.value = [];
    members.value = [];
  } finally {
    loading.value = false;
  }
}

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
  detailSnapshots.value = [];
  try {
    detailSnapshots.value = (await cachedGet<AssetSnapshot[]>(`/api/assets/${a.id}/snapshots`)) ?? [];
  } catch {
    detailSnapshots.value = [];
  }
}

function openSnapshotForm(a: Asset) {
  detailAsset.value = null;
  snapshotFormAsset.value = a;
}

async function onSnapshotSaved() {
  snapshotFormAsset.value = null;
  await load(true);
}

async function removeSnapshot(id: number) {
  try {
    await apiDelete(`/api/assets/snapshots/${id}`);
    if (detailAsset.value) await openAssetDetail(detailAsset.value);
    await load(true);
  } catch {
    /* 删除失败保持原样 */
  }
}

function onAccountSaved() {
  accountFormOpen.value = false;
  void load(true);
}

function onAssetSaved() {
  assetFormOpen.value = false;
  void load(true);
}

async function setDefault(id: number) {
  detailAccount.value = null;
  try {
    await apiPost(`/api/accounts/${id}/set-default`, {});
    await load(true);
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
    await load(true);
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
    await load(true);
  } catch {
    /* 删除失败保持列表 */
  }
}

function updatedLabel(a: Asset): string {
  if (!a.updated_at) return '未更新';
  return String(a.updated_at).slice(0, 10);
}

// 别的地方（记一笔、还一笔…）动了数据也会 bump revision，这里跟着刷新
watch(revision, () => void load(true));

onMounted(() => void load());
</script>

<template>
  <div class="assets">
    <StatHero
      label="净资产"
      :cents="summary.netWorthCents"
      :tone="summary.netWorthCents < 0 ? 'expense' : 'neutral'"
      :bubbles="[
        { label: '总资产', cents: summary.totalAssetsCents, tone: 'income' },
        { label: '总负债', cents: -summary.totalLiabilitiesCents, tone: 'expense' },
      ]"
    >
      <p class="hero-split">
        资金账户 <MoneyText :cents="summary.accountsTotalCents" /> · 资产项
        <MoneyText :cents="summary.assetsTotalCents" />
      </p>
    </StatHero>

    <SectionBlock title="资金账户">
      <template #aside>
        <button type="button" class="btn btn--sm" @click="openAccount()">新增账户</button>
      </template>

      <p v-if="accountError" class="form-error">{{ accountError }}</p>

      <div v-if="accounts.length === 0" class="card card--flush">
        <EmptyState title="还没有资金账户" hint="点「新增账户」记下你的第一个账户。" mark="○" />
      </div>

      <ul v-else class="list">
        <li v-for="a in accounts" :key="a.id">
          <button type="button" class="row card" @click="detailAccount = a">
            <span class="row__bubble" aria-hidden="true">{{ a.name.slice(0, 1) }}</span>
            <span class="row__main">
              <span class="row__title">
                {{ a.name }}
                <span v-if="a.is_default" class="tag">默认</span>
              </span>
              <span class="row__meta">
                <span>{{ memberName(members, a.member_id) }}</span>
                <span v-if="a.balance_cents < 0" class="tag tag--expense">余额为负</span>
              </span>
            </span>
            <MoneyText
              :cents="a.balance_cents"
              :tone="a.balance_cents < 0 ? 'expense' : 'neutral'"
              class="row__amount"
            />
          </button>
        </li>
      </ul>
    </SectionBlock>

    <SectionBlock title="资产项">
      <template #aside>
        <SegmentedControl v-model="assetView" :options="VIEW_OPTIONS" label="资产视图" />
        <button type="button" class="btn btn--sm" @click="openAsset()">新增资产</button>
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

      <div v-else>
        <div v-if="assets.length === 0" class="card card--flush">
          <EmptyState title="还没有资产项" hint="点「新增资产」记录房产、投资等市值。" mark="○" />
        </div>

        <ul v-else class="list">
          <li v-for="a in assets" :key="a.id">
            <button type="button" class="row card" @click="openAssetDetail(a)">
              <span class="row__bubble" aria-hidden="true">{{ (a.kind || a.name).slice(0, 1) }}</span>
              <span class="row__main">
                <span class="row__title">{{ a.name }}</span>
                <span class="row__meta">
                  <span>{{ a.kind || '未分类' }}</span>
                  <span>{{ memberName(members, a.member_id) }}</span>
                </span>
              </span>
              <MoneyText :cents="a.value_cents" class="row__amount" />
            </button>
          </li>
        </ul>
      </div>
    </SectionBlock>

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
        <p v-if="detailSnapshots.length === 0" class="history__empty">还没有记过市值</p>
        <ul v-else class="history__list">
          <li v-for="s in detailSnapshots" :key="s.id" class="history__row">
            <span class="history__month">{{ monthLabel(s.month) }}</span>
            <MoneyText :cents="s.value_cents" class="history__value" />
            <span v-if="s.note" class="history__note">{{ s.note }}</span>
            <button
              type="button"
              class="history__del"
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
}

.hero-split {
  margin-top: var(--sp-2);
  font-size: var(--text-xs);
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  padding: 11px var(--sp-3);
  text-align: left;
  cursor: pointer;
  transition: transform var(--dur-fast) var(--ease-out);
}

.row:active {
  transform: scale(0.98);
}

.row__bubble {
  flex: none;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  background: var(--brand-wash);
  color: var(--brand-2);
  font-size: var(--text-sm);
}

/* 汇总行不可点，去掉交互反馈 */
.row--static {
  cursor: default;
  justify-content: space-between;
}

.row--static:active {
  transform: none;
}

.row__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row__title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: var(--text-base);
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row__meta {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row__amount {
  flex: none;
  font-size: var(--text-lg);
  font-weight: 500;
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
  width: 28px;
  height: 28px;
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
