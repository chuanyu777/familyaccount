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
const newCatOpen = ref(false);
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
  newCatOpen.value = false;
  error.value = null;
  saving.value = false;
}

initFields();

const kind = computed(() => (type.value === 'income' ? 'income' : 'expense'));
const currentCats = computed(() => (kind.value === 'income' ? localIncome.value : localExpense.value));
const title = computed(() => (props.mode === 'edit' ? '修改账目' : '记一笔'));

const amountValid = computed(() => {
  const v = parseFloat(amount.value);
  return amount.value !== '' && !Number.isNaN(v) && v > 0;
});
const transferValid = computed(
  () =>
    type.value !== 'transfer' ||
    (toAccountId.value !== '' && Number(toAccountId.value) !== accountId.value),
);
const canSubmit = computed(() => amountValid.value && transferValid.value && !saving.value);

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

/** 金额只接受数字与两位小数，避免输入框里塞进乱七八糟的字符 */
function onAmountInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  const cleaned = raw.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
  const [intPart = '', decPart] = cleaned.split('.');
  const next = cleaned.includes('.')
    ? `${intPart.slice(0, 9)}.${(decPart ?? '').slice(0, 2)}`
    : intPart.slice(0, 9);
  amount.value = next;
  if (next !== raw) (e.target as HTMLInputElement).value = next;
}

async function handleCreateCategory() {
  const name = newCatName.value.trim();
  if (!name) return;
  const list = kind.value === 'income' ? localIncome.value : localExpense.value;
  const existing = list.find((c) => c.name === name);
  if (existing) {
    categoryId.value = existing.id;
    newCatName.value = '';
    newCatOpen.value = false;
    return;
  }
  try {
    const created = await apiPost<Category>('/api/categories', { kind: kind.value, name });
    if (kind.value === 'income') localIncome.value = [...localIncome.value, created];
    else localExpense.value = [...localExpense.value, created];
    categoryId.value = created.id;
    newCatName.value = '';
    newCatOpen.value = false;
    emit('created-category', created);
  } catch {
    error.value = '新建分类失败，请重试';
  }
}

async function handleSubmit() {
  error.value = null;
  if (!amountValid.value) {
    error.value = '先填个金额吧';
    return;
  }
  if (!transferValid.value) {
    error.value =
      toAccountId.value === '' ? '选一个转入账户' : '转入账户不能和转出账户一样';
    return;
  }

  const amt = parseFloat(amount.value);
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

    <!-- 大金额区：唤起系统数字键盘，不用自绘键盘 -->
    <div class="amount">
      <span class="amount__sign" aria-hidden="true">¥</span>
      <input
        :value="amount"
        class="amount__input"
        type="text"
        inputmode="decimal"
        placeholder="0.00"
        aria-label="金额"
        @input="onAmountInput"
      />
    </div>

    <!-- 分类宫格（转账时换成两个账户选择） -->
    <template v-if="type === 'transfer'">
      <div class="attrs">
        <label class="attr">
          <span class="attr__label">转出</span>
          <select v-model="accountId" class="attr__control" aria-label="转出账户">
            <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </label>
        <label class="attr">
          <span class="attr__label">转入</span>
          <select v-model="toAccountId" class="attr__control" aria-label="转入账户">
            <option value="">请选择</option>
            <option v-for="a in accounts" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
          </select>
        </label>
      </div>
    </template>

    <div v-else class="cats" role="group" aria-label="分类">
      <button
        v-for="c in currentCats"
        :key="c.id"
        type="button"
        class="cat"
        :class="{ 'is-active': categoryId === c.id }"
        @click="categoryId = c.id"
      >
        <span class="cat__bubble" aria-hidden="true">{{ c.name.slice(0, 1) }}</span>
        <span class="cat__name">{{ c.name }}</span>
      </button>
      <button
        type="button"
        class="cat cat--new"
        :class="{ 'is-active': newCatOpen }"
        @click="newCatOpen = !newCatOpen"
      >
        <span class="cat__bubble cat__bubble--new" aria-hidden="true">＋</span>
        <span class="cat__name">新分类</span>
      </button>
    </div>

    <div v-if="newCatOpen && type !== 'transfer'" class="catnew">
      <input
        v-model="newCatName"
        class="field__control"
        type="text"
        placeholder="新分类名称"
        aria-label="新建分类名称"
        @keyup.enter="handleCreateCategory"
      />
      <button
        type="button"
        class="btn btn--sm btn--primary"
        :disabled="!newCatName.trim()"
        @click="handleCreateCategory"
      >
        添加
      </button>
    </div>

    <!-- 属性 chips：账户 / 成员 / 日期 -->
    <div class="attrs">
      <label v-if="type !== 'transfer'" class="attr">
        <span class="attr__label">账户</span>
        <select v-model="accountId" class="attr__control" aria-label="账户">
          <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>
      <label class="attr">
        <span class="attr__label">成员</span>
        <select v-model="memberId" class="attr__control" aria-label="成员">
          <option v-for="m in members" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
      </label>
      <label class="attr">
        <span class="attr__label">日期</span>
        <input v-model="occurredOn" class="attr__control" type="date" aria-label="日期" />
      </label>
    </div>

    <input
      v-model="note"
      class="note-input"
      type="text"
      placeholder="写点什么…（可不填）"
      aria-label="备注"
    />

    <p v-if="error" class="form-error">{{ error }}</p>

    <div class="actions">
      <button type="button" class="btn" :disabled="saving" @click="emit('close')">取消</button>
      <button
        type="button"
        class="btn btn--primary"
        :disabled="!canSubmit"
        @click="handleSubmit"
      >
        {{ mode === 'edit' ? '更新' : '记下' }}
      </button>
    </div>
  </AppSheet>
</template>

<style scoped>
:deep(.segmented) {
  margin-bottom: var(--sp-3);
}

/* —— 大金额区 —— */
.amount {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
  padding: var(--sp-2) 0 var(--sp-4);
  border-bottom: 1px solid var(--rule-soft);
  margin-bottom: var(--sp-3);
}

.amount__sign {
  font-size: var(--text-xl);
  color: var(--ink-2);
}

.amount__input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-variant-numeric: tabular-nums;
  font-size: var(--text-amount);
  font-weight: 500;
  line-height: 1.1;
  letter-spacing: -0.01em;
  color: var(--ink);
}

.amount__input:focus {
  outline: none;
}

.amount__input::placeholder {
  color: var(--ink-3);
}

.actions {
  display: flex;
  gap: var(--sp-2);
  justify-content: flex-end;
  margin-top: var(--sp-4);
}

/* —— 分类宫格 —— */
.cats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp-2);
  padding: var(--sp-2) 0 var(--sp-3);
  border-top: 1px solid var(--rule-soft);
}

.cat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: var(--sp-2) 2px;
  border: 2px solid transparent;
  border-radius: var(--radius);
  background: none;
  cursor: pointer;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}

.cat.is-active {
  border-color: var(--brand);
  background: var(--brand-wash);
}

.cat__bubble {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  background: var(--paper-sunken);
  color: var(--brand-2);
  font-size: var(--text-base);
  transition:
    background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.cat.is-active .cat__bubble {
  background: var(--brand);
  color: #fff;
}

.cat__bubble--new {
  background: transparent;
  border: 1.5px dashed var(--ink-3);
  color: var(--ink-2);
}

.cat__name {
  max-width: 100%;
  font-size: 11px;
  color: var(--ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cat.is-active .cat__name {
  color: var(--brand);
  font-weight: 500;
}

.catnew {
  display: flex;
  gap: var(--sp-2);
  margin-bottom: var(--sp-3);
}

.catnew .field__control {
  flex: 1;
}

/* —— 属性 chips —— */
.attrs {
  display: flex;
  gap: var(--sp-2);
  margin-bottom: var(--sp-3);
  overflow-x: auto;
}

.attr {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 var(--sp-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-pill);
  background: var(--paper-raised);
}

.attr__label {
  flex: none;
  font-size: var(--text-xs);
  color: var(--ink-2);
}

.attr__control {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-size: var(--text-sm);
  color: var(--ink);
  padding: 0;
}

.attr__control:focus {
  outline: none;
}

select.attr__control {
  appearance: none;
}

input[type='date'].attr__control {
  font-variant-numeric: tabular-nums;
}

/* —— 备注 —— */
.note-input {
  width: 100%;
  min-height: 40px;
  padding: 0 var(--sp-3);
  margin-bottom: var(--sp-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-pill);
  background: var(--paper-raised);
  color: var(--ink);
  font-size: var(--text-sm);
}

.note-input:focus {
  border-color: var(--brand-2);
  outline: none;
}

.note-input::placeholder {
  color: var(--ink-3);
}

</style>
