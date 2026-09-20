<script setup lang="ts">
import { computed, ref } from 'vue';
import AppSheet from '../../components/AppSheet.vue';
import { apiPatch, apiPost } from '../../lib/api';
import { parseYuanToCents } from './util';
import type { Liability, Member } from './types';

const props = defineProps<{
  mode: 'create' | 'edit';
  initial?: Liability;
  members: Member[];
}>();

const emit = defineEmits<{ close: []; saved: [] }>();

const name = ref(props.initial?.name ?? '');
const remaining = ref(props.initial ? props.initial.remaining : '');
const monthlyPayment = ref(props.initial ? props.initial.monthlyPayment : '');
const paymentDay = ref<string>(props.initial?.payment_day ? String(props.initial.payment_day) : '');
const memberId = ref<number | ''>(props.initial?.member_id ?? '');
const error = ref<string | null>(null);
const saving = ref(false);

const title = computed(() => (props.mode === 'edit' ? '编辑负债' : '新增负债'));

function handleClose() {
  if (!saving.value) emit('close');
}

async function save() {
  if (saving.value) return;
  error.value = null;
  if (!name.value.trim()) {
    error.value = '请输入负债名称';
    return;
  }
  const remCents = parseYuanToCents(remaining.value);
  if (remCents == null) {
    error.value = '请输入剩余本金';
    return;
  }
  if (remCents < 0) {
    error.value = '剩余本金不能为负';
    return;
  }
  const payCents = parseYuanToCents(monthlyPayment.value) ?? 0;
  const body: {
    name: string;
    remaining: number;
    monthlyPayment: number;
    paymentDay?: number;
    memberId?: number;
  } = {
    name: name.value.trim(),
    remaining: remCents / 100,
    monthlyPayment: payCents / 100,
  };
  if (paymentDay.value.trim()) {
    const d = Number(paymentDay.value);
    if (Number.isFinite(d)) body.paymentDay = d;
  }
  if (memberId.value !== '') body.memberId = memberId.value;

  saving.value = true;
  try {
    if (props.mode === 'create' || !props.initial) {
      await apiPost('/api/liabilities', body);
    } else {
      await apiPatch(`/api/liabilities/${props.initial.id}`, body);
    }
    emit('saved');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败';
    saving.value = false;
  }
}
</script>

<template>
  <AppSheet :title="title" @close="handleClose">
    <label class="field">
      <span class="field__label">负债名称</span>
      <input v-model="name" class="field__control" type="text" aria-label="负债名称" />
    </label>

    <label class="field">
      <span class="field__label">剩余本金</span>
      <input v-model="remaining" class="field__control" type="text" inputmode="decimal" aria-label="剩余本金" />
    </label>

    <label class="field">
      <span class="field__label">每月还款额</span>
      <input v-model="monthlyPayment" class="field__control" type="text" inputmode="decimal" aria-label="每月还款额" />
    </label>

    <label class="field">
      <span class="field__label">还款日</span>
      <input v-model="paymentDay" class="field__control" type="text" inputmode="numeric" aria-label="还款日" placeholder="可空" />
    </label>

    <label class="field">
      <span class="field__label">归属成员</span>
      <select v-model="memberId" class="field__control" aria-label="归属成员">
        <option value="">家庭共有</option>
        <option v-for="m in members" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
    </label>

    <p v-if="error" class="form-error">{{ error }}</p>

    <div class="actions">
      <button type="button" class="btn" :disabled="saving" @click="handleClose">取消</button>
      <button type="button" class="btn btn--primary" :disabled="saving" @click="save">
        {{ saving ? '保存中…' : '保存' }}
      </button>
    </div>
  </AppSheet>
</template>

<style scoped>
.actions {
  display: flex;
  gap: var(--sp-2);
  justify-content: flex-end;
  margin-top: var(--sp-5);
}
</style>
