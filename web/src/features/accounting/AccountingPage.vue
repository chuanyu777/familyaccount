<script setup lang="ts">
import { computed, ref } from 'vue';
import { Plus, SlidersHorizontal } from 'lucide-vue-next';
import AppSheet from '../../components/AppSheet.vue';
import AsyncState from '../../components/AsyncState.vue';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import MoneyText from '../../components/MoneyText.vue';
import MonthPicker from '../../components/MonthPicker.vue';
import PageHeader from '../../components/PageHeader.vue';
import SummaryStrip, { type SummaryMetric } from '../../components/SummaryStrip.vue';
import { apiDelete } from '../../lib/api';
import { monthLabel } from '../../lib/format';
import { showToast } from '../../lib/toast';
import TransactionForm from './TransactionForm.vue';
import TransactionList from './TransactionList.vue';
import TransactionTable from './TransactionTable.vue';
import { useTransactions, type TransactionTypeFilter } from './useTransactions';
import type { Category, Transaction } from './types';

const TYPE_OPTIONS: { value: TransactionTypeFilter; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '转账' },
];

const {
  month,
  type,
  accountFilter,
  memberFilter,
  items,
  totals,
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
  reloadReferences,
  loadMore,
  reload,
} = useTransactions();

const showMoreFilters = ref(false);
const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const formInitial = ref<Transaction | undefined>(undefined);
const detailId = ref<number | null>(null);
const confirmDeleteId = ref<number | null>(null);
const deletePending = ref(false);
const deleteError = ref<string | null>(null);
const ledgerTitle = computed(() => `${Number(month.value.slice(5))}月账本`);
const retainedLabel = computed(() => {
  const query = retainedQuery.value;
  if (!query) return '';
  return [
    monthLabel(query.month),
    TYPE_OPTIONS.find(({ value }) => value === query.type)?.label,
    query.accountFilter ? accounts.value.find(({ id }) => String(id) === query.accountFilter)?.name ?? `账户 ${query.accountFilter}` : '全部账户',
    query.memberFilter ? members.value.find(({ id }) => String(id) === query.memberFilter)?.name ?? `成员 ${query.memberFilter}` : '全部成员',
  ].join(' · ');
});

const netMetric = computed<SummaryMetric>(() => ({
  label: retainedQuery.value ? `${monthLabel(retainedQuery.value.month)}结余` : '本月结余',
  cents: totals.value.net,
  tone: totals.value.net < 0 ? 'expense' : 'income',
}));
const incomeMetric = computed<SummaryMetric>(() => ({
  label: '收入',
  cents: totals.value.income,
  tone: 'income',
}));
const expenseMetric = computed<SummaryMetric>(() => ({
  label: '支出',
  cents: -totals.value.expense,
  tone: 'expense',
}));
const detailTransaction = computed(
  () => items.value.find((transaction) => transaction.id === detailId.value) ?? null,
);

function openCreate() {
  formMode.value = 'create';
  formInitial.value = undefined;
  formOpen.value = true;
}

function openDetail(transaction: Transaction) {
  detailId.value = transaction.id;
}

function openEdit(transaction: Transaction) {
  detailId.value = null;
  formMode.value = 'edit';
  formInitial.value = transaction;
  formOpen.value = true;
}

function handleSaved() {
  formOpen.value = false;
  showToast(formMode.value === 'edit' ? '已更新' : '已记一笔');
}

function handleCreatedCategory(category: Category) {
  if (category.kind === 'income') {
    if (!incomeCategories.value.some(({ id }) => id === category.id)) {
      incomeCategories.value = [...incomeCategories.value, category];
    }
  } else {
    if (!expenseCategories.value.some(({ id }) => id === category.id)) {
      expenseCategories.value = [...expenseCategories.value, category];
    }
  }
}

async function doDelete() {
  if (confirmDeleteId.value == null || deletePending.value) return;
  deletePending.value = true;
  deleteError.value = null;
  try {
    await apiDelete(`/api/transactions/${confirmDeleteId.value}`);
    confirmDeleteId.value = null;
    showToast('已删除');
  } catch (cause) {
    deleteError.value = cause instanceof Error ? cause.message : '删除失败，请重试';
  } finally {
    deletePending.value = false;
  }
}

function cancelDelete() {
  if (deletePending.value) return;
  confirmDeleteId.value = null;
  deleteError.value = null;
}

function sourceOf(transaction: Transaction): string {
  if (transaction.type === 'transfer') {
    return `${transaction.accountName ?? ''} → ${transaction.toAccountName ?? ''}`;
  }
  // 还款自动生成的账目统一显示为「还款」，不再借用「其他」
  if (transaction.sourceType === 'repayment') return '还款';
  return transaction.categoryName || '未分类';
}

function toneOf(transaction: Transaction): 'income' | 'expense' | 'neutral' {
  if (transaction.type === 'transfer') return 'neutral';
  return transaction.type;
}

function signedCents(transaction: Transaction): number {
  return transaction.type === 'expense' ? -transaction.amountCents : transaction.amountCents;
}
</script>

<template>
  <div class="accounting">
    <PageHeader :title="ledgerTitle">
      <div class="accounting__header-actions">
        <MonthPicker v-model="month" />
        <button type="button" class="btn btn--primary desktop-create" @click="openCreate">
          记一笔
        </button>
      </div>
    </PageHeader>

    <p v-if="retainedQuery" class="accounting__refreshing" data-retained-query aria-live="polite">
      当前显示{{ retainedLabel }}的数据；所选条件{{ error ? '加载失败，请重试' : '加载中…' }}
    </p>

    <SummaryStrip
      class="accounting__summary"
      :primary="netMetric"
      :secondary="[incomeMetric, expenseMetric]"
    />

    <div v-if="referenceLoading || referenceError" class="accounting__references" data-reference-status :aria-busy="referenceLoading">
      <p v-if="referenceLoading" role="status">正在加载账户、成员与分类…</p>
      <div v-if="referenceError" class="async-error" role="alert">
        <span>{{ referenceError }}</span>
        <button type="button" class="btn" :disabled="referenceLoading" @click="reloadReferences">重试基础信息</button>
      </div>
    </div>

    <div class="accounting__filters">
      <div class="filterbar" role="group" aria-label="流水类型">
        <button
          v-for="option in TYPE_OPTIONS"
          :key="option.value"
          type="button"
          class="filterbar__type"
          :aria-pressed="type === option.value"
          @click="type = option.value"
        >
          {{ option.label }}
        </button>
        <button
          type="button"
          class="filterbar__more"
          aria-label="更多筛选"
          :aria-expanded="showMoreFilters"
          @click="showMoreFilters = !showMoreFilters"
        >
          <SlidersHorizontal :size="17" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </div>

      <div v-if="showMoreFilters" class="filtergrid">
        <label class="field">
          <span class="field__label">账户</span>
          <select v-model="accountFilter" class="field__control" aria-label="筛选账户">
            <option value="">全部账户</option>
            <option v-for="account in accounts" :key="account.id" :value="String(account.id)">
              {{ account.name }}
            </option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">成员</span>
          <select v-model="memberFilter" class="field__control" aria-label="筛选成员">
            <option value="">全部成员</option>
            <option v-for="member in members" :key="member.id" :value="String(member.id)">
              {{ member.name }}
            </option>
          </select>
        </label>
      </div>
    </div>

    <p v-if="refreshing" class="accounting__refreshing" aria-live="polite">正在更新流水…</p>

    <AsyncState
      :loading="loading"
      :error="error ?? ''"
      :empty="items.length === 0"
      empty-title="本月还没有记过账"
      empty-hint="点右下角的记账按钮，先记下今天的第一笔。"
      @retry="reload"
    >
      <div class="desktop-only">
        <TransactionTable :items="items" @select="openDetail" />
      </div>
      <div class="mobile-only">
        <TransactionList :items="items" @select="openDetail" />
      </div>
    </AsyncState>

    <button
      v-if="hasMore"
      type="button"
      class="btn btn--block accounting__more"
      :disabled="refreshing"
      @click="loadMore"
    >
      {{ refreshing ? '载入中…' : '载入更早的账目' }}
    </button>

    <button type="button" class="fab accounting__fab" aria-label="记一笔" @click="openCreate">
      <Plus :size="22" :stroke-width="2.2" aria-hidden="true" />
    </button>

    <AppSheet
      v-if="detailTransaction"
      :title="detailTransaction.type === 'transfer' ? '转账' : '账目详情'"
      @close="detailId = null"
    >
      <dl class="detail">
        <div class="detail__row">
          <dt>金额</dt>
          <dd>
            <MoneyText
              :cents="signedCents(detailTransaction)"
              :tone="toneOf(detailTransaction)"
              size="lg"
            />
          </dd>
        </div>
        <div class="detail__row">
          <dt>日期</dt>
          <dd>{{ detailTransaction.occurredOn }}</dd>
        </div>
        <div class="detail__row">
          <dt>{{ detailTransaction.type === 'transfer' ? '账户' : '分类' }}</dt>
          <dd>{{ sourceOf(detailTransaction) }}</dd>
        </div>
        <div v-if="detailTransaction.type !== 'transfer'" class="detail__row">
          <dt>账户</dt>
          <dd>{{ detailTransaction.accountName }}</dd>
        </div>
        <div class="detail__row">
          <dt>成员</dt>
          <dd>{{ detailTransaction.memberName || '家庭共有' }}</dd>
        </div>
        <div v-if="detailTransaction.note" class="detail__row">
          <dt>备注</dt>
          <dd>{{ detailTransaction.note }}</dd>
        </div>
      </dl>

      <p v-if="detailTransaction.sourceType === 'repayment'" class="accounting__repayment-note">
        这笔由还款自动生成，要改动请到「负债」里删除对应还款。
      </p>

      <div v-else class="detail__actions">
        <button type="button" class="btn" @click="openEdit(detailTransaction)">修改</button>
        <button
          type="button"
          class="btn btn--danger"
          @click="
            confirmDeleteId = detailTransaction!.id;
            detailId = null;
          "
        >
          删除
        </button>
      </div>
    </AppSheet>

    <TransactionForm
      v-if="formOpen"
      :mode="formMode"
      :initial="formInitial"
      :accounts="accounts"
      :members="members"
      :expense-categories="expenseCategories"
      :income-categories="incomeCategories"
      @close="formOpen = false"
      @saved="handleSaved"
      @created-category="handleCreatedCategory"
    />

    <ConfirmDialog
      v-if="confirmDeleteId !== null"
      title="删除这笔账目？"
      description="删掉之后账户余额会跟着回滚，且没法撤销。"
      confirm-text="删除"
      :pending="deletePending"
      :error="deleteError ?? ''"
      @confirm="doDelete"
      @cancel="cancelDelete"
    />
  </div>
</template>

<style scoped>
.accounting {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 96px;
}

.accounting__header-actions {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.accounting__filters {
  min-width: 0;
}

.filterbar {
  min-height: 45px;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
}

.filterbar__type {
  flex: none;
  min-width: 44px;
  min-height: 44px;
  padding: 0 10px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
}

.filterbar__type[aria-pressed='true'] {
  background: var(--surface-accent);
  color: var(--primary);
  font-weight: 700;
}

.filterbar__more {
  flex: none;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  margin-left: auto;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
}

.filterbar__more[aria-expanded='true'] {
  color: var(--primary);
  border-color: var(--primary);
}

.filtergrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding-top: 8px;
}

.filtergrid .field {
  margin-bottom: 0;
}

.accounting__refreshing {
  color: var(--muted);
  font-size: var(--text-xs);
  text-align: right;
}

.accounting__more {
  margin-top: 4px;
}

.accounting__repayment-note {
  margin-top: 16px;
  padding: 12px;
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--muted);
  font-size: var(--text-sm);
  line-height: 1.7;
}

@media (max-width: 767px) {
  .desktop-create {
    display: none;
  }

  .accounting__fab {
    width: 46px;
    height: 46px;
    bottom: calc(var(--safe-bottom) + 84px);
  }
}

@media (min-width: 768px) {
  .accounting {
    gap: 16px;
    padding-bottom: 0;
  }

  .accounting__fab {
    display: none;
  }
}
</style>
