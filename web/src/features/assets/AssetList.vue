<script setup lang="ts">
import MoneyText from '../../components/MoneyText.vue';
import { assetEmoji } from './util';
import type { Asset } from './types';

defineProps<{ assets: Asset[] }>();
defineEmits<{ 'select-asset': [asset: Asset] }>();
</script>

<template>
  <ul class="asset-list" data-asset-list>
    <li v-for="asset in assets" :key="asset.id">
      <button type="button" class="row card" :data-asset-row="asset.id" @click="$emit('select-asset', asset)">
        <span class="row__bubble" aria-hidden="true">{{ assetEmoji(asset.name, asset.kind) }}</span>
        <span class="row__main">
          <span class="row__title">{{ asset.name }}</span>
          <span v-if="asset.kind" class="row__meta"><span>{{ asset.kind }}</span></span>
        </span>
        <MoneyText :cents="asset.valueCents ?? asset.value_cents ?? 0" class="row__amount" />
      </button>
    </li>
  </ul>
</template>
