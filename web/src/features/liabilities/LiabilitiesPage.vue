<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import MoneyText from '../../components/MoneyText.vue';
import StatHero from '../../components/StatHero.vue';
import SectionBlock from '../../components/SectionBlock.vue';
import EmptyState from '../../components/EmptyState.vue';
import AppSheet from '../../components/AppSheet.vue';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import LiabilityForm from './LiabilityForm.vue';
import RepaymentForm from './RepaymentForm.vue';
import RepaymentList from './RepaymentList.vue';
import { cachedGet, apiDelete, ApiError } from '../../lib/api';
import { revision } from '../../lib/revision';
import { memberName, parseYuanToCents } from './util';
import type { Account, Liability, Member, Repayment, Summary } from './types';

const EMPTY_SUMMARY: Summary = {
  totalAssetsCents: 0,
  totalLiabilitiesCents: 0,
  netWorthCents: 0,
  monthlyPaymentTotalCents: 0,
  accountsTotalCents: 0,
  assetsTotalCents: 0,
};

const summary = ref<Summary>(EMPTY_SUMMARY);
const liabilities = ref<Liability[]>([]);
const accounts = ref<Account[]>([]);
const members = ref<Member[]>([]);
const repaymentsMap = ref<Record<number, Repayment[]>>({});
const loading = ref(false);

const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const formInitial = ref<Liability | undefined>(undefined);
const repayLiability = ref<Liability | null>(null);
/** 编辑、删除收进详情弹层，列表只留「还一笔」这个高频动作 */
const detailLiability = ref<Liability | null>(null);
const confirmDeleteId = ref<number | null>(null);
const confirmDeleteRepayId = ref<number | null>(null);

const repaymentsOf = (id: number): Repayment[] => repaymentsMap.value[id] ?? [];

function remainingCents(l: Liability): number {
  return parseYuanToCents(l.remaining) ?? 0;
}

function monthlyCents(l: Liability): number {
  return parseYuanToCents(l.monthlyPayment) ?? 0;
}

/** 已还比例：已还 / (已还 + 剩余)，驱动行卡上的进度条 */
function progressOf(l: Liability): number {
  const repaid = repaymentsOf(l.id).reduce((sum, r) => sum + r.amount_cents, 0);
  const total = repaid + remainingCents(l);
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, repaid / total));
}

function repaidCents(l: Liability): number {
  return repaymentsOf(l.id).reduce((sum, r) => sum + r.amount_cents, 0);
}

async function load(force = false) {
  loading.value = true;
  try {
    const [s, ls, acc, mem] = await Promise.all([
      cachedGet<Summary>('/api/stats/summary', undefined, { force }),
      cachedGet<Liability[]>('/api/liabilities', undefined, { force }),
      cachedGet<Account[]>('/api/accounts', undefined, { force }),
      cachedGet<Member[]>('/api/members', undefined, { force }),
    ]);
    const safeLs = ls ?? [];
    const safeAcc = acc ?? [];
    const safeMem = mem ?? [];
    const reps = await Promise.all(
      safeLs.map((l) =>
        cachedGet<Repayment[]>('/api/repayments', { liabilityId: l.id }, { force }).catch(
          () => [] as Repayment[]
        ),
      ),
    );
    const map: Record<number, Repayment[]> = {};
    safeLs.forEach((l, i) => {
      map[l.id] = reps[i] ?? [];
    });
    summary.value = s ?? EMPTY_SUMMARY;
    liabilities.value = safeLs;
    accounts.value = safeAcc;
    members.value = safeMem;
    repaymentsMap.value = map;
  } catch {
    summary.value = EMPTY_SUMMARY;
    liabilities.value = [];
    accounts.value = [];
    members.value = [];
    repaymentsMap.value = {};
  } finally {
    loading.value = false;
  }
}

function openForm(initial?: Liability) {
  formMode.value = initial ? 'edit' : 'create';
  formInitial.value = initial;
  formOpen.value = true;
}

function editFromDetail(l: Liability) {
  detailLiability.value = null;
  openForm(l);
}

function onFormSaved() {
  formOpen.value = false;
  void load(true);
}

function openRepay(l: Liability) {
  repayLiability.value = l;
}

function repayFromDetail(l: Liability) {
  detailLiability.value = null;
  openRepay(l);
}

function onRepaySaved() {
  repayLiability.value = null;
  void load(true);
}

function askDeleteLiability(id: number) {
  detailLiability.value = null;
  confirmDeleteId.value = id;
}

async function doDeleteLiability() {
  const id = confirmDeleteId.value;
  confirmDeleteId.value = null;
  if (id == null) return;
  try {
    await apiDelete(`/api/liabilities/${id}`);
    await load(true);
  } catch {
    /* 删除失败保持列表 */
  }
}

function askDeleteRepayment(id: number) {
  confirmDeleteRepayId.value = id;
}

async function doDeleteRepayment() {
  const id = confirmDeleteRepayId.value;
  confirmDeleteRepayId.value = null;
  if (id == null) return;
  try {
    await apiDelete(`/api/repayments/${id}`);
    await load(true);
  } catch {
    /* 删除失败保持列表 */
  }
}

// 别处动了数据也会 bump revision，这里跟着刷新
watch(revision, () => void load(true));

onMounted(() => void load());
</script>

<template>
  <div class="liabilities">
    <StatHero
      label="总负债"
      :cents="-summary.totalLiabilitiesCents"
      tone="expense"
      :bubbles="[{ label: '月供合计', cents: -summary.monthlyPaymentTotalCents, tone: 'expense' }]"
    />

    <SectionBlock title="负债">
      <template #aside>
        <button type="button" class="btn btn--sm" @click="openForm()">新增负债</button>
      </template>

      <div v-if="liabilities.length === 0" class="card card--flush">
        <EmptyState title="还没有负债" hint="点「新增负债」记录房贷、车贷等。" mark="○" />
      </div>

      <ul v-else class="list">
        <li v-for="l in liabilities" :key="l.id" class="liab card">
          <button type="button" class="liab__hit" @click="detailLiability = l">
            <span class="liab__main">
              <span class="liab__title">{{ l.name }}</span>
              <span class="liab__meta">
                <span>月供 <MoneyText :cents="monthlyCents(l)" tone="expense" /></span>
                <span v-if="l.payment_day">{{ l.payment_day }} 日/月</span>
                <span>{{ memberName(members, l.member_id) }}</span>
              </span>
              <span class="liab__progress" role="img" :aria-label="`已还 ${Math.round(progressOf(l) * 100)}%`">
                <span class="liab__progress-fill" :style="{ width: `${progressOf(l) * 100}%` }" />
              </span>
              <span class="liab__progress-meta">
                已还 <MoneyText :cents="repaidCents(l)" tone="income" />
                （{{ Math.round(progressOf(l) * 100) }}%）
              </span>
            </span>
            <span class="liab__amount">
              <span class="liab__amount-label">剩余</span>
              <MoneyText :cents="remainingCents(l)" tone="expense" class="liab__amount-value" />
            </span>
          </button>
          <button type="button" class="btn btn--sm liab__repay" @click="openRepay(l)">
            还一笔
          </button>
        </li>
      </ul>
    </SectionBlock>

    <AppSheet v-if="detailLiability" :title="detailLiability.name" @close="detailLiability = null">
      <dl class="detail">
        <div class="detail__row">
          <dt>剩余本金</dt>
          <dd>
            <MoneyText :cents="remainingCents(detailLiability)" tone="expense" size="lg" />
          </dd>
        </div>
        <div class="detail__row">
          <dt>每月还款</dt>
          <dd><MoneyText :cents="monthlyCents(detailLiability)" tone="expense" /></dd>
        </div>
        <div class="detail__row">
          <dt>还款日</dt>
          <dd>{{ detailLiability.payment_day ? `每月 ${detailLiability.payment_day} 日` : '未设置' }}</dd>
        </div>
        <div class="detail__row">
          <dt>归属</dt>
          <dd>{{ memberName(members, detailLiability.member_id) }}</dd>
        </div>
      </dl>

      <div class="reps">
        <p v-if="repaymentsOf(detailLiability.id).length > 0" class="reps__title">还款记录</p>
        <RepaymentList
          :repayments="repaymentsOf(detailLiability.id)"
          :accounts="accounts"
          @delete="askDeleteRepayment"
        />
      </div>

      <div class="detail__actions">
        <button type="button" class="btn btn--primary" @click="repayFromDetail(detailLiability!)">
          还一笔
        </button>
        <button type="button" class="btn" @click="editFromDetail(detailLiability!)">编辑</button>
        <button type="button" class="btn btn--danger" @click="askDeleteLiability(detailLiability!.id)">
          删除
        </button>
      </div>
    </AppSheet>

    <LiabilityForm
      v-if="formOpen"
      :mode="formMode"
      :initial="formInitial"
      :members="members"
      @close="formOpen = false"
      @saved="onFormSaved"
    />

    <RepaymentForm
      v-if="repayLiability"
      :liability="repayLiability"
      :accounts="accounts"
      @close="repayLiability = null"
      @saved="onRepaySaved"
    />

    <ConfirmDialog
      v-if="confirmDeleteId !== null"
      title="删除负债"
      description="删除后不可恢复，且会回滚相关还款记录，确认删除？"
      confirm-text="删除"
      @confirm="doDeleteLiability"
      @cancel="confirmDeleteId = null"
    />

    <ConfirmDialog
      v-if="confirmDeleteRepayId !== null"
      title="删除还款"
      description="删除后负债本金与账户余额将回滚，确认删除？"
      confirm-text="删除"
      @confirm="doDeleteRepayment"
      @cancel="confirmDeleteRepayId = null"
    />
  </div>
</template>

<style scoped>
.liabilities {
  display: flex;
  flex-direction: column;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.liab {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3);
}

.liab__hit {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
}

.liab__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.liab__title {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.liab__meta {
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

/* 还款进度条：焦糖填充、浅底 */
.liab__progress {
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--paper-sunken);
  overflow: hidden;
}

.liab__progress-fill {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--brand-2);
  transition: width var(--dur) var(--ease-out);
}

.liab__progress-meta {
  font-size: var(--text-xs);
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}

.liab__amount {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.35;
}

.liab__amount-label {
  font-size: var(--text-xs);
  color: var(--ink-2);
  letter-spacing: 0.06em;
}

.liab__amount-value {
  font-size: var(--text-lg);
  font-weight: 500;
}

.liab__repay {
  flex: none;
  align-self: flex-start;
}

.reps {
  margin-top: var(--sp-4);
}

.reps__title {
  font-size: var(--text-xs);
  color: var(--ink-2);
  letter-spacing: 0.06em;
}
</style>
