<script setup lang="ts">
import MoneyText from '../../components/MoneyText.vue';
import type { Transaction } from './types';

defineProps<{ items: Transaction[] }>();
defineEmits<{ select: [Transaction] }>();

function sourceOf(transaction: Transaction): string {
  if (transaction.type === 'transfer') {
    return `${transaction.accountName ?? ''} → ${transaction.toAccountName ?? ''}`;
  }
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
  <div class="transaction-table-wrap">
    <table class="transaction-table">
      <thead>
        <tr>
          <th scope="col">分类 / 备注</th>
          <th scope="col">账户</th>
          <th scope="col">成员</th>
          <th scope="col" class="transaction-table__amount">金额</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="transaction in items"
          :key="transaction.id"
          tabindex="0"
          :data-desktop-transaction="transaction.id"
          @click="$emit('select', transaction)"
          @keydown.enter="$emit('select', transaction)"
          @keydown.space.prevent="$emit('select', transaction)"
        >
          <td>
            <span class="transaction-table__title">
              {{ sourceOf(transaction) }}
              <span v-if="transaction.sourceType === 'repayment'" class="tag tag--debt">还款</span>
            </span>
            <span class="transaction-table__note">
              {{ [transaction.occurredOn, transaction.note].filter(Boolean).join(' · ') }}
            </span>
          </td>
          <td>
            {{
              transaction.type === 'transfer'
                ? `${transaction.accountName ?? ''} → ${transaction.toAccountName ?? ''}`
                : transaction.accountName || '—'
            }}
          </td>
          <td>{{ transaction.memberName || '家庭共有' }}</td>
          <td class="transaction-table__amount">
            <MoneyText :cents="signedCents(transaction)" :tone="toneOf(transaction)" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.transaction-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

.transaction-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.transaction-table th,
.transaction-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: middle;
}

.transaction-table th {
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: 600;
  background: var(--bg);
}

.transaction-table tbody tr {
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}

.transaction-table tbody tr:hover,
.transaction-table tbody tr:focus-visible {
  background: var(--surface-accent);
}

.transaction-table tbody tr:last-child td {
  border-bottom: 0;
}

.transaction-table th:first-child,
.transaction-table td:first-child {
  width: 42%;
}

.transaction-table__title,
.transaction-table__note {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transaction-table__title {
  font-weight: 600;
}

.transaction-table__note {
  margin-top: 2px;
  color: var(--muted);
  font-size: var(--text-xs);
}

.transaction-table__amount {
  text-align: right !important;
  white-space: nowrap;
}
</style>
