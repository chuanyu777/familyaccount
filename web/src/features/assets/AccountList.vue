<script setup lang="ts">
import MoneyText from '../../components/MoneyText.vue';
import { memberName } from './util';
import type { Account, Member } from './types';

defineProps<{ accounts: Account[]; members: Member[] }>();
defineEmits<{ 'select-account': [account: Account] }>();
</script>

<template>
  <ul class="asset-list" data-account-list>
    <li v-for="account in accounts" :key="account.id">
      <button
        type="button"
        class="row card"
        :data-account-row="account.id"
        @click="$emit('select-account', account)"
      >
        <span class="row__bubble" aria-hidden="true">{{ account.name.slice(0, 1) }}</span>
        <span class="row__main">
          <span class="row__title">{{ account.name }} <span v-if="account.is_default" class="tag">默认</span></span>
          <span class="row__meta">
            <span>{{ memberName(members, account.member_id) }}</span>
            <span v-if="account.balance_cents < 0" class="tag tag--expense">余额为负</span>
          </span>
        </span>
        <MoneyText :cents="account.balance_cents" :tone="account.balance_cents < 0 ? 'expense' : 'neutral'" class="row__amount" />
      </button>
    </li>
  </ul>
</template>

<style scoped>
.asset-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-2); }
.row { width: 100%; min-width: 0; display: flex; align-items: center; gap: var(--sp-3); padding: 11px var(--sp-3); text-align: left; cursor: pointer; }
.row__bubble { flex: none; width: 38px; height: 38px; display: grid; place-items: center; border-radius: var(--radius-sm); background: var(--brand-wash); color: var(--brand-2); font-size: var(--text-sm); }
.row__main { flex: 1; min-width: 0; display: grid; gap: 2px; }
.row__title, .row__meta { min-width: 0; display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row__title { font-size: var(--text-base); color: var(--ink); }
.row__meta { font-size: var(--text-xs); color: var(--ink-2); }
.row__amount { flex: none; font-size: var(--text-lg); font-weight: 500; }
@media (max-width: 600px) { .row__amount { font-size: var(--text-base); } }
</style>
