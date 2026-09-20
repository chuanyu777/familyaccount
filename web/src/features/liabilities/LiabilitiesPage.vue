<script setup lang="ts">
import { computed, ref } from 'vue';
import PageHeader from '../../components/PageHeader.vue';
import SummaryStrip, { type SummaryMetric } from '../../components/SummaryStrip.vue';
import SectionBlock from '../../components/SectionBlock.vue';
import AsyncState from '../../components/AsyncState.vue';
import AppSheet from '../../components/AppSheet.vue';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import MoneyText from '../../components/MoneyText.vue';
import { apiDelete } from '../../lib/api';
import LiabilityForm from './LiabilityForm.vue';
import LiabilityList from './LiabilityList.vue';
import RepaymentForm from './RepaymentForm.vue';
import RepaymentList from './RepaymentList.vue';
import { useLiabilities } from './useLiabilities';
import { memberName, parseYuanToCents } from './util';
import type { Liability } from './types';

const {
  summary,
  liabilities,
  repayments,
  accounts,
  members,
  loading,
  error,
  repaymentsLoading,
  repaymentsError,
  reload,
  loadRepayments,
  reloadRepayments,
} = useLiabilities();

const totalMetric = computed<SummaryMetric>(() => ({
  label: '总负债',
  cents: -summary.value.totalLiabilitiesCents,
  tone: 'expense',
}));
const monthlyMetric = computed<SummaryMetric>(() => ({
  label: '月供合计',
  cents: -summary.value.monthlyPaymentTotalCents,
  tone: 'expense',
}));

const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const formInitial = ref<Liability | undefined>(undefined);
const repayLiability = ref<Liability | null>(null);
const detailLiabilityId = ref<number | null>(null);
const confirmDeleteId = ref<number | null>(null);
const confirmDeleteRepayId = ref<number | null>(null);
const mutationError = ref<string | null>(null);

const detailLiability = computed(
  () => liabilities.value.find(({ id }) => id === detailLiabilityId.value) ?? null,
);

function remainingCents(liability: Liability): number {
  return parseYuanToCents(liability.remaining) ?? 0;
}

function monthlyCents(liability: Liability): number {
  return parseYuanToCents(liability.monthlyPayment) ?? 0;
}

function openForm(initial?: Liability) {
  formMode.value = initial ? 'edit' : 'create';
  formInitial.value = initial;
  formOpen.value = true;
}

async function openDetail(liability: Liability) {
  detailLiabilityId.value = liability.id;
  await loadRepayments(liability.id);
}

function editFromDetail(liability: Liability) {
  detailLiabilityId.value = null;
  openForm(liability);
}

function openRepayment(liability: Liability) {
  repayLiability.value = liability;
}

function repayFromDetail(liability: Liability) {
  detailLiabilityId.value = null;
  openRepayment(liability);
}

function askDeleteLiability(id: number) {
  mutationError.value = null;
  detailLiabilityId.value = null;
  confirmDeleteId.value = id;
}

async function doDeleteLiability() {
  const id = confirmDeleteId.value;
  if (id == null) return;
  mutationError.value = null;
  try {
    await apiDelete(`/api/liabilities/${id}`);
    confirmDeleteId.value = null;
  } catch (cause) {
    mutationError.value = cause instanceof Error ? cause.message : '删除负债失败';
  }
}

function askDeleteRepayment(id: number) {
  mutationError.value = null;
  confirmDeleteRepayId.value = id;
}

async function doDeleteRepayment() {
  const id = confirmDeleteRepayId.value;
  if (id == null) return;
  mutationError.value = null;
  try {
    await apiDelete(`/api/repayments/${id}`);
    confirmDeleteRepayId.value = null;
  } catch (cause) {
    mutationError.value = cause instanceof Error ? cause.message : '删除还款失败';
  }
}
</script>

<template>
  <div class="liabilities">
    <PageHeader title="负债" context="本金与还款计划">
      <button type="button" class="btn btn--primary" @click="openForm()">新增负债</button>
    </PageHeader>

    <SummaryStrip :primary="totalMetric" :secondary="[monthlyMetric]" />

    <p v-if="mutationError" class="form-error liabilities__mutation-error" role="alert">
      {{ mutationError }}
    </p>

    <SectionBlock title="负债明细">
      <AsyncState
        :loading="loading"
        :error="error ?? ''"
        :empty="liabilities.length === 0"
        empty-title="还没有负债"
        empty-hint="点「新增负债」记录房贷、车贷等。"
        @retry="reload"
      >
        <LiabilityList
          :liabilities="liabilities"
          :repayments="repayments"
          :members="members"
          @select="openDetail"
          @repay="openRepayment"
        />
      </AsyncState>
    </SectionBlock>

    <AppSheet v-if="detailLiability" :title="detailLiability.name" @close="detailLiabilityId = null">
      <dl class="detail">
        <div class="detail__row">
          <dt>剩余本金</dt>
          <dd><MoneyText :cents="remainingCents(detailLiability)" tone="expense" size="lg" /></dd>
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

      <section class="repayment-history">
        <h3 class="repayment-history__title">还款记录</h3>
        <AsyncState
          :loading="repaymentsLoading"
          :error="repaymentsError ?? ''"
          :empty="repayments.length === 0"
          empty-title="暂无还款记录"
          @retry="reloadRepayments"
        >
          <RepaymentList
            :repayments="repayments"
            :accounts="accounts"
            @delete="askDeleteRepayment"
          />
        </AsyncState>
      </section>

      <div class="detail__actions">
        <button type="button" class="btn btn--primary" @click="repayFromDetail(detailLiability)">
          还一笔
        </button>
        <button type="button" class="btn" @click="editFromDetail(detailLiability)">编辑</button>
        <button type="button" class="btn btn--danger" @click="askDeleteLiability(detailLiability.id)">
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
      @saved="formOpen = false"
    />

    <RepaymentForm
      v-if="repayLiability"
      :liability="repayLiability"
      :accounts="accounts"
      @close="repayLiability = null"
      @saved="repayLiability = null"
    />

    <ConfirmDialog
      v-if="confirmDeleteId !== null"
      title="删除负债"
      description="删除后不可恢复，相关还款历史也会被删除，对应账户余额和还款流水将一并回滚。"
      confirm-text="删除"
      @confirm="doDeleteLiability"
      @cancel="confirmDeleteId = null"
    />

    <ConfirmDialog
      v-if="confirmDeleteRepayId !== null"
      title="删除还款"
      description="删除后将恢复负债本金和账户余额，并删除对应还款流水。"
      confirm-text="删除"
      @confirm="doDeleteRepayment"
      @cancel="confirmDeleteRepayId = null"
    />
  </div>
</template>

<style scoped>
.liabilities { display: flex; flex-direction: column; }
.liabilities__mutation-error { margin: var(--sp-2) 0 0; }
.repayment-history { margin-top: var(--sp-4); }
.repayment-history__title { margin: 0 0 var(--sp-2); color: var(--ink); font-size: var(--text-sm); font-weight: 600; }
</style>
