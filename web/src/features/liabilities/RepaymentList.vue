<script setup lang="ts">
import MoneyText from '../../components/MoneyText.vue';
import { accountName } from './util';
import type { Account, Repayment } from './types';

defineProps<{
  repayments: Repayment[];
  accounts: Account[];
}>();

const emit = defineEmits<{ delete: [number] }>();
</script>

<template>
  <div v-if="repayments.length === 0" class="repay-empty">暂无还款记录</div>

  <ul v-else class="repay-list">
    <li v-for="r in repayments" :key="r.id" class="repay-row">
      <span class="repay-date">{{ r.occurred_on }}</span>
      <MoneyText :cents="r.amount_cents" tone="expense" class="repay-amount" />
      <span class="repay-account">{{ accountName(accounts, r.account_id) }}</span>
      <button type="button" class="btn btn--ghost btn--sm btn--danger" @click="emit('delete', r.id)">
        删除
      </button>
    </li>
  </ul>
</template>

<style scoped>
.repay-empty {
  margin-top: var(--sp-2);
  font-size: var(--text-xs);
  color: var(--ink-3);
}

.repay-list {
  list-style: none;
  margin: var(--sp-2) 0 0;
  padding: 0;
}

.repay-row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 6px 0;
  border-top: 1px solid var(--rule-soft);
  font-size: var(--text-xs);
  color: var(--ink-2);
}

.repay-date {
  flex: none;
}

.repay-amount {
  flex: none;
}

.repay-account {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
