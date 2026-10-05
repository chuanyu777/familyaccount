<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next';
import type { PlatformLedgerSummary } from '../types';

defineProps<{ ledgers: PlatformLedgerSummary[] }>();
const emit = defineEmits<{ open: [id: number] }>();
</script>

<template>
  <div class="platform-table-scroll">
    <table class="platform-table">
      <thead><tr><th scope="col">账本</th><th scope="col">ID</th><th scope="col">创建时间</th><th scope="col">创建人</th><th scope="col">活跃成员</th><th scope="col"><span class="sr-only">查看</span></th></tr></thead>
      <tbody>
        <tr v-for="ledger in ledgers" :key="ledger.id">
          <td><button class="platform-table__link" type="button" @click="emit('open', ledger.id)">{{ ledger.name }}</button></td>
          <td class="platform-table__number">{{ ledger.id }}</td>
          <td>{{ ledger.createdAt }}</td>
          <td>{{ ledger.ownerDisplayName }} <span class="platform-table__sub">#{{ ledger.ownerUserId }}</span></td>
          <td class="platform-table__number">{{ ledger.memberCount }}</td>
          <td><button class="platform-table__open" type="button" :aria-label="`查看${ledger.name}`" @click="emit('open', ledger.id)"><ChevronRight :size="18" /></button></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
