<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import MoneyText from '../../components/MoneyText.vue';
import StatHero from '../../components/StatHero.vue';
import EmptyState from '../../components/EmptyState.vue';
import AppSheet from '../../components/AppSheet.vue';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import MonthPicker from '../../components/MonthPicker.vue';
import TransactionForm from './TransactionForm.vue';
import { cachedGet, apiDelete } from '../../lib/api';
import { revision } from '../../lib/revision';
import { showToast } from '../../lib/toast';
import { currentMonth, dayLabel } from '../../lib/format';
import type {
  Account,
  Category,
  Member,
  Transaction,
  TransactionType,
  TransactionsResponse,
} from './types';

const PAGE_SIZE = 20;

type TypeFilter = '' | TransactionType;

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '转账' },
];

const month = ref(currentMonth());
const type = ref<TypeFilter>('');
const accountFilter = ref('');
const memberFilter = ref('');
const showMoreFilters = ref(false);

const page = ref(1);
const loading = ref(true);

const items = ref<Transaction[]>([]);
const total = ref(0);
const totals = ref({ income: 0, expense: 0, net: 0 });

const accounts = ref<Account[]>([]);
const members = ref<Member[]>([]);
const expenseCats = ref<Category[]>([]);
const incomeCats = ref<Category[]>([]);

const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const formInitial = ref<Transaction | undefined>(undefined);
const detailId = ref<number | null>(null);
const confirmDeleteId = ref<number | null>(null);

const hasMore = computed(() => items.value.length < total.value);

/** 支出/收入比，驱动结余卡上的迷你环形；没有收入就不画 */
const spendRatio = computed(() =>
  totals.value.income > 0 ? totals.value.expense / totals.value.income : null,
);

const detailTxn = computed(() => items.value.find((t) => t.id === detailId.value) ?? null);

/** 按日期归拢，像账簿里一天一页 */
const dayGroups = computed(() => {
  const map = new Map<string, Transaction[]>();
  for (const t of items.value) {
    const list = map.get(t.occurredOn) ?? [];
    list.push(t);
    map.set(t.occurredOn, list);
  }
  return [...map.entries()].map(([date, list]) => {
    let income = 0;
    let expense = 0;
    for (const t of list) {
      if (t.type === 'income') income += t.amountCents;
      if (t.type === 'expense') expense += t.amountCents;
    }
    return { date, list, label: dayLabel(date), income, expense };
  });
});

function requestParams(): Record<string, unknown> {
  const params: Record<string, unknown> = { month: month.value, page: page.value, pageSize: PAGE_SIZE };
  if (type.value) params.type = type.value;
  if (accountFilter.value) params.accountId = Number(accountFilter.value);
  if (memberFilter.value) params.memberId = Number(memberFilter.value);
  return params;
}

async function load(opts: { append?: boolean; force?: boolean } = {}) {
  const append = opts.append ?? false;
  loading.value = true;
  try {
    const res = await cachedGet<TransactionsResponse>(
      '/api/transactions',
      requestParams(),
      { force: opts.force }
    );
    if (!res) return;
    items.value = append ? [...items.value, ...res.items] : res.items;
    total.value = res.total;
    totals.value = {
      income: res.incomeTotalCents,
      expense: res.expenseTotalCents,
      net: res.netCents,
    };
  } catch {
    if (!append) items.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadRefs(force = false) {
  try {
    const [acc, mem, exp, inc] = await Promise.all([
      cachedGet<Account[]>('/api/accounts', undefined, { force }),
      cachedGet<Member[]>('/api/members', undefined, { force }),
      cachedGet<Category[]>('/api/categories', { kind: 'expense' }, { force }),
      cachedGet<Category[]>('/api/categories', { kind: 'income' }, { force }),
    ]);
    accounts.value = acc ?? [];
    members.value = mem ?? [];
    expenseCats.value = exp ?? [];
    incomeCats.value = inc ?? [];
  } catch {
    /* 引用数据失败不阻塞账目展示 */
  }
}

function resetAndLoad() {
  page.value = 1;
  void load();
}

watch([type, accountFilter, memberFilter], resetAndLoad);
watch(month, resetAndLoad);

// 兜底：别的页面（负债还款、设置改成员…）动了数据也会 bump revision，这里跟着强制刷新
watch(revision, () => {
  void loadRefs(true);
  page.value = 1;
  void load({ force: true });
});

function loadMore() {
  page.value += 1;
  void load({ append: true });
}

function openCreate() {
  formMode.value = 'create';
  formInitial.value = undefined;
  formOpen.value = true;
}

function openEdit(t: Transaction) {
  detailId.value = null;
  formMode.value = 'edit';
  formInitial.value = t;
  formOpen.value = true;
}

function handleSaved() {
  formOpen.value = false;
  showToast(formMode.value === 'edit' ? '已更新' : '已记一笔');
  // 直接强制重拉（不等 revision 传播），保证「记下就立刻出现」
  void loadRefs(true);
  page.value = 1;
  void load({ force: true });
}

function handleCreatedCategory(cat: Category) {
  if (cat.kind === 'income') incomeCats.value = [...incomeCats.value, cat];
  else expenseCats.value = [...expenseCats.value, cat];
}

async function doDelete() {
  if (confirmDeleteId.value == null) return;
  try {
    await apiDelete(`/api/transactions/${confirmDeleteId.value}`);
    showToast('已删除');
  } catch {
    /* 删除失败时保持列表不动，由用户重试 */
  }
  confirmDeleteId.value = null;
  page.value = 1;
  void load({ force: true });
}

function sourceOf(t: Transaction): string {
  if (t.type === 'transfer') return `${t.accountName ?? ''} → ${t.toAccountName ?? ''}`;
  return t.categoryName || '未分类';
}

function toneOf(t: Transaction): 'income' | 'expense' | 'neutral' {
  if (t.type === 'transfer') return 'neutral';
  return t.type === 'expense' ? 'expense' : 'income';
}

function signedCents(t: Transaction): number {
  return t.type === 'expense' ? -t.amountCents : t.amountCents;
}

onMounted(() => {
  void loadRefs();
  void load();
});
</script>

<template>
  <div class="accounting">
    <MonthPicker v-model="month" class="monthpick" />

    <StatHero
      label="这个月还剩"
      :cents="totals.net"
      :tone="totals.net < 0 ? 'expense' : 'income'"
      :bubbles="[
        { label: '收入', cents: totals.income, tone: 'income' },
        { label: '支出', cents: -totals.expense, tone: 'expense' },
      ]"
      :ratio="spendRatio"
    />

    <div class="filterbar">
      <button
        v-for="opt in TYPE_OPTIONS"
        :key="opt.value"
        type="button"
        class="chip"
        :class="{ 'is-active': type === opt.value }"
        @click="type = opt.value"
      >
        {{ opt.label }}
      </button>
      <button
        type="button"
        class="btn btn--ghost btn--sm filterbar__more"
        :aria-expanded="showMoreFilters"
        @click="showMoreFilters = !showMoreFilters"
      >
        {{ showMoreFilters ? '收起' : '筛选' }}
      </button>
    </div>

    <div v-if="showMoreFilters" class="filtergrid">
      <label class="field">
        <span class="field__label">账户</span>
        <select v-model="accountFilter" class="field__control" aria-label="筛选账户">
          <option value="">全部账户</option>
          <option v-for="a in accounts" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
        </select>
      </label>
      <label class="field">
        <span class="field__label">成员</span>
        <select v-model="memberFilter" class="field__control" aria-label="筛选成员">
          <option value="">全部成员</option>
          <option v-for="m in members" :key="m.id" :value="String(m.id)">{{ m.name }}</option>
        </select>
      </label>
    </div>

    <div v-if="loading && items.length === 0" class="skeleton-list" aria-label="加载中">
      <div v-for="i in 4" :key="i" class="skeleton skeleton-row" />
    </div>

    <div v-else-if="items.length === 0" class="card card--flush">
      <EmptyState
        title="本月还没有记过账"
        hint="点右下角「＋」，先记下今天的第一笔。"
        mark="○"
      />
    </div>

    <template v-else>
      <div v-for="group in dayGroups" :key="group.date" class="day">
        <div class="day__head">
          <span class="day__pill">{{ group.label }}</span>
          <span class="day__sum">
            <template v-if="group.expense > 0">
              支 <MoneyText :cents="-group.expense" tone="expense" />
            </template>
            <template v-if="group.income > 0">
              收 <MoneyText :cents="group.income" tone="income" />
            </template>
          </span>
        </div>
        <ul class="txn-list">
          <li v-for="t in group.list" :key="t.id">
            <button type="button" class="txn card" @click="detailId = t.id">
              <span class="txn__bubble" :class="`is-${t.type}`" aria-hidden="true">
                {{ sourceOf(t).slice(0, 1) }}
              </span>
              <span class="txn__main">
                <span class="txn__title">
                  {{ sourceOf(t) }}
                  <span v-if="t.sourceType === 'repayment'" class="tag tag--debt">还款</span>
                </span>
                <span class="txn__meta">
                  {{ [t.memberName, t.accountName].filter(Boolean).join(' · ') }}
                  <template v-if="t.note"> · {{ t.note }}</template>
                </span>
              </span>
              <MoneyText :cents="signedCents(t)" :tone="toneOf(t)" class="txn__amount" />
            </button>
          </li>
        </ul>
      </div>
    </template>

    <button v-if="hasMore" type="button" class="btn btn--block more" @click="loadMore">
      载入更早的账目
    </button>

    <button type="button" class="fab" aria-label="记一笔" @click="openCreate">＋</button>

    <AppSheet
      v-if="detailTxn"
      :title="detailTxn.type === 'transfer' ? '转账' : '账目详情'"
      @close="detailId = null"
    >
      <dl class="detail">
        <div class="detail__row">
          <dt>金额</dt>
          <dd>
            <MoneyText :cents="signedCents(detailTxn)" :tone="toneOf(detailTxn)" size="lg" />
          </dd>
        </div>
        <div class="detail__row">
          <dt>日期</dt>
          <dd>{{ detailTxn.occurredOn }}</dd>
        </div>
        <div class="detail__row">
          <dt>{{ detailTxn.type === 'transfer' ? '账户' : '分类' }}</dt>
          <dd>{{ sourceOf(detailTxn) }}</dd>
        </div>
        <div v-if="detailTxn.type !== 'transfer'" class="detail__row">
          <dt>账户</dt>
          <dd>{{ detailTxn.accountName }}</dd>
        </div>
        <div class="detail__row">
          <dt>成员</dt>
          <dd>{{ detailTxn.memberName || '家庭共有' }}</dd>
        </div>
        <div v-if="detailTxn.note" class="detail__row">
          <dt>备注</dt>
          <dd>{{ detailTxn.note }}</dd>
        </div>
      </dl>

      <p v-if="detailTxn.sourceType === 'repayment'" class="note">
        这笔由还款自动生成，要改动请到「负债」里删除对应还款。
      </p>

      <div v-else class="detail__actions">
        <button type="button" class="btn" @click="openEdit(detailTxn)">修改</button>
        <button
          type="button"
          class="btn btn--danger"
          @click="
            confirmDeleteId = detailTxn!.id;
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
      :expense-categories="expenseCats"
      :income-categories="incomeCats"
      @close="formOpen = false"
      @saved="handleSaved"
      @created-category="handleCreatedCategory"
    />

    <ConfirmDialog
      v-if="confirmDeleteId !== null"
      title="删除这笔账目？"
      description="删掉之后账户余额会跟着回滚，且没法撤销。"
      confirm-text="删除"
      @confirm="doDelete"
      @cancel="confirmDeleteId = null"
    />
  </div>
</template>

<style scoped>
.accounting {
  padding-bottom: 96px;
}

.monthpick {
  margin-bottom: var(--sp-3);
}

.filterbar {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-bottom: var(--sp-4);
  overflow-x: auto;
}

.filterbar__more {
  flex: none;
  margin-left: auto;
}

.filtergrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-3);
  margin-bottom: var(--sp-3);
}

.filtergrid .field {
  margin-bottom: 0;
}

/* —— 骨架屏 —— */
.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.skeleton-row {
  height: 62px;
}

/* —— 日期分组：轻量小胶囊 —— */
.day {
  margin-bottom: var(--sp-2);
}

.day__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  padding: var(--sp-1) var(--sp-1);
}

.day__pill {
  display: inline-flex;
  align-items: center;
  padding: 3px var(--sp-3);
  border-radius: var(--radius-pill);
  background: var(--paper-sunken);
  font-size: var(--text-xs);
  color: var(--ink-2);
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.day__sum {
  font-size: var(--text-xs);
  color: var(--ink-2);
  display: inline-flex;
  gap: var(--sp-3);
  white-space: nowrap;
}

/* —— 流水行：每条一张白卡 —— */
.txn-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.txn {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  padding: 11px var(--sp-3);
  text-align: left;
  cursor: pointer;
  transition: transform var(--dur-fast) var(--ease-out);
}

.txn:active {
  transform: scale(0.98);
}

/* 收支泡泡：支出红、收入绿、转账中性 */
.txn__bubble {
  flex: none;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  background: var(--expense-wash);
  color: var(--expense-deep);
}

.txn__bubble.is-income {
  background: var(--income-wash);
  color: var(--income-deep);
}

.txn__bubble.is-transfer {
  background: var(--surface-accent);
  color: var(--muted);
}

.txn__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.txn__title {
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

.txn__meta {
  font-size: var(--text-xs);
  color: var(--ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.txn__amount {
  flex: none;
  font-size: var(--text-lg);
  font-weight: 500;
}

.more {
  margin-top: var(--sp-3);
}

.note {
  margin-top: var(--sp-4);
  padding: var(--sp-3);
  background: var(--slate-wash);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--slate);
  line-height: 1.7;
}
</style>
