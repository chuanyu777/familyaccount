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
