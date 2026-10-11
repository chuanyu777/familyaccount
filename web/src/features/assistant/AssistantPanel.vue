<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue';
import { ArrowUp, ChartSpline, Paperclip, ReceiptText, Search, Sparkles, SquarePen, X } from 'lucide-vue-next';
import { apiGet, apiPatch, apiPost } from '../../lib/api';
import { publishResources } from '../../lib/resourceInvalidation';

interface DraftFields {
  type: string;
  amount: string;
  occurredOn: string;
  accountId?: number | null;
  accountName?: string | null;
  toAccountId?: number | null;
  toAccountName?: string | null;
  categoryName?: string | null;
  note?: string | null;
}

/** 记账草稿卡：用户确认后才会真正写入账本。 */
interface DraftBlock {
  type: 'transaction_draft';
  actionId: number;
  version: number;
  fields: DraftFields;
  inferredFields?: string[];
}

type MessageBlock = { type: 'metric'; data?: unknown; suggestions?: string[] } | DraftBlock;

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  blocks?: MessageBlock[];
}

const props = withDefaults(defineProps<{ open: boolean; contextLabel?: string }>(), {
  contextLabel: '当前页面：本月账目',
});
const emit = defineEmits<{ 'update:open': [open: boolean] }>();
const loading = ref(false);
const input = ref('');
const conversationId = ref<number | null>(null);
const messages = ref<Message[]>([]);
const scroller = ref<HTMLElement>();

// 草稿卡的本地交互状态：编辑中的表单、按钮忙碌、操作结果与错误。
const draftEdits = reactive<Record<number, DraftFields>>({});
const draftBusy = reactive<Record<number, boolean>>({});
const draftStatus = reactive<Record<number, 'proposed' | 'confirmed' | 'cancelled'>>({});
const draftError = reactive<Record<number, string>>({});

// 每次登录用一个新会话；同一标签页内（含刷新、切 Tab）沿用同一会话，保证多轮上下文。
const CONVERSATION_KEY = 'family-ledger.assistant-conversation';

async function ensureConversation() {
  if (conversationId.value) return;
  const remembered = Number(sessionStorage.getItem(CONVERSATION_KEY) ?? '');
  if (Number.isFinite(remembered) && remembered > 0) {
    conversationId.value = remembered;
    messages.value = await apiGet<Message[]>(`/assistant/conversations/${remembered}/messages`);
    return;
  }
  conversationId.value = (await apiPost<{ id: number }>('/assistant/conversations', {})).id;
  sessionStorage.setItem(CONVERSATION_KEY, String(conversationId.value));
  messages.value = [];
}
async function scrollToBottom(smooth = false) {
  await nextTick();
  if (typeof scroller.value?.scrollTo === 'function') {
    scroller.value.scrollTo({ top: scroller.value.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }
}
async function reveal() {
  emit('update:open', true);
  try { await ensureConversation(); } catch { /* 网络恢复后仍可继续输入 */ }
  await scrollToBottom();
}
function close() { emit('update:open', false); }
async function newConversation() {
  if (loading.value) return;
  try {
    conversationId.value = (await apiPost<{ id: number }>('/assistant/conversations', {})).id;
    sessionStorage.setItem(CONVERSATION_KEY, String(conversationId.value));
    messages.value = [];
  } catch { /* 不丢弃现有对话 */ }
}
// 输入法组词时的回车是「选词确认」，不能当发送；Shift+Enter 仍用于换行。
function onEnter(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  void send();
}
async function send(value = input.value) {
  const content = value.trim();
  if (!content || loading.value) return;
  input.value = '';
  loading.value = true;
  // 先把用户消息挂上去（乐观更新），不等 Agent 回复才显示。
  const pendingId = -Date.now();
  messages.value = [...messages.value, { id: pendingId, role: 'user', content }];
  await scrollToBottom(true);
  try {
    await ensureConversation();
    const response = await apiPost<Message>(`/assistant/conversations/${conversationId.value}/messages`, { content });
    messages.value = [...messages.value, response];
    await scrollToBottom(true);
  } catch {
    // 失败时撤回本地这条消息并把内容还给输入框，避免「发出去了却没反应」。
    messages.value = messages.value.filter((message) => message.id !== pendingId);
    input.value = content;
  } finally { loading.value = false; }
}
function quickEntry() { void send('帮我记一笔'); }
function quickSummary() { void send('总结本月'); }
function quickSearch() { void send('查最近大额'); }
function insightRows(message: Message): Array<{ label: string; value: string }> {
  const block = message.blocks?.[0];
  const data = block && block.type === 'metric' ? block.data : undefined;
  if (!data || typeof data !== 'object') return [];
  const values = data as Record<string, unknown>;
  const format = (value: unknown) => value == null || value === '' ? '—' : `¥${String(value)}`;
  if ('income' in values || 'expense' in values || 'net' in values) {
    return [
      { label: '收入', value: format(values.income) },
      { label: '支出', value: format(values.expense) },
      { label: '结余', value: format(values.net) },
    ];
  }
  if ('assetsTotal' in values || 'totalLiabilities' in values || 'netWorth' in values) {
    return [
      { label: '资产', value: format(values.assetsTotal) },
      { label: '负债', value: format(values.totalLiabilities) },
      { label: '净资产', value: format(values.netWorth) },
    ];
  }
  return [];
}
function insightPeriod(message: Message): string {
  const block = message.blocks?.[0];
  const data = block && block.type === 'metric' ? block.data : undefined;
  return data && typeof data === 'object' && 'month' in data ? String(data.month) : '当前账本';
}

// —— 记账确认卡（需求 4.1 / 7：先出草稿，用户可修改、取消、确认后才写入账本）——

const TYPE_LABELS: Record<string, string> = { expense: '支出', income: '收入', transfer: '转账' };
function typeLabel(type: string): string { return TYPE_LABELS[type] ?? type; }

function draftsOf(message: Message): DraftBlock[] {
  return (message.blocks ?? []).filter((block): block is DraftBlock => block.type === 'transaction_draft');
}
function isInferred(block: DraftBlock, field: string): boolean {
  return (block.inferredFields ?? []).includes(field);
}
function draftValue(block: DraftBlock, key: keyof DraftFields): string {
  const editing = draftEdits[block.actionId];
  const value = editing ? editing[key] : block.fields[key];
  return value == null ? '' : String(value);
}
function draftEditing(block: DraftBlock): boolean { return Boolean(draftEdits[block.actionId]); }
function draftState(block: DraftBlock): 'proposed' | 'confirmed' | 'cancelled' {
  return draftStatus[block.actionId] ?? 'proposed';
}
function startDraftEdit(block: DraftBlock) {
  draftEdits[block.actionId] = { ...block.fields };
  draftError[block.actionId] = '';
}
function stopDraftEdit(block: DraftBlock) {
  delete draftEdits[block.actionId];
  draftError[block.actionId] = '';
}
/** 确认卡上只允许改这几个文本字段；账户与类型不在卡上编辑。 */
type EditableDraftField = 'amount' | 'occurredOn' | 'categoryName' | 'note';
function updateDraftField(block: DraftBlock, key: EditableDraftField, value: string) {
  const editing = draftEdits[block.actionId];
  if (editing) editing[key] = value;
}
async function saveDraft(block: DraftBlock) {
  const form = draftEdits[block.actionId];
  if (!form || draftBusy[block.actionId]) return;
  draftBusy[block.actionId] = true;
  draftError[block.actionId] = '';
  try {
    const updated = await apiPatch<{ version: number; payload?: DraftFields }>(
      `/assistant/actions/${block.actionId}`,
      { amount: form.amount, occurredOn: form.occurredOn, categoryName: form.categoryName, note: form.note },
    );
    // 用后端返回的最新预览覆盖卡片，保证看到的就是将要写入的内容。
    Object.assign(block.fields, updated.payload ?? form);
    block.version = updated.version ?? block.version + 1;
    delete draftEdits[block.actionId];
  } catch (error) {
    draftError[block.actionId] = error instanceof Error ? error.message : '保存草稿失败';
  } finally { draftBusy[block.actionId] = false; }
}
async function confirmDraft(block: DraftBlock) {
  if (draftBusy[block.actionId]) return;
  draftBusy[block.actionId] = true;
  draftError[block.actionId] = '';
  try {
    await apiPost(`/assistant/actions/${block.actionId}/confirm`, {});
    draftStatus[block.actionId] = 'confirmed';
    delete draftEdits[block.actionId];
    // 记账成功后让账目、账户与统计重新拉取。
    publishResources(['transactions', 'accounts', 'statistics']);
  } catch (error) {
    draftError[block.actionId] = error instanceof Error ? error.message : '确认失败';
  } finally { draftBusy[block.actionId] = false; }
}
async function cancelDraft(block: DraftBlock) {
  if (draftBusy[block.actionId]) return;
  draftBusy[block.actionId] = true;
  draftError[block.actionId] = '';
  try {
    await apiPost(`/assistant/actions/${block.actionId}/cancel`, {});
    draftStatus[block.actionId] = 'cancelled';
    delete draftEdits[block.actionId];
  } catch (error) {
    draftError[block.actionId] = error instanceof Error ? error.message : '取消失败';
  } finally { draftBusy[block.actionId] = false; }
}

watch(() => props.open, open => { if (open) void reveal(); }, { immediate: true });
</script>

<template>
  <button class="assistant-fab" :class="{ 'assistant-fab--active': open }" type="button" :aria-label="open ? '收起财务助手' : '打开家庭财务助手'" :aria-pressed="open" @click="open ? close() : reveal()">
    <Sparkles :size="17" aria-hidden="true" /><span>{{ open ? '收起助手' : '问问助手' }}</span>
  </button>

  <div v-if="open" class="assistant-scrim" @click.self="close">
    <aside class="assistant-panel" aria-label="财务助手对话">
      <header class="assistant-panel__header">
        <div class="assistant-title">
          <span class="assistant-logo"><Sparkles :size="18" aria-hidden="true" /></span>
          <div><strong>财务助手</strong><span><i class="assistant-status-dot" aria-hidden="true" />正在使用本账本数据</span></div>
        </div>
        <div class="assistant-header-actions">
          <button type="button" aria-label="新对话" title="新对话" @click="newConversation"><SquarePen :size="17" /></button>
          <button type="button" aria-label="关闭" title="关闭" @click="close"><X :size="18" /></button>
        </div>
      </header>

      <div class="assistant-context"><Paperclip :size="13" aria-hidden="true" /><span>{{ contextLabel }}</span><button type="button" aria-label="移除页面上下文"><X :size="13" /></button></div>

      <div ref="scroller" class="assistant-chat" aria-live="polite">
        <section class="assistant-intro">
          <span class="assistant-small-logo"><Sparkles :size="14" aria-hidden="true" /></span>
          <p>我可以帮你记账、查账和解释家庭财务变化。</p>
          <div class="assistant-quick-actions">
            <button type="button" @click="quickEntry"><ReceiptText :size="13" />帮我记一笔</button>
            <button type="button" @click="quickSummary"><ChartSpline :size="13" />总结本月</button>
            <button type="button" @click="quickSearch"><Search :size="13" />查最近大额</button>
          </div>
        </section>
        <div v-for="message in messages" :key="message.id" class="assistant-message" :class="`assistant-message--${message.role}`">
          <div class="assistant-message__bubble">{{ message.content }}</div>
          <div v-if="message.blocks?.[0]?.type === 'metric' && insightRows(message).length" class="assistant-card assistant-insight-card">
            <div class="assistant-insight-card__period"><span>账本摘要</span><span>{{ insightPeriod(message) }}</span></div>
            <div class="assistant-insight-card__metrics"><div v-for="row in insightRows(message)" :key="row.label"><span>{{ row.label }}</span><strong>{{ row.value }}</strong></div></div>
          </div>
          <div v-for="draft in draftsOf(message)" :key="`draft-${draft.actionId}`" class="assistant-card assistant-draft-card">
            <div class="assistant-draft-card__head"><span>待确认的记账草稿</span><span class="assistant-draft-card__type">{{ typeLabel(draft.fields.type) }}</span></div>
            <ul class="assistant-draft-card__rows">
              <li><span>金额</span>
                <input v-if="draftEditing(draft)" class="assistant-draft-card__input" inputmode="decimal" :value="draftValue(draft, 'amount')" @input="updateDraftField(draft, 'amount', ($event.target as HTMLInputElement).value)" />
                <strong v-else>¥{{ draft.fields.amount }}</strong>
                <em v-if="isInferred(draft, 'amount')">AI 补充</em>
              </li>
              <li><span>日期</span>
                <input v-if="draftEditing(draft)" class="assistant-draft-card__input" type="date" :value="draftValue(draft, 'occurredOn')" @input="updateDraftField(draft, 'occurredOn', ($event.target as HTMLInputElement).value)" />
                <strong v-else>{{ draft.fields.occurredOn }}</strong>
                <em v-if="isInferred(draft, 'occurred_on')">AI 补充</em>
              </li>
              <li><span>账户</span><strong>{{ draft.fields.accountName || draft.fields.accountId || '默认账户' }}</strong></li>
              <li v-if="draft.fields.toAccountName"><span>转入</span><strong>{{ draft.fields.toAccountName }}</strong></li>
              <li><span>分类</span>
                <input v-if="draftEditing(draft)" class="assistant-draft-card__input" :value="draftValue(draft, 'categoryName')" @input="updateDraftField(draft, 'categoryName', ($event.target as HTMLInputElement).value)" />
                <strong v-else>{{ draft.fields.categoryName || '未指定' }}</strong>
                <em v-if="isInferred(draft, 'category_name')">AI 补充</em>
              </li>
              <li><span>备注</span>
                <input v-if="draftEditing(draft)" class="assistant-draft-card__input" :value="draftValue(draft, 'note')" @input="updateDraftField(draft, 'note', ($event.target as HTMLInputElement).value)" />
                <strong v-else>{{ draft.fields.note || '—' }}</strong>
              </li>
            </ul>
            <p v-if="draftError[draft.actionId]" class="assistant-draft-card__error" role="alert">{{ draftError[draft.actionId] }}</p>
            <p v-if="draftState(draft) === 'confirmed'" class="assistant-draft-card__done">已记入账本</p>
            <p v-else-if="draftState(draft) === 'cancelled'" class="assistant-draft-card__done">已取消，没有对账本做任何修改</p>
            <div v-else class="assistant-draft-card__actions">
              <template v-if="draftEditing(draft)">
                <button type="button" class="assistant-draft-btn assistant-draft-btn--primary" :disabled="draftBusy[draft.actionId]" @click="saveDraft(draft)">保存修改</button>
                <button type="button" class="assistant-draft-btn" :disabled="draftBusy[draft.actionId]" @click="stopDraftEdit(draft)">放弃</button>
              </template>
              <template v-else>
                <button type="button" class="assistant-draft-btn assistant-draft-btn--primary" :disabled="draftBusy[draft.actionId]" @click="confirmDraft(draft)">确认记账</button>
                <button type="button" class="assistant-draft-btn" :disabled="draftBusy[draft.actionId]" @click="startDraftEdit(draft)">修改</button>
                <button type="button" class="assistant-draft-btn" :disabled="draftBusy[draft.actionId]" @click="cancelDraft(draft)">取消</button>
              </template>
            </div>
          </div>
        </div>
        <div v-if="loading" class="assistant-message assistant-message--assistant"><div class="assistant-message__bubble">正在查看账本…</div></div>
      </div>

      <form class="assistant-composer" @submit.prevent="send()"><textarea v-model="input" rows="1" placeholder="问问你的家庭账本（回车发送，Shift+回车换行）" aria-label="向财务助手提问" @keydown.enter="onEnter" /><button type="submit" :disabled="loading || !input.trim()" aria-label="发送"><ArrowUp :size="17" /></button></form>
      <p class="assistant-disclaimer">AI 只会在你确认后写入账本</p>
    </aside>
  </div>
</template>

<style scoped>
.assistant-fab { position: fixed; right: 24px; bottom: 24px; z-index: 40; display: inline-flex; min-height: 43px; align-items: center; justify-content: center; gap: 7px; padding: 10px 15px; border: 1px solid var(--primary); border-radius: 13px; background: var(--surface); box-shadow: 0 8px 20px rgba(19, 23, 34, .16); color: var(--primary); font-size: 13px; font-weight: 500; cursor: pointer; }
.assistant-fab--active { background: var(--surface-accent); }
.assistant-scrim { position: fixed; inset: 0; z-index: 30; pointer-events: none; }
.assistant-panel { position: fixed; top: 64px; right: 0; bottom: 0; display: flex; width: 380px; min-width: 0; flex-direction: column; border-left: 1px solid var(--line); background: var(--surface); pointer-events: auto; }
.assistant-panel__header { display: flex; min-height: 64px; align-items: center; justify-content: space-between; padding: 12px 15px; border-bottom: 1px solid var(--line); }
.assistant-title { display: flex; align-items: center; gap: 10px; }.assistant-logo, .assistant-small-logo { display: grid; place-items: center; border-radius: 11px; background: var(--primary); color: #fff; }.assistant-logo { width: 36px; height: 36px; }.assistant-title > div { display: grid; gap: 3px; }.assistant-title strong { font-size: 14px; font-weight: 500; }.assistant-title span { display: flex; align-items: center; gap: 5px; color: var(--muted); font-size: 10px; }.assistant-status-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--income); }
.assistant-header-actions { display: flex; gap: 3px; }.assistant-header-actions button { display: grid; width: 34px; height: 34px; place-items: center; border: 0; border-radius: 9px; background: transparent; color: var(--muted); cursor: pointer; }.assistant-header-actions button:hover { background: var(--bg); color: var(--ink); }
.assistant-context { display: flex; align-items: center; gap: 7px; margin: 10px 14px 0; padding: 8px 10px; border-radius: 10px; background: var(--surface-accent); color: var(--primary); font-size: 11px; }.assistant-context span { flex: 1; }.assistant-context button { display: grid; place-items: center; padding: 0; border: 0; background: transparent; color: inherit; cursor: pointer; }
.assistant-chat { flex: 1; overflow-y: auto; padding: 17px 14px 12px; }.assistant-intro { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 8px; margin-bottom: 17px; }.assistant-small-logo { width: 28px; height: 28px; border-radius: 9px; }.assistant-intro p { margin: 4px 0 10px; font-size: 12px; line-height: 1.5; }.assistant-quick-actions { grid-column: 2; display: flex; flex-wrap: wrap; gap: 6px; }.assistant-quick-actions button { display: inline-flex; align-items: center; gap: 5px; padding: 7px 9px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); color: var(--ink); font-size: 11px; cursor: pointer; }.assistant-quick-actions button svg { color: var(--primary); }
.assistant-message { display: flex; flex-direction: column; gap: 8px; margin: 0 0 14px; }.assistant-message--user { align-items: flex-end; }.assistant-message__bubble { max-width: 88%; padding: 9px 12px; border-radius: 13px 13px 13px 3px; background: var(--surface-accent); color: var(--ink); font-size: 12px; line-height: 1.55; white-space: pre-wrap; }.assistant-message--user .assistant-message__bubble { border-radius: 13px 13px 3px 13px; background: var(--primary); color: #fff; }
.assistant-card { width: 100%; overflow: hidden; border: 1px solid var(--line); border-radius: 14px; background: var(--bg); }.assistant-insight-card { padding: 13px; }.assistant-insight-card__period { display: flex; justify-content: space-between; color: var(--muted); font-size: 10px; }.assistant-insight-card__period span:first-child { color: var(--ink); font-weight: 500; }.assistant-insight-card__metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 13px; }.assistant-insight-card__metrics div { display: grid; gap: 3px; min-width: 0; }.assistant-insight-card__metrics span { color: var(--muted); font-size: 9px; }.assistant-insight-card__metrics strong { overflow: hidden; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.assistant-composer { display: grid; grid-template-columns: 1fr 34px; align-items: end; gap: 7px; margin: 0 14px 5px; padding: 8px 8px 8px 11px; border: 1px solid var(--line); border-radius: 13px; background: var(--bg); }.assistant-composer textarea { width: 100%; min-height: 29px; max-height: 72px; resize: none; padding: 6px 0 0; border: 0; outline: 0; background: transparent; color: var(--ink); font-size: 12px; line-height: 1.4; }.assistant-composer textarea::placeholder { color: var(--muted); }.assistant-composer button { display: grid; width: 34px; height: 34px; place-items: center; border: 0; border-radius: 10px; background: var(--primary); color: #fff; cursor: pointer; }.assistant-composer button:disabled { opacity: .4; cursor: default; }.assistant-disclaimer { margin: 0 0 9px; color: var(--muted); font-size: 9px; text-align: center; }
@media (max-width: 767px) { .assistant-fab { right: 16px; bottom: calc(var(--safe-bottom) + 140px); }.assistant-scrim { background: rgba(19, 23, 34, .2); pointer-events: auto; }.assistant-panel { top: 0; width: min(100%, 480px); box-shadow: -8px 0 24px rgba(19, 23, 34, .14); } }

/* 面板打开时把浮动按钮让到面板外侧，避免压住输入框右侧的发送按钮。 */
.assistant-fab--active { right: calc(380px + 16px); }
@media (max-width: 767px) {
  /* 移动端面板接近全宽，没有可让位的空间；收起改由面板内的关闭按钮完成。 */
  .assistant-fab--active { display: none; }
}

/* —— 记账确认卡（需求 7：展示字段、标出 AI 补全项，并提供修改/取消/确认）—— */
.assistant-draft-card { display: grid; gap: 9px; padding: 13px; }
.assistant-draft-card__head { display: flex; align-items: center; justify-content: space-between; color: var(--ink); font-size: 12px; font-weight: 500; }
.assistant-draft-card__type { padding: 2px 8px; border-radius: var(--radius-pill); background: var(--surface-accent); color: var(--primary); font-size: 10px; font-weight: 400; }
.assistant-draft-card__rows { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; }
.assistant-draft-card__rows li { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.assistant-draft-card__rows li > span:first-child { flex: 0 0 34px; color: var(--muted); }
.assistant-draft-card__rows strong { flex: 1; min-width: 0; overflow: hidden; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.assistant-draft-card__rows em { padding: 1px 6px; border-radius: var(--radius-pill); background: var(--surface-accent); color: var(--primary); font-size: 9px; font-style: normal; }
.assistant-draft-card__input { flex: 1; min-width: 0; min-height: 30px; padding: 0 8px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); font-size: 11px; }
.assistant-draft-card__actions { display: flex; flex-wrap: wrap; gap: 6px; }
.assistant-draft-btn { min-height: 32px; padding: 0 12px; border: 1px solid var(--line); border-radius: var(--radius-pill); background: var(--surface); color: var(--ink); font-size: 11px; cursor: pointer; }
.assistant-draft-btn--primary { border-color: var(--primary); background: var(--primary); color: #fff; }
.assistant-draft-btn:disabled { opacity: .45; cursor: not-allowed; }
.assistant-draft-card__error { margin: 0; color: var(--expense); font-size: 10px; }
.assistant-draft-card__done { margin: 0; color: var(--muted); font-size: 11px; }
</style>
