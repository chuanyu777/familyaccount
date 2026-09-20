<script setup lang="ts">
import MoneyText from '../../components/MoneyText.vue';
import { memberName, parseYuanToCents } from './util';
import type { Liability, Member, Repayment } from './types';

const props = defineProps<{
  liabilities: Liability[];
  repayments: Repayment[];
  members: Member[];
}>();

const emit = defineEmits<{
  select: [liability: Liability];
  repay: [liability: Liability];
}>();

function remainingCents(liability: Liability): number {
  return parseYuanToCents(liability.remaining) ?? 0;
}

function monthlyCents(liability: Liability): number {
  return parseYuanToCents(liability.monthlyPayment) ?? 0;
}

function repaidCents(liability: Liability): number {
  return props.repayments
    .filter((item) => item.liability_id === liability.id)
    .reduce((sum, item) => sum + item.amount_cents, 0);
}

function progressOf(liability: Liability): number {
  const paid = repaidCents(liability);
  const remaining = remainingCents(liability);
  const original = paid + remaining;
  return original > 0 ? Math.min(1, Math.max(0, paid / original)) : 0;
}

function progressPercent(liability: Liability): number {
  return Math.round(progressOf(liability) * 100);
}
</script>

<template>
  <div class="liability-table" data-liability-list>
    <div class="liability-table__head" aria-hidden="true">
      <span>负债</span>
      <span>还款进度</span>
      <span>剩余本金</span>
      <span></span>
    </div>
    <ul class="liability-list">
      <li
        v-for="liability in liabilities"
        :key="liability.id"
        class="liability-row card"
        :data-liability-row="liability.id"
      >
        <div
          class="liab__hit"
          role="button"
          tabindex="0"
          @click="emit('select', liability)"
          @keydown.enter.prevent="emit('select', liability)"
          @keydown.space.prevent="emit('select', liability)"
        >
          <span class="liability-row__identity">
            <span class="liability-row__name">{{ liability.name }}</span>
            <span class="liability-row__meta">
              <span>月供 <MoneyText :cents="monthlyCents(liability)" tone="expense" /></span>
              <span v-if="liability.payment_day">{{ liability.payment_day }} 日/月</span>
              <span>{{ memberName(members, liability.member_id) }}</span>
            </span>
          </span>

          <span class="liability-row__progress-block">
            <span
              class="liability-row__progress"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="progressPercent(liability)"
              :aria-label="`已还 ${progressPercent(liability)}%`"
            >
              <span
                class="liability-row__progress-fill"
                :style="{ width: `${progressOf(liability) * 100}%` }"
              />
            </span>
            <span class="liability-row__progress-meta">
              已还 <MoneyText :cents="repaidCents(liability)" tone="income" />
              <span>{{ progressPercent(liability) }}%</span>
            </span>
          </span>

          <span class="liability-row__amount">
            <span class="liability-row__amount-label">剩余</span>
            <MoneyText :cents="remainingCents(liability)" tone="expense" />
          </span>
        </div>

        <button
          type="button"
          class="btn btn--sm liability-row__repay"
          @click.stop="emit('repay', liability)"
        >
          还一笔
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.liability-table { display: grid; gap: var(--sp-2); }
.liability-table__head { display: grid; grid-template-columns: minmax(180px, 1.15fr) minmax(170px, .85fr) minmax(120px, .55fr) 76px; gap: var(--sp-3); padding: 0 var(--sp-3); color: var(--ink-3); font-size: var(--text-xs); }
.liability-table__head > :nth-child(3) { text-align: right; }
.liability-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-2); }
.liability-row { display: grid; grid-template-columns: minmax(0, 1fr) 76px; align-items: center; gap: var(--sp-3); padding: 0 var(--sp-3); }
.liab__hit { min-width: 0; display: grid; grid-template-columns: minmax(180px, 1.15fr) minmax(170px, .85fr) minmax(120px, .55fr); align-items: center; gap: var(--sp-3); padding: 11px 0; cursor: pointer; outline: none; }
.liab__hit:focus-visible { box-shadow: inset 0 0 0 2px var(--focus); }
.liability-row__identity { min-width: 0; display: grid; gap: 3px; }
.liability-row__name { overflow: hidden; color: var(--ink); font-size: var(--text-base); font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.liability-row__meta { min-width: 0; display: flex; gap: var(--sp-2); overflow: hidden; color: var(--ink-2); font-size: var(--text-xs); text-overflow: ellipsis; white-space: nowrap; }
.liability-row__progress-block { min-width: 0; display: grid; gap: 4px; }
.liability-row__progress { height: 6px; overflow: hidden; border-radius: var(--radius-pill); background: var(--paper-sunken); }
.liability-row__progress-fill { display: block; height: 100%; border-radius: inherit; background: var(--chart-accent); transition: width var(--dur) var(--ease-out); }
.liability-row__progress-meta { display: flex; justify-content: space-between; gap: var(--sp-2); color: var(--ink-2); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
.liability-row__amount { display: grid; justify-items: end; gap: 2px; font-size: var(--text-lg); font-weight: 500; }
.liability-row__amount-label { color: var(--ink-2); font-size: var(--text-xs); font-weight: 400; }
.liability-row__repay { width: 76px; }
@media (max-width: 720px) {
  .liability-table__head { display: none; }
  .liability-row { grid-template-columns: minmax(0, 1fr) auto; gap: var(--sp-2); padding: var(--sp-3); }
  .liab__hit { grid-template-columns: minmax(0, 1fr) auto; gap: var(--sp-2); padding: 0; }
  .liability-row__identity { grid-column: 1; }
  .liability-row__progress-block { grid-column: 1 / -1; grid-row: 2; }
  .liability-row__amount { grid-column: 2; grid-row: 1; font-size: var(--text-base); }
  .liability-row__repay { align-self: start; width: auto; }
}
</style>
