<script setup lang="ts">
import { computed } from 'vue';
import MoneyText from './MoneyText.vue';

// 结余大卡：一屏的视觉重心。衬线大数 + 收支泡泡 + 可选迷你环形进度。
// 记账页（这个月还剩）、资产页（净资产）、负债页（总负债）、分析页共用。

interface Bubble {
  label: string;
  cents: number;
  tone: 'income' | 'expense';
}

const props = withDefaults(
  defineProps<{
    label: string;
    cents: number;
    tone?: 'income' | 'expense' | 'neutral';
    bubbles?: Bubble[];
    /** 0~1 的占比，给了才画环形（如支出/收入比） */
    ratio?: number | null;
  }>(),
  { tone: 'neutral', bubbles: () => [], ratio: null },
);

const R = 23;
const CIRC = 2 * Math.PI * R;

const ratioClamped = computed(() =>
  props.ratio == null ? 0 : Math.min(1, Math.max(0, props.ratio)),
);
const dash = computed(() => `${ratioClamped.value * CIRC} ${CIRC}`);
const ratioText = computed(() => `${Math.round(ratioClamped.value * 100)}%`);
</script>

<template>
  <div class="hero card">
    <div class="hero__main">
      <span class="hero__label">{{ label }}</span>
      <MoneyText :cents="cents" :tone="tone" class="hero__amount" />
      <div v-if="bubbles.length > 0" class="hero__bubbles">
        <span
          v-for="b in bubbles"
          :key="b.label"
          class="hero__bubble"
          :class="`is-${b.tone}`"
        >
          <span class="hero__bubble-label">{{ b.label }}</span>
          <MoneyText :cents="b.cents" :tone="b.tone" class="hero__bubble-value" />
        </span>
      </div>
      <slot />
    </div>

    <div v-if="ratio != null" class="hero__ring" role="img" :aria-label="`占比 ${ratioText}`">
      <svg viewBox="0 0 52 52" width="52" height="52">
        <circle cx="26" cy="26" :r="R" fill="none" stroke="var(--rule-soft)" stroke-width="5" />
        <circle
          cx="26"
          cy="26"
          :r="R"
          fill="none"
          stroke="var(--brand-2)"
          stroke-width="5"
          stroke-linecap="round"
          :stroke-dasharray="dash"
          transform="rotate(-90 26 26)"
        />
      </svg>
      <span class="hero__ring-text">{{ ratioText }}</span>
    </div>
  </div>
</template>

<style scoped>
.hero {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-4) var(--sp-5);
  margin-bottom: var(--sp-4);
}

.hero__main {
  flex: 1;
  min-width: 0;
}

.hero__label {
  display: block;
  font-size: var(--text-xs);
  color: var(--ink-2);
  letter-spacing: 0.04em;
  margin-bottom: 2px;
}

.hero__amount {
  display: block;
  font-family: var(--font-serif);
  font-size: var(--text-2xl);
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0.01em;
}

.hero__bubbles {
  display: flex;
  gap: var(--sp-2);
  margin-top: var(--sp-3);
}

.hero__bubble {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 7px var(--sp-3);
  border-radius: var(--radius-sm);
}

.hero__bubble.is-income {
  background: var(--income-wash);
}

.hero__bubble.is-expense {
  background: var(--expense-wash);
}

.hero__bubble-label {
  font-size: var(--text-xs);
  color: var(--ink-2);
}

.hero__bubble-value {
  font-size: var(--text-sm);
  font-weight: 500;
}

.hero__ring {
  position: relative;
  flex: none;
  width: 52px;
  height: 52px;
}

.hero__ring-text {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 11px;
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}
</style>
