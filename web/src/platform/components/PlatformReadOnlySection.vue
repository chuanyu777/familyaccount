<script setup lang="ts">
defineProps<{
  title: string;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string>>;
}>();
</script>

<template>
  <section class="platform-section" :aria-label="title">
    <div class="platform-section__head"><h2>{{ title }}</h2><span>{{ rows.length }} 条</span></div>
    <p v-if="!rows.length" class="platform-empty">暂无记录</p>
    <div v-else class="platform-table-scroll">
      <table class="platform-table">
        <thead><tr><th v-for="column in columns" :key="column.key" scope="col">{{ column.label }}</th></tr></thead>
        <tbody><tr v-for="(row, index) in rows" :key="index"><td v-for="column in columns" :key="column.key">{{ row[column.key] ?? '—' }}</td></tr></tbody>
      </table>
    </div>
  </section>
</template>
