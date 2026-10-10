import { currentMonth } from '../../services/business-state';
import { listAssistantMessages, openAssistantConversation, sendAssistantMessage, type AssistantMessage } from '../../services/assistant';

interface Data { context: string; messages: AssistantMessage[]; input: string; loading: boolean; error: string; }
interface Context { data: Data & { conversationId: number | null }; setData(data: Partial<Data & { conversationId: number | null }>): void; }

function errorText(error: unknown): string { return error instanceof Error ? error.message : '助手暂时不可用，请稍后重试'; }

Page({
  data: { context: `当前页面：${currentMonth().replace('-', ' 年 ')} 月账目`, messages: [], input: '', loading: false, error: '', conversationId: null },
  async onLoad(): Promise<void> {
    const page = this as unknown as Context;
    page.setData({ loading: true, error: '' });
    try {
      const conversation = await openAssistantConversation();
      const messages = await listAssistantMessages(conversation.id);
      page.setData({ conversationId: conversation.id, messages });
    } catch (error) { page.setData({ error: errorText(error) }); }
    finally { page.setData({ loading: false }); }
  },
  handleInput(event: { detail: { value: string } }): void { (this as unknown as Context).setData({ input: event.detail.value }); },
  sendQuick(event: { currentTarget: { dataset: { prompt: string } } }): void { void (this as unknown as { send(value?: string): Promise<void> }).send(event.currentTarget.dataset.prompt); },
  submit(): void { void (this as unknown as { send(): Promise<void> }).send(); },
  async send(value?: string): Promise<void> {
    const page = this as unknown as Context;
    const content = (value ?? page.data.input).trim();
    if (!content || page.data.loading || page.data.conversationId === null) return;
    // 先把用户消息挂上去（乐观更新），不等 Agent 回复才显示。
    const pendingId = -Date.now();
    page.setData({
      input: '', loading: true, error: '',
      messages: [...page.data.messages, { id: pendingId, role: 'user', content }],
    });
    try {
      const response = await sendAssistantMessage(page.data.conversationId, content);
      page.setData({ messages: [...page.data.messages, response] });
    } catch (error) {
      // 失败时撤回本地这条消息并把内容还给输入框。
      page.setData({
        messages: page.data.messages.filter((message) => message.id !== pendingId),
        input: content,
        error: errorText(error),
      });
    }
    finally { page.setData({ loading: false }); }
  },
});
