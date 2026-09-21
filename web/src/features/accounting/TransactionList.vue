<script setup lang="ts">
import { computed, type Component } from 'vue';
import {
  ArrowRightLeft,
  CircleDollarSign,
  Gamepad2,
  GraduationCap,
  House,
  ShoppingBag,
  Stethoscope,
  TrainFront,
  Utensils,
  WalletCards,
} from 'lucide-vue-next';
import { dayLabel, formatMoney } from '../../lib/format';
import type { Transaction } from './types';

const props = defineProps<{ items: Transaction[] }>();
defineEmits<{ select: [Transaction] }>();

const CATEGORY_ICONS: Record<string, Component> = {
  餐饮: Utensils,
  工资: WalletCards,
  居住: House,
  住房: House,
  交通: TrainFront,
  购物: ShoppingBag,
  娱乐: Gamepad2,
  医疗: Stethoscope,
  教育: GraduationCap,
};

const groups = computed(() => {
  const byDate = new Map<string, Transaction[]>();
  for (const transaction of props.items) {
    const transactions = byDate.get(transaction.occurredOn) ?? [];
    transactions.push(transaction);
    byDate.set(transaction.occurredOn, transactions);
  }
  return [...byDate.entries()].map(([date, transactions]) => ({
    date,
    label: dayLabel(date),
    transactions,
  }));
});

function sourceOf(transaction: Transaction): string {
  if (transaction.type === 'transfer') {
    return `${transaction.accountName ?? ''} → ${transaction.toAccountName ?? ''}`;
  }
  return transaction.categoryName || '未分类';
}

function iconOf(transaction: Transaction): Component {
  if (transaction.type === 'transfer') return ArrowRightLeft;
  return CATEGORY_ICONS[transaction.categoryName ?? ''] ?? CircleDollarSign;
}

function metaOf(transaction: Transaction): string {
  return [transaction.note, transaction.memberName, transaction.accountName]
    .filter(Boolean)
    .join(' · ');
}

function signedAmount(transaction: Transaction): string {
  if (transaction.type === 'expense') return `- ${formatMoney(transaction.amountCents)}`;
  if (transaction.type === 'income') return `+ ${formatMoney(transaction.amountCents)}`;
  return formatMoney(transaction.amountCents);
}
</script>

<template>
  <div class="transaction-mobile-list">
    <section v-for="group in groups" :key="group.date" class="transaction-day">
      <div class="transaction-day__header">
        <span>{{ group.label }}</span>
        <span>{{ group.transactions.length }} 笔</span>
      </div>
      <div class="transaction-day__list">
        <button
          v-for="transaction in group.transactions"
          :key="transaction.id"
          type="button"
          class="transaction-mobile-row"
          :data-mobile-transaction="transaction.id"
          @click="$emit('select', transaction)"
        >
          <span
            class="transaction-mobile-row__icon"
            :class="`is-${transaction.type}`"
            :data-financial-tone="transaction.type === 'transfer' ? 'neutral' : transaction.type"
            aria-hidden="true"
          >
            <component :is="iconOf(transaction)" :size="16" :stroke-width="1.9" />
          </span>
          <span class="transaction-mobile-row__body">
            <span class="transaction-mobile-row__title">
              {{ sourceOf(transaction) }}
              <span v-if="transaction.sourceType === 'repayment'" class="tag tag--debt">还款</span>
            </span>
            <span class="transaction-mobile-row__meta">{{ metaOf(transaction) }}</span>
          </span>
          <span
            class="transaction-mobile-row__amount money"
            :class="`money--${transaction.type === 'transfer' ? 'neutral' : transaction.type}`"
          >
            {{ signedAmount(transaction) }}
          </span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.transaction-mobile-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.transaction-day__header {
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 2px;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  font-size: 11px;
}

.transaction-day__list {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

.transaction-mobile-row {
  min-height: 54px;
  width: 100%;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 7px 11px;
  border: 0;
  border-top: 1px solid var(--line);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.transaction-mobile-row:first-child {
  border-top: 0;
}

.transaction-mobile-row:active {
  background: var(--surface-accent);
}

.transaction-mobile-row__icon {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: var(--expense-soft);
  color: var(--expense);
}

.transaction-mobile-row__icon.is-income {
  background: var(--income-soft);
  color: var(--income);
}

.transaction-mobile-row__icon.is-transfer {
  background: var(--bg);
  color: var(--muted);
}

.transaction-mobile-row__body {
  min-width: 0;
}

.transaction-mobile-row__title,
.transaction-mobile-row__meta {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transaction-mobile-row__title {
  gap: 5px;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.2;
}

.transaction-mobile-row__meta {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.2;
}

.transaction-mobile-row__amount {
  font-size: 12px;
  font-weight: 700;
}
</style>
