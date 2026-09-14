<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AppSheet from '../../components/AppSheet.vue';
import SegmentedControl from '../../components/SegmentedControl.vue';
import { apiPatch, apiPost } from '../../lib/api';
import { centsToInput, todayISO } from '../../lib/format';
import {
  DEFAULT_EXPENSE_CATEGORY,
  DEFAULT_INCOME_CATEGORY,
  DEFAULT_MEMBER_NAME,
  type Account,
  type Category,
  type Member,
  type Transaction,
  type TransactionType,
} from './types';

const props = defineProps<{
  mode: 'create' | 'edit';
  initial?: Transaction;
  accounts: Account[];
  members: Member[];
  expenseCategories: Category[];
  incomeCategories: Category[];
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
  'created-category': [Category];
}>();

const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '转账' },
];

const type = ref<TransactionType>('expense');
const amount = ref('');
const occurredOn = ref(todayISO());
const accountId = ref<number | undefined>(undefined);
const toAccountId = ref('');
const categoryId = ref<number | undefined>(undefined);
const memberId = ref<number | undefined>(undefined);
const note = ref('');
const newCatName = ref('');
const error = ref<string | null>(null);
const saving = ref(false);

const localExpense = ref<Category[]>(props.expenseCategories);
const localIncome = ref<Category[]>(props.incomeCategories);

function defaultAccount(): number | undefined {
  return props.accounts.find((a) => a.is_default)?.id ?? props.accounts[0]?.id;
}

function defaultMember(): number | undefined {
  return (
    props.members.find((m) => m.name === DEFAULT_MEMBER_NAME)?.id ?? props.members[0]?.id
  );
}

function defaultCategory(list: Category[], fallback: string): number | undefined {
  return list.find((c) => c.name === fallback)?.id ?? list[0]?.id;
}

function initFields() {
  if (props.initial) {
    type.value = props.initial.type;
    amount.value = centsToInput(props.initial.amountCents);
    occurredOn.value = props.initial.occurredOn;
    accountId.value = props.initial.accountId ?? defaultAccount();
    toAccountId.value = props.initial.toAccountId ? String(props.initial.toAccountId) : '';
    categoryId.value = props.initial.categoryId;
    memberId.value = props.initial.memberId ?? defaultMember();
    note.value = props.initial.note ?? '';
  } else {
    type.value = 'expense';
    amount.value = '';
    occurredOn.value = todayISO();
    accountId.value = defaultAccount();
    toAccountId.value = '';
    categoryId.value = defaultCategory(localExpense.value, DEFAULT_EXPENSE_CATEGORY);
    memberId.value = defaultMember();
    note.value = '';
  }
  newCatName.value = '';
  error.value = null;
  saving.value = false;
}

initFields();

const kind = computed(() => (type.value === 'income' ? 'income' : 'expense'));
const currentCats = computed(() => (kind.value === 'income' ? localIncome.value : localExpense.value));
const title = computed(() => (props.mode === 'edit' ? '修改账目' : '记一笔'));

watch(
  () => [props.expenseCategories, props.incomeCategories],
  () => {
    localExpense.value = props.expenseCategories;
    localIncome.value = props.incomeCategories;
  },
);

function handleTypeChange(v: TransactionType) {
  type.value = v;
  if (v === 'income') categoryId.value = defaultCategory(localIncome.value, DEFAULT_INCOME_CATEGORY);
  else if (v === 'expense')
    categoryId.value = defaultCategory(localExpense.value, DEFAULT_EXPENSE_CATEGORY);
  error.value = null;
}

async function handleCreateCategory() {
  const name = newCatName.value.trim();
  if (!name) return;
  const list = kind.value === 'income' ? localIncome.value : localExpense.value;
  const existing = list.find((c) => c.name === name);
  if (existing) {
    categoryId.value = existing.id;
    newCatName.value = '';
    return;
  }
  try {
    const created = await apiPost<Category>('/api/categories', { kind: kind.value, name });
    if (kind.value === 'income') localIncome.value = [...localIncome.value, created];
    else localExpense.value = [...localExpense.value, created];
    categoryId.value = created.id;
    newCatName.value = '';
    emit('created-category', created);
  } catch {
    error.value = '新建分类失败，请重试';
  }
}

async function handleSubmit() {
  error.value = null;
  const amt = parseFloat(amount.value);
  if (!amount.value || Number.isNaN(amt) || amt <= 0) {
    error.value = '先填个金额吧';
    return;
  }
  if (type.value === 'transfer') {
    if (!toAccountId.value) {
      error.value = '选一个转入账户';
      return;
    }
    if (Number(toAccountId.value) === accountId.value) {
      error.value = '转入账户不能和转出账户一样';
      return;
    }
  }

  const payload: Record<string, unknown> = {
    type: type.value,
    amount: amt,
    occurredOn: occurredOn.value,
    note: note.value || undefined,
    memberId: memberId.value,
  };

  if (type.value === 'transfer') {
    payload.accountId = accountId.value;
    payload.toAccountId = Number(toAccountId.value);
  } else {
    payload.accountId = accountId.value;
    const cat = currentCats.value.find((c) => c.id === categoryId.value);
    if (cat) {
      payload.categoryId = cat.id;
      payload.categoryName = cat.name;
    }
  }

  saving.value = true;
  try {
    if (props.mode === 'edit' && props.initial) {
      await apiPatch(`/api/transactions/${props.initial.id}`, payload);
    } else {
      await apiPost('/api/transactions', payload);
    }
    emit('saved');
  } catch {
    error.value = '没存上，再试一次';
    saving.value = false;
  }
}
</script>

<template>
  <AppSheet :title="title" @close="emit('close')">
    <SegmentedControl
      :model-value="type"
      :options="TYPE_OPTIONS"
      label="账目类型"
      @update:model-value="handleTypeChange"
    />

    <div class="amount">
      <span class="amount__sign" aria-hidden="true">¥</span>
      <input
        v-model="amount"
        class="amount__input"
        type="number"
        inputmode="decimal"
        step="0.01"
        min="0"
        placeholder="0.00"
        aria-label="金额"
      />
    </div>

    <label class="field">
      <span class="field__label">日期</span>
      <input v-model="occurredOn" class="field__control" type="date" aria-label="日期" />
    </label>

    <label class="field">
      <span class="field__label">{{ type === 'transfer' ? '转出账户' : '账户' }}</span>
      <select
        v-model="accountId"
        class="field__control"
        aria-label="账户"
      >
        <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
    </label>

    <label v-if="type === 'transfer'" class="field">
      <span class="field__label">转入账户</span>
      <select v-model="toAccountId" class="field__control" aria-label="转入账户">
        <option value="">请选择</option>
        <option v-for="a in accounts" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
      </select>
    </label>

    <div v-else class="field">
      <span class="field__label">分类</span>
      <select v-model="categoryId" class="field__control" aria-label="分类">
        <option value="">请选择</option>
        <option v-for="c in currentCats" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <div class="catnew">
        <input
          v-model="newCatName"
          class="field__control"
          type="text"
          placeholder="没有合适的？直接写个新分类"
          aria-label="新建分类名称"
        />
        <button
          type="button"
          class="btn btn--sm"
          :disabled="!newCatName.trim()"
          @click="handleCreateCategory"
        >
          添加
        </button>
      </div>
    </div>

    <label class="field">
      <span class="field__label">成员</span>
      <select v-model="memberId" class="field__control" aria-label="成员">
        <option v-for="m in members" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
    </label>

    <label class="field">
      <span class="field__label">备注（可不填）</span>
      <input v-model="note" class="field__control" type="text" aria-label="备注" />
    </label>

    <p v-if="error" class="form-error">{{ error }}</p>

    <div class="actions">
      <button type="button" class="btn" :disabled="saving" @click="emit('close')">取消</button>
      <button type="button" class="btn btn--primary" :disabled="saving" @click="handleSubmit">
        {{ mode === 'edit' ? '更新' : '记下' }}
      </button>
    </div>
  </AppSheet>
</template>

<style scoped>
:deep(.segmented) {
  margin-bottom: var(--sp-4);
}

.amount {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
  padding: var(--sp-3) 0 var(--sp-4);
  border-bottom: 1px solid var(--rule);
  margin-bottom: var(--sp-4);
}

.amount__sign {
  font-family: var(--font-num);
  font-size: var(--text-xl);
  color: var(--ink-3);
}

.amount__input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-family: var(--font-num);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-amount);
  line-height: 1.1;
  color: var(--ink);
}

.amount__input:focus {
  outline: none;
}

.amount__input::placeholder {
  color: var(--rule);
}

.catnew {
  display: flex;
  gap: var(--sp-2);
  margin-top: var(--sp-2);
}

.catnew .field__control {
  flex: 1;
  min-height: 34px;
  font-size: var(--text-sm);
}

.actions {
  display: flex;
  gap: var(--sp-2);
  justify-content: flex-end;
  margin-top: var(--sp-5);
}
</style>
