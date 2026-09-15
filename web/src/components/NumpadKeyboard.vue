<script setup lang="ts">
// 自定义数字键盘：金额 + 分类即可保存，避免唤起系统键盘。
// 4 列布局：左三列 1-9/.0⌫，右列贯通的「完成」主色键。

defineProps<{ doneDisabled?: boolean }>();

const emit = defineEmits<{
  input: [string];
  dot: [];
  backspace: [];
  done: [];
}>();

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'];
</script>

<template>
  <div class="numpad" role="group" aria-label="数字键盘">
    <div class="numpad__grid">
      <button
        v-for="k in KEYS"
        :key="k"
        type="button"
        class="numpad__key"
        @click="k === '.' ? emit('dot') : emit('input', k)"
      >
        {{ k }}
      </button>
      <button
        type="button"
        class="numpad__key numpad__key--fn"
        aria-label="退格"
        @click="emit('backspace')"
      >
        ⌫
      </button>
    </div>
    <button
      type="button"
      class="numpad__done"
      :disabled="doneDisabled"
      @click="emit('done')"
    >
      完成
    </button>
  </div>
</template>

<style scoped>
.numpad {
  display: flex;
  gap: var(--sp-2);
}

.numpad__grid {
  flex: 3;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-2);
}

.numpad__key {
  height: 56px;
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  background: var(--paper-raised);
  color: var(--ink);
  font-size: 1.25rem;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}

.numpad__key:active {
  background: var(--paper-sunken);
  transform: scale(0.97);
}

.numpad__key--fn {
  color: var(--ink-2);
}

.numpad__done {
  flex: 1;
  border: none;
  border-radius: var(--radius);
  background: var(--brand);
  color: #fff;
  font-size: var(--text-lg);
  font-weight: 500;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}

.numpad__done:hover {
  background: var(--brand-deep);
}

.numpad__done:active {
  transform: scale(0.98);
}

.numpad__done:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
