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
