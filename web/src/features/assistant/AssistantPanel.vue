<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { apiGet, apiPost } from '../../lib/api';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  blocks?: Array<{ type: string; data?: unknown; suggestions?: string[] }>;
}

const open = ref(false);
const loading = ref(false);
const input = ref('');
const conversationId = ref<number | null>(null);
const messages = ref<Message[]>([]);
const scroller = ref<HTMLElement>();

async function ensureConversation() {
  if (conversationId.value) return;
  const rows = await apiGet<Array<{ id: number }>>('/assistant/conversations');
  if (rows.length) conversationId.value = rows[0]!.id;
  else {
    const created = await apiPost<{ id: number }>('/assistant/conversations', {});
    conversationId.value = created.id;
  }
  messages.value = await apiGet<Message[]>(`/assistant/conversations/${conversationId.value}/messages`);
}

async function show() {
  open.value = true;
  try { await ensureConversation(); } catch { /* 页面仍可显示输入框 */ }
  await nextTick();
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight });
}

async function send(value = input.value) {
  const content = value.trim();
  if (!content || loading.value) return;
  input.value = '';
  loading.value = true;
  try {
    await ensureConversation();
    const response = await apiPost<Message>(
      `/assistant/conversations/${conversationId.value}/messages`, { content });
    messages.value = [...messages.value, {
      id: response.id - 1,
      role: 'user',
      content,
    }, response];
    await nextTick();
    scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' });
  } finally {
    loading.value = false;
  }
}

onMounted(() => { if (open.value) void show(); });
</script>

<template>
  <button class="assistant-fab" type="button" aria-label="打开家庭财务助手" @click="show">
    <span class="assistant-fab__spark">✦</span>
    <span>问助手</span>
  </button>

  <div v-if="open" class="assistant-overlay" @click.self="open = false">
    <aside class="assistant-panel" aria-label="家庭财务助手">
      <header class="assistant-panel__header">
        <div>
          <p class="assistant-panel__eyebrow">FAMILY FINANCE AI</p>
          <h2>家庭财务助手</h2>
        </div>
        <button class="assistant-panel__close" type="button" aria-label="关闭" @click="open = false">×</button>
      </header>
      <div ref="scroller" class="assistant-panel__messages">
        <div v-if="!messages.length" class="assistant-empty">
          <div class="assistant-empty__icon">✦</div>
          <strong>今天想了解什么？</strong>
          <p>直接问我家庭收支、分类和账户余额。</p>
          <div class="assistant-suggestions">
            <button type="button" @click="send('本月花了多少？')">本月花了多少？</button>
            <button type="button" @click="send('钱都花在哪些分类？')">钱都花在哪些分类？</button>
            <button type="button" @click="send('看看账户余额')">看看账户余额</button>
          </div>
        </div>
        <div v-for="message in messages" :key="message.id" class="assistant-message" :class="`assistant-message--${message.role}`">
          <div class="assistant-message__bubble">{{ message.content }}</div>
          <div v-if="message.blocks?.[0]?.type === 'metric'" class="assistant-card">
            <template v-if="message.blocks[0].data && typeof message.blocks[0].data === 'object'">
              <div v-for="(value, key) in (message.blocks[0].data as Record<string, unknown>)" :key="key" v-show="String(key).endsWith('Cents') === false" class="assistant-card__row">
                <span>{{ key }}</span><strong>{{ value }}</strong>
              </div>
            </template>
          </div>
        </div>
        <div v-if="loading" class="assistant-message assistant-message--assistant"><div class="assistant-message__bubble">正在查看账本…</div></div>
      </div>
      <form class="assistant-composer" @submit.prevent="send()">
        <input v-model="input" placeholder="问问你的家庭账本" autocomplete="off" />
        <button type="submit" :disabled="loading || !input.trim()" aria-label="发送">↑</button>
      </form>
    </aside>
  </div>
</template>

<style scoped>
.assistant-fab { position: fixed; right: 24px; bottom: 24px; z-index: 20; display: inline-flex; align-items: center; gap: 7px; border: 0; border-radius: 999px; padding: 12px 17px; color: #fffdf7; background: #1e4b43; box-shadow: 0 12px 28px #1e4b4333; font: inherit; cursor: pointer; }
.assistant-fab__spark { color: #e3b866; font-size: 18px; }
.assistant-overlay { position: fixed; inset: 0; z-index: 30; background: #16241d2b; }
.assistant-panel { position: absolute; top: 20px; right: 20px; bottom: 20px; display: flex; width: min(420px, calc(100vw - 40px)); flex-direction: column; overflow: hidden; border: 1px solid #dcd7c9; border-radius: 22px; background: #faf9f3; box-shadow: 0 24px 80px #26352b2e; }
.assistant-panel__header { display: flex; justify-content: space-between; padding: 24px 24px 18px; border-bottom: 1px solid #e7e2d7; }
.assistant-panel__eyebrow { margin: 0 0 7px; color: #a17a38; font-size: 10px; letter-spacing: .16em; }
.assistant-panel h2 { margin: 0; color: #1d4039; font-size: 21px; }
.assistant-panel__close { border: 0; background: none; color: #7f877d; font-size: 28px; cursor: pointer; }
.assistant-panel__messages { flex: 1; overflow-y: auto; padding: 24px; }
.assistant-empty { padding: 34px 8px; text-align: center; color: #56635a; }
.assistant-empty__icon { margin: 0 auto 14px; color: #b4863b; font-size: 32px; }
.assistant-empty strong { color: #1e4039; font-size: 18px; }
.assistant-empty p { margin: 8px 0 20px; font-size: 13px; }
.assistant-suggestions { display: grid; gap: 8px; }
.assistant-suggestions button { border: 1px solid #ded8c8; border-radius: 12px; padding: 11px; background: #fffdf7; color: #31564d; text-align: left; cursor: pointer; }
.assistant-message { display: flex; flex-direction: column; margin: 0 0 16px; gap: 8px; }
.assistant-message--user { align-items: flex-end; }
.assistant-message__bubble { max-width: 88%; border-radius: 15px; padding: 11px 13px; background: #ebe9df; color: #283d35; font-size: 14px; line-height: 1.55; }
.assistant-message--user .assistant-message__bubble { background: #1e4b43; color: white; }
.assistant-card { width: 100%; border: 1px solid #e0dacb; border-radius: 13px; padding: 11px 13px; background: #fffdf7; }
.assistant-card__row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee9dc; color: #768078; font-size: 12px; }
.assistant-card__row:last-child { border: 0; }
.assistant-card__row strong { color: #284b42; font-weight: 600; }
.assistant-composer { display: flex; gap: 8px; padding: 15px; border-top: 1px solid #e7e2d7; background: #fffdf7; }
.assistant-composer input { flex: 1; min-width: 0; border: 1px solid #d8d4c9; border-radius: 12px; padding: 11px 13px; background: #faf9f3; outline: none; }
.assistant-composer button { width: 40px; border: 0; border-radius: 12px; background: #1e4b43; color: white; font-size: 19px; cursor: pointer; }
.assistant-composer button:disabled { opacity: .35; cursor: default; }
</style>
