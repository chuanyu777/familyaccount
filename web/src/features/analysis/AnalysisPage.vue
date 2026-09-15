<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import MoneyText from '../../components/MoneyText.vue';
import StatBlock from '../../components/StatBlock.vue';
import StatHero from '../../components/StatHero.vue';
import SectionBlock from '../../components/SectionBlock.vue';
import EmptyState from '../../components/EmptyState.vue';
import MonthPicker from '../../components/MonthPicker.vue';
import { cachedGet } from '../../lib/api';
import { revision } from '../../lib/revision';
import { currentMonth, monthLabel, formatMoney } from '../../lib/format';
import TrendChart from './charts/TrendChart.vue';
import DonutChart from './charts/DonutChart.vue';
import { sliceColor } from './charts/palette';

interface MonthSnapshot {
  month: string;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  accountsTotalCents: number;
  assetsTotalCents: number;
  totalAssetsCents: number;
  totalLiabilitiesCents: number;
  netWorthCents: number;
  monthlyPaymentTotalCents: number;
  assetsEstimated: boolean;
  breakdown: Slice[];
}

interface TrendPoint {
  month: string;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

interface Slice {
  categoryId: number | null;
  name: string;
  cents: number;
  percent: number;
}

const EMPTY_SNAPSHOT: MonthSnapshot = {
  month: currentMonth(),
  incomeCents: 0,
  expenseCents: 0,
  netCents: 0,
  accountsTotalCents: 0,
  assetsTotalCents: 0,
  totalAssetsCents: 0,
  totalLiabilitiesCents: 0,
  netWorthCents: 0,
  monthlyPaymentTotalCents: 0,
  assetsEstimated: false,
  breakdown: [],
};

const TREND_MONTHS = 6;

const month = ref(currentMonth());
const snapshot = ref<MonthSnapshot>(EMPTY_SNAPSHOT);
const trend = ref<TrendPoint[]>([]);
const error = ref<string | null>(null);

const isCurrentMonth = computed(() => month.value === currentMonth());

async function load(force = false) {
  error.value = null;
  try {
    const [snap, t] = await Promise.all([
      cachedGet<MonthSnapshot>('/api/stats/monthly-snapshot', { month: month.value }, { force }),
      cachedGet<TrendPoint[]>(
        '/api/stats/monthly-trend',
        { months: TREND_MONTHS, end: month.value },
        { force }
      ),
    ]);
    // 字段缺失时补默认值，避免后端/缓存返回半截对象把模板打挂
    snapshot.value = { ...EMPTY_SNAPSHOT, ...(snap ?? {}) };
    trend.value = Array.isArray(t) ? t : [];
  } catch (e) {
    snapshot.value = EMPTY_SNAPSHOT;
    trend.value = [];
    error.value = e instanceof Error ? e.message : '数据加载失败';
  }
}

watch(month, () => void load());
watch(revision, () => void load(true));

onMounted(() => void load());
</script>

<template>
  <div class="analysis">
    <MonthPicker v-model="month" class="analysis__month" />

    <SectionBlock title="当月收支">
      <template #aside>
        <span class="muted">{{ monthLabel(month) }}</span>
      </template>

      <div v-if="error" class="card card--flush">
        <EmptyState :title="error" mark="!" />
      </div>

      <StatHero
        v-else
        :label="`${monthLabel(month)}结余`"
        :cents="snapshot.netCents"
        :tone="snapshot.netCents < 0 ? 'expense' : 'income'"
        :bubbles="[
          { label: '收入', cents: snapshot.incomeCents, tone: 'income' },
          { label: '支出', cents: -snapshot.expenseCents, tone: 'expense' },
        ]"
        :ratio="snapshot.incomeCents > 0 ? snapshot.expenseCents / snapshot.incomeCents : null"
      />
    </SectionBlock>

    <SectionBlock title="资产负债">
      <template #aside>
        <span class="muted">
          {{ isCurrentMonth ? '当前' : `${monthLabel(month)}末` }}
        </span>
      </template>

      <div v-if="!error" class="stats">
        <StatBlock label="总资产">
          <MoneyText :cents="snapshot.totalAssetsCents" />
        </StatBlock>
        <StatBlock label="总负债">
          <MoneyText :cents="snapshot.totalLiabilitiesCents" tone="expense" />
        </StatBlock>
        <StatBlock
          label="净资产"
          :hint="`月供合计 ${formatMoney(snapshot.monthlyPaymentTotalCents)}`"
        >
          <MoneyText
            class="net-worth"
            :cents="snapshot.netWorthCents"
            :tone="snapshot.netWorthCents < 0 ? 'expense' : 'neutral'"
          />
          <span v-if="snapshot.netWorthCents < 0" class="tag tag--warn">资不抵债</span>
        </StatBlock>
      </div>

      <p v-if="!error" class="split">
        资金账户 {{ formatMoney(snapshot.accountsTotalCents) }} · 资产项
        {{ formatMoney(snapshot.assetsTotalCents) }}
      </p>

      <p v-if="!error && snapshot.assetsEstimated" class="note">
        这个月有资产项还没记过市值，暂按当前市值计入。
      </p>
    </SectionBlock>

    <SectionBlock title="月度收支趋势">
      <template #aside>
        <span class="legend">
          <span class="legend__item"><i class="dot dot--income" />收入</span>
          <span class="legend__item"><i class="dot dot--expense" />支出</span>
        </span>
      </template>

      <div v-if="trend.length === 0" class="card card--flush">
        <EmptyState
          title="暂无收支数据"
          hint="记几笔账后，这里会出现最近 6 个月的收入与支出。"
          mark="○"
        />
      </div>
      <div v-else class="card card--flush chart-card">
        <TrendChart :data="trend" />
        <p class="chart-note">柱下方小字为该月结余（负数为红）</p>
      </div>
    </SectionBlock>

    <SectionBlock title="支出分类占比">
      <template #aside>
        <span class="muted">{{ monthLabel(month) }}</span>
      </template>

      <div v-if="snapshot.breakdown.length === 0" class="card card--flush">
        <EmptyState
          title="这个月还没有支出"
          hint="支出会按分类统计到这里，方便你看钱花在了哪。"
          mark="○"
        />
      </div>
      <div v-else class="card card--flush donut-row">
        <div class="donut-row__chart">
          <DonutChart :data="snapshot.breakdown" />
        </div>
        <ul class="slice-list">
          <li
            v-for="(d, i) in snapshot.breakdown"
            :key="(d.categoryId ?? d.name) as string"
            class="slice"
          >
            <span class="slice__bar" :style="{ background: sliceColor(i) }" aria-hidden="true" />
            <span class="slice__name">{{ d.name }}</span>
            <MoneyText class="slice__value" :cents="d.cents" tone="expense" />
            <span class="slice__percent">{{ d.percent }}%</span>
          </li>
        </ul>
      </div>
    </SectionBlock>
  </div>
</template>

<style scoped>
.analysis {
  display: flex;
  flex-direction: column;
}

.analysis__month {
  margin-bottom: var(--sp-4);
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-2);
}

.split {
  margin-top: var(--sp-2);
  font-size: var(--text-xs);
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}

.note {
  margin-top: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  background: var(--warn-wash);
  border-left: 2px solid var(--warn);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  font-size: var(--text-xs);
  color: var(--warn-deep);
  line-height: 1.7;
}

.muted {
  font-size: var(--text-sm);
  color: var(--ink-3);
}

.legend {
  display: inline-flex;
  gap: var(--sp-3);
  font-size: var(--text-xs);
  color: var(--ink-3);
}

.legend__item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  display: inline-block;
}

.dot--income {
  background: var(--income);
}

.dot--expense {
  background: var(--expense);
}

.chart-card {
  padding: var(--sp-3) var(--sp-2) var(--sp-2);
}

.chart-note {
  margin-top: var(--sp-1);
  text-align: center;
  font-size: var(--text-xs);
  color: var(--ink-2);
}

.donut-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-4);
}

.donut-row__chart {
  flex: none;
}

.slice-list {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  min-width: 180px;
  display: flex;
  flex-direction: column;
}

.slice {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 6px 0;
  border-bottom: 1px solid var(--rule-soft);
  font-size: var(--text-sm);
}

.slice:last-child {
  border-bottom: none;
}

.slice__bar {
  width: 3px;
  align-self: stretch;
  border-radius: 2px;
}

.slice__name {
  flex: 1;
  min-width: 0;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slice__value {
  font-size: var(--text-sm);
}

.slice__percent {
  width: 48px;
  text-align: right;
  color: var(--ink-3);
  font-family: var(--font-num);
  font-variant-numeric: tabular-nums;
}
</style>
