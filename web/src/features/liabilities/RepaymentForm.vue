<script setup lang="ts">
import { computed, ref } from 'vue';
import AppSheet from '../../components/AppSheet.vue';
import { apiPost, apiPut } from '../../lib/api';
import { parseYuanToCents, centsToInput } from './util';
import type { Account, Liability, Repayment } from './types';

const props = defineProps<{
  liability: Liability;
  accounts: Account[];
  mode?: 'create' | 'edit';
  initial?: Repayment;
}>();

const emit = defineEmits<{ close: []; saved: [] }>();

const monthlyCents = parseYuanToCents(props.liability.monthlyPayment) ?? 0;
const amount = ref(props.initial ? centsToInput(props.initial.amount_cents) : monthlyCents === 0 ? '' : centsToInput(monthlyCents));
const date = ref(props.initial?.occurred_on ?? todayISO());
const activeAccounts = computed(() => props.accounts.filter((account) => !account.archived));
const historicalAccount = computed(() => props.mode === 'edit'
  ? props.accounts.find((account) => account.id === props.initial?.account_id && account.archived)
  : undefined);
const defaultAccount = activeAccounts.value.find((a) => a.isDefault ?? a.is_default);
const accountId = ref<number | ''>(props.initial?.account_id ?? (defaultAccount ? defaultAccount.id : ''));
const error = ref<string | null>(null);
const saving = ref(false);

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function handleClose() {
  if (!saving.value) emit('close');
}

async function save() {
  if (saving.value) return;
  error.value = null;
  const cents = parseYuanToCents(amount.value);
  if (cents == null || cents <= 0) {
    error.value = '请输入还款金额';
    return;
  }
  const remainingCents = parseYuanToCents(props.liability.remaining) ?? 0;
  const availableCents = props.initial ? remainingCents + props.initial.amount_cents : remainingCents;
  if (cents > availableCents) {
    error.value = '还款金额不能超过剩余本金';
    return;
  }
  if (accountId.value === '') {
    error.value = '请选择还款账户';
    return;
  }
  if (!activeAccounts.value.some((account) => account.id === accountId.value)) {
    error.value = '请选择可用还款账户';
    return;
  }
  saving.value = true;
  try {
    const payload = {
      liabilityId: props.liability.id,
      amount: cents / 100,
      occurredOn: date.value,
      accountId: accountId.value,
    };
    if (props.mode === 'edit' && props.initial) await apiPut(`/api/repayments/${props.initial.id}`, payload);
    else await apiPost('/api/repayments', payload);
    emit('saved');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '还款失败';
    saving.value = false;
  }
}
</script>

<template>
  <AppSheet :title="mode === 'edit' ? '编辑还款' : '还一笔'" @close="handleClose">
    <p class="repay-target">负债：{{ liability.name }}</p>

    <label class="field">
      <span class="field__label">还款金额</span>
      <input v-model="amount" class="field__control" type="text" inputmode="decimal" aria-label="还款金额" />
    </label>

    <label class="field">
      <span class="field__label">还款日期</span>
      <input v-model="date" class="field__control" type="date" aria-label="还款日期" />
    </label>

    <label class="field">
      <span class="field__label">还款账户</span>
      <select v-model="accountId" class="field__control" aria-label="还款账户">
        <option value="">请选择</option>
        <option v-if="historicalAccount" :value="historicalAccount.id" disabled>{{ historicalAccount.name }}（已归档）</option>
        <option v-for="a in activeAccounts" :key="a.id" :value="a.id">{{ a.name }}</option>
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
.repay-target {
  font-size: var(--text-sm);
  color: var(--muted);
  margin-bottom: var(--sp-3);
}

.actions {
  display: flex;
  gap: var(--sp-2);
  justify-content: flex-end;
  margin-top: var(--sp-5);
}
</style>
