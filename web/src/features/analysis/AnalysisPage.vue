<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AsyncState from '../../components/AsyncState.vue';
import MonthPicker from '../../components/MonthPicker.vue';
import PageHeader from '../../components/PageHeader.vue';
import SummaryStrip, { type SummaryMetric } from '../../components/SummaryStrip.vue';
import { cachedGet } from '../../lib/api';
import { currentMonth, monthLabel } from '../../lib/format';
import { createLatestGate } from '../../lib/latestGate';
import { resourceVersion } from '../../lib/resourceInvalidation';
import DonutChart, { type Slice } from './charts/DonutChart.vue';
import TrendChart, { type TrendPoint } from './charts/TrendChart.vue';

interface MonthSnapshot {
  month: string;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  breakdown: Slice[];
}

type LoadResult =
  | { ok: true; value: [MonthSnapshot, TrendPoint[]] }
  | { ok: false; error: unknown };

const TREND_MONTHS = 6;

const month = ref(currentMonth());
const snapshot = ref<MonthSnapshot | null>(null);
const trend = ref<TrendPoint[]>([]);
const loading = ref(true);
const refreshing = ref(false);
const error = ref<string | null>(null);
const gate = createLatestGate();
const statisticsVersion = resourceVersion(['statistics']);
const retainedMonth = computed(() =>
  snapshot.value && snapshot.value.month !== month.value ? snapshot.value.month : null,
);

function metricLabel(name: string): string {
  return retainedMonth.value ? `${monthLabel(retainedMonth.value)}${name}` : `当月${name}`;
}

const netMetric = computed<SummaryMetric>(() => ({
  label: metricLabel('结余'),
  cents: snapshot.value?.netCents ?? 0,
  tone: (snapshot.value?.netCents ?? 0) < 0 ? 'expense' : 'income',
}));
const incomeMetric = computed<SummaryMetric>(() => ({
  label: metricLabel('收入'),
  cents: snapshot.value?.incomeCents ?? 0,
  tone: 'income',
}));
const expenseMetric = computed<SummaryMetric>(() => ({
  label: metricLabel('支出'),
  cents: -(snapshot.value?.expenseCents ?? 0),
  tone: 'expense',
}));
const breakdown = computed(() => snapshot.value?.breakdown ?? []);
const hasTrendActivity = computed(() =>
  trend.value.some((point) => point.incomeCents !== 0 || point.expenseCents !== 0),
);
const hasAnalysisData = computed(() => {
  const current = snapshot.value;
  return Boolean(
    hasTrendActivity.value ||
      current?.breakdown.length ||
      current?.incomeCents ||
      current?.expenseCents ||
      current?.netCents,
  );
});

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : '数据加载失败，请重试';
}

async function load(force = false) {
  loading.value = snapshot.value === null;
  refreshing.value = snapshot.value !== null;
  error.value = null;
  const requestedMonth = month.value;

  const result = await gate.run<LoadResult>(async () => {
    try {
      const value = await Promise.all([
        cachedGet<MonthSnapshot>(
          '/api/stats/monthly-snapshot',
          { month: requestedMonth },
          { force },
        ),
        cachedGet<TrendPoint[]>(
          '/api/stats/monthly-trend',
          { months: TREND_MONTHS, end: requestedMonth },
          { force },
        ),
      ]);
      return { ok: true, value };
    } catch (cause) {
      return { ok: false, error: cause };
    }
  });

  if (!result.current) return;
  if (result.value.ok) {
    const [nextSnapshot, nextTrend] = result.value.value;
    snapshot.value = {
      month: nextSnapshot.month,
      incomeCents: nextSnapshot.incomeCents ?? 0,
      expenseCents: nextSnapshot.expenseCents ?? 0,
      netCents: nextSnapshot.netCents ?? 0,
      breakdown: Array.isArray(nextSnapshot.breakdown) ? nextSnapshot.breakdown : [],
    };
    trend.value = Array.isArray(nextTrend) ? nextTrend : [];
  } else {
    error.value = errorMessage(result.value.error);
  }
  loading.value = false;
  refreshing.value = false;
}

function reload() {
  void load(true);
}

watch([month, statisticsVersion], () => void load(true));
onMounted(() => void load());
</script>

<template>
  <div class="analysis">
    <PageHeader title="分析" :context="monthLabel(month)" />

    <div class="analysis__month">
      <MonthPicker v-model="month" />
    </div>

    <SummaryStrip :primary="netMetric" :secondary="[incomeMetric, expenseMetric]" />

    <p v-if="retainedMonth" class="analysis__refreshing" data-retained-month aria-live="polite">
      当前显示{{ monthLabel(retainedMonth) }}数据，{{ monthLabel(month) }}{{ error ? '加载失败' : '加载中' }}
    </p>
    <p v-else-if="refreshing" class="analysis__refreshing" aria-live="polite">正在更新分析…</p>

    <div v-if="error && hasAnalysisData" class="analysis__error" role="alert">
      <span>{{ error }}</span>
      <button type="button" class="btn" @click="reload">重试</button>
    </div>

    <div v-if="!hasAnalysisData" class="analysis__empty" data-empty-analysis>
      <AsyncState
        :loading="loading"
        :error="error ?? ''"
        :empty="true"
        empty-title="暂无收支数据"
        empty-hint="先记几笔账，这里会展示最近 6 个月的收支趋势与分类。"
        @retry="reload"
      />
      <a v-if="!loading && !error" class="btn btn--primary analysis__empty-action" href="#accounting">
        去记账
      </a>
    </div>

    <div v-else class="analysis__charts">
      <section class="content-section" data-analysis-section="trend">
        <header class="content-section__head">
          <h2 class="content-section__title">月度收支趋势</h2>
          <span class="analysis__legend" aria-label="图例">
            <span><i class="analysis__dot analysis__dot--income" />收入</span>
            <span><i class="analysis__dot analysis__dot--expense" />支出</span>
          </span>
        </header>

        <TrendChart v-if="hasTrendActivity" :data="trend" data-chart-frame />
        <div v-else class="analysis__section-empty" data-empty-analysis>
          <AsyncState
            :loading="loading"
            :empty="true"
            empty-title="暂无趋势数据"
            empty-hint="再记几笔账后，这里会显示最近 6 个月的收入与支出。"
            @retry="reload"
          />
          <a v-if="!loading && !error" class="btn analysis__empty-action" href="#accounting">
            去记账
          </a>
        </div>
      </section>

      <section class="content-section" data-analysis-section="categories">
        <header class="content-section__head">
          <h2 class="content-section__title">支出分类占比</h2>
          <span class="content-section__meta">{{ monthLabel(snapshot?.month ?? month) }}</span>
        </header>
        <DonutChart v-if="breakdown.length" :data="breakdown" />
        <div v-else class="analysis__section-empty">
          <AsyncState
            :loading="loading"
            :empty="true"
            empty-title="这个月还没有分类支出"
            empty-hint="支出会按分类汇总到这里。"
            @retry="reload"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.analysis {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}

.analysis__month {
  max-width: 360px;
}

.analysis__refreshing {
  margin: calc(var(--sp-2) * -1) 0 0;
  color: var(--muted);
  font-size: var(--text-sm);
}

.analysis__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border-left: 3px solid var(--expense);
  background: var(--expense-soft);
  color: var(--expense);
}

.analysis__error .btn {
  flex: none;
}

.analysis__empty,
.analysis__section-empty {
  text-align: center;
}

.analysis__empty {
  padding: var(--sp-5) 0;
}

.analysis__empty-action {
  margin-top: var(--sp-3);
}

.analysis__charts {
  display: grid;
  gap: var(--sp-5);
}

.analysis__charts .content-section {
  min-width: 0;
  margin: 0;
  padding-top: var(--sp-4);
  border-top: 1px solid var(--line);
}

.analysis__legend,
.analysis__legend span {
  display: inline-flex;
  align-items: center;
}

.analysis__legend {
  gap: var(--sp-3);
  color: var(--muted);
  font-size: var(--text-xs);
}

.analysis__legend span {
  gap: var(--sp-1);
}

.analysis__dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.analysis__dot--income {
  background: var(--income);
}

.analysis__dot--expense {
  background: var(--expense);
}

@media (min-width: 768px) {
  .analysis {
    gap: var(--sp-5);
  }

  .analysis__charts {
    grid-template-columns: minmax(0, 1.2fr) minmax(300px, 0.8fr);
    align-items: start;
  }
}

@media (max-width: 420px) {
  .analysis :deep(.summary-strip) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .analysis :deep(.summary-strip__primary) {
    grid-column: 1 / -1;
    padding-bottom: var(--sp-3);
  }

  .analysis :deep(.summary-strip__secondary) {
    padding-top: var(--sp-3);
    padding-left: 0;
    border-top: 1px solid var(--line);
    border-left: 0;
  }

  .analysis :deep(.summary-strip__secondary:last-child) {
    padding-left: var(--sp-3);
    border-left: 1px solid var(--line);
  }
}
</style>
