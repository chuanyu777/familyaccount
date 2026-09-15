<script setup lang="ts">
import { toastText, useToastVisible } from '../lib/toast';

const visible = useToastVisible();
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="visible" class="toast" role="status">{{ toastText }}</div>
    </Transition>
  </Teleport>
</template>
