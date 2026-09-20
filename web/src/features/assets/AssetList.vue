<script setup lang="ts">
import MoneyText from '../../components/MoneyText.vue';
import { memberName } from './util';
import type { Asset, Member } from './types';

defineProps<{ assets: Asset[]; members: Member[] }>();
defineEmits<{ 'select-asset': [asset: Asset] }>();
</script>

<template>
  <ul class="asset-list" data-asset-list>
    <li v-for="asset in assets" :key="asset.id">
      <button type="button" class="row card" :data-asset-row="asset.id" @click="$emit('select-asset', asset)">
        <span class="row__bubble" aria-hidden="true">{{ (asset.kind || asset.name).slice(0, 1) }}</span>
        <span class="row__main">
          <span class="row__title">{{ asset.name }}</span>
          <span class="row__meta"><span>{{ asset.kind || '未分类' }}</span><span>{{ memberName(members, asset.member_id) }}</span></span>
        </span>
        <MoneyText :cents="asset.value_cents" class="row__amount" />
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
