<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ArrowLeft } from 'lucide-vue-next';
import { ApiError } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { platformApi } from '../platformApi';
import PlatformReadOnlySection from '../components/PlatformReadOnlySection.vue';
import type { PlatformLedgerView } from '../types';

const props = defineProps<{ ledgerId: number }>();
const emit = defineEmits<{ back: [] }>();
const view = ref<PlatformLedgerView | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
let requestId = 0;

const text = (value: string | number | null | undefined) => value === null || value === undefined || value === '' ? '—' : String(value);
const state = (value: number) => value === 1 ? '是' : '否';
const money = (value: number) => formatMoney(value);
const columns = {
  members: [{ key: 'name', label: '成员' }, { key: 'role', label: '角色' }, { key: 'active', label: '活跃' }, { key: 'web', label: '网页登录' }, { key: 'joined', label: '加入时间' }],
  transactions: [{ key: 'date', label: '日期' }, { key: 'type', label: '类型' }, { key: 'amount', label: '金额' }, { key: 'account', label: '账户 ID' }, { key: 'category', label: '分类 ID' }, { key: 'note', label: '备注' }],
  accounts: [{ key: 'name', label: '账户' }, { key: 'balance', label: '当前余额' }, { key: 'default', label: '默认' }, { key: 'archived', label: '归档' }],
  categories: [{ key: 'name', label: '分类' }, { key: 'kind', label: '类型' }, { key: 'archived', label: '归档' }],
  assets: [{ key: 'name', label: '资产' }, { key: 'kind', label: '类型' }, { key: 'value', label: '当前估值' }, { key: 'archived', label: '归档' }],
  snapshots: [{ key: 'month', label: '月份' }, { key: 'asset', label: '资产 ID' }, { key: 'value', label: '记录估值' }, { key: 'note', label: '备注' }],
  liabilities: [{ key: 'name', label: '负债' }, { key: 'remaining', label: '当前剩余' }, { key: 'monthly', label: '月供' }, { key: 'paymentDay', label: '还款日' }, { key: 'archived', label: '归档' }],
  repayments: [{ key: 'date', label: '日期' }, { key: 'liability', label: '负债 ID' }, { key: 'amount', label: '金额' }, { key: 'account', label: '账户 ID' }],
};

const sections = computed(() => {
  const data = view.value;
  if (!data) return [];
  return [
    { title: '成员', columns: columns.members, rows: data.members.map(row => ({ name: `${row.displayName} #${row.userId}`, role: row.role, active: state(row.active), web: state(row.webLoginAllowed), joined: text(row.joinedAt) })) },
    { title: '交易', columns: columns.transactions, rows: data.transactions.map(row => ({ date: text(row.occurredOn), type: row.type, amount: money(row.amountCents), account: text(row.accountId), category: text(row.categoryId), note: text(row.note) })) },
    { title: '账户', columns: columns.accounts, rows: data.accounts.map(row => ({ name: `${row.name} #${row.id}`, balance: money(row.balanceCents), default: state(row.isDefault), archived: state(row.archived) })) },
    { title: '分类', columns: columns.categories, rows: data.categories.map(row => ({ name: `${row.name} #${row.id}`, kind: row.kind, archived: state(row.archived) })) },
    { title: '资产', columns: columns.assets, rows: data.assets.map(row => ({ name: `${row.name} #${row.id}`, kind: row.kind, value: money(row.valueCents), archived: state(row.archived) })) },
    { title: '资产快照', columns: columns.snapshots, rows: data.snapshots.map(row => ({ month: text(row.snapMonth), asset: text(row.assetId), value: money(row.valueCents), note: text(row.note) })) },
    { title: '负债', columns: columns.liabilities, rows: data.liabilities.map(row => ({ name: `${row.name} #${row.id}`, remaining: money(row.remainingCents), monthly: money(row.monthlyPaymentCents), paymentDay: text(row.paymentDay), archived: state(row.archived) })) },
    { title: '还款', columns: columns.repayments, rows: data.repayments.map(row => ({ date: text(row.occurredOn), liability: text(row.liabilityId), amount: money(row.amountCents), account: text(row.accountId) })) },
  ];
});

const analysis = computed(() => {
  if (!view.value) return [];
  const data = view.value.analysis;
  return [
    { label: '全期收入', value: money(data.incomeCents) },
    { label: '全期支出', value: money(data.expenseCents) },
    { label: '全期净额', value: money(data.netCents) },
    { label: '当前账户余额合计', value: money(data.accountBalanceCents) },
    { label: '当前资产估值合计', value: money(data.assetValueCents) },
    { label: '当前负债剩余合计', value: money(data.liabilityRemainingCents) },
    { label: '活跃成员', value: String(data.memberCount) },
    { label: '全期交易', value: String(data.transactionCount) },
    { label: '全期还款', value: String(data.repaymentCount) },
  ];
});

async function load() {
  const current = ++requestId;
  loading.value = true;
  error.value = null;
  view.value = null;
  try {
    const result = await platformApi.getLedger(props.ledgerId);
    if (current === requestId) view.value = result;
  } catch (cause) {
    if (current === requestId) error.value = cause instanceof ApiError && cause.status === 403
      ? '无权查看此账本。请联系平台管理员。'
      : cause instanceof Error ? cause.message : '加载账本失败';
  } finally {
    if (current === requestId) loading.value = false;
  }
}

onMounted(() => void load());
watch(() => props.ledgerId, () => void load());
</script>

<template>
  <div class="platform-page platform-detail">
    <button class="platform-back" type="button" @click="emit('back')"><ArrowLeft :size="18" />账本列表</button>
    <p v-if="loading" class="platform-status" role="status">正在加载账本…</p>
    <div v-else-if="error" class="async-error" role="alert"><span>{{ error }}</span><button class="btn btn--sm" type="button" @click="load">重试</button></div>
    <template v-else-if="view">
      <header class="platform-page__heading"><div><h2>{{ view.ledger.name }} <span class="platform-page__id">#{{ view.ledger.id }}</span></h2><p>创建时间 {{ view.ledger.createdAt }} · 创建人 ID {{ view.ledger.createdByUserId }}</p></div><span class="platform-page__count">只读</span></header>
      <section class="platform-section" aria-label="分析汇总"><div class="platform-section__head"><h2>分析汇总</h2><span>全期与当前汇总</span></div><dl class="platform-analysis"><div v-for="item in analysis" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></div></dl></section>
      <PlatformReadOnlySection v-for="section in sections" :key="section.title" :title="section.title" :columns="section.columns" :rows="section.rows" />
    </template>
  </div>
</template>
