import { currentMonth } from '../../services/business-state';
import {
  cancelAssistantAction, confirmAssistantAction, listAssistantMessages, openAssistantConversation,
  sendAssistantMessage, updateAssistantAction,
  type AssistantMessage, type DraftFields,
} from '../../services/assistant';

/** 确认卡的视图模型：展示字段 + 本地交互状态。 */
interface DraftView {
  actionId: number;
  actionType: string;
  typeLabel: string;
  rows: Array<{ key: string; label: string; value: string }>;
  amount: string;
  occurredOn: string;
  accountName: string;
  toAccountName: string;
  categoryName: string;
  note: string;
  inferred: string[];
  editing: boolean;
  busy: boolean;
  status: 'proposed' | 'confirmed' | 'cancelled';
  error: string;
}

interface Data {
  context: string;
  messages: AssistantMessage[];
  input: string;
  loading: boolean;
  error: string;
  drafts: DraftView[];
  form: DraftFields | null;
}
interface Context { data: Data & { conversationId: number | null }; setData(data: Partial<Data & { conversationId: number | null }>): void; }

const TYPE_LABELS: Record<string, string> = {
  expense: '支出', income: '收入', transfer: '转账',
  create_transaction: '记账草稿', update_transaction: '修改交易', delete_transaction: '删除交易',
  create_account: '新建账户', calibrate_account: '余额校准',
  create_liability: '新建负债', create_repayment: '负债还款',
  upsert_asset: '资产估值更新', investment_buy: '投资买入',
};
const HIDDEN_FIELDS = ['accountId', 'toAccountId', 'assetId', 'liabilityId'];
const FIELD_LABELS: Record<string, string> = {
  amount: '金额', occurredOn: '日期', note: '备注', categoryName: '分类',
  accountName: '账户', toAccountName: '转入账户', name: '名称', kind: '类型',
  value: '市值', actualBalance: '实际余额', openingBalance: '期初余额',
  remaining: '剩余本金', monthlyPayment: '月供', paymentDay: '还款日',
};

function errorText(error: unknown): string { return error instanceof Error ? error.message : '助手暂时不可用，请稍后重试'; }

/** 从消息里收集草稿卡；已处理过的状态（编辑中/已确认/已取消）按 actionId 保留。 */
function buildDrafts(messages: AssistantMessage[], previous: DraftView[]): DraftView[] {
  const drafts: DraftView[] = [];
  for (const message of messages) {
    for (const block of message.blocks ?? []) {
      if (!('actionId' in block)) continue;
      const actionType = String((block as { type?: string }).type ?? 'create_transaction');
      const fields = block.fields;
      const before = previous.find((item) => item.actionId === block.actionId);
      const rows = Object.entries(fields ?? {})
        .filter(([key, value]) => value != null && value !== '' && HIDDEN_FIELDS.indexOf(key) < 0)
        .map(([key, value]) => ({ key, label: FIELD_LABELS[key] ?? key, value: String(value) }));
      drafts.push({
        actionId: block.actionId,
        actionType,
        typeLabel: TYPE_LABELS[actionType] ?? actionType,
        rows,
        amount: fields.amount,
        occurredOn: fields.occurredOn,
        accountName: fields.accountName || '默认账户',
        toAccountName: fields.toAccountName || '',
        categoryName: fields.categoryName || '未指定',
        note: fields.note || '',
        inferred: block.inferredFields ?? [],
        editing: before ? before.editing : false,
        busy: false,
        status: before ? before.status : 'proposed',
        error: '',
      });
    }
  }
  return drafts;
}

function patchDraft(page: Context, actionId: number, patch: Partial<DraftView>): void {
  page.setData({
    drafts: page.data.drafts.map((draft) => draft.actionId === actionId ? { ...draft, ...patch } : draft),
  });
}

Page({
  data: {
    context: `当前页面：${currentMonth().replace('-', ' 年 ')} 月账目`,
    messages: [], input: '', loading: false, error: '', conversationId: null, drafts: [], form: null,
  },
  async onLoad(): Promise<void> {
    const page = this as unknown as Context;
    page.setData({ loading: true, error: '' });
    try {
      const conversation = await openAssistantConversation();
      const messages = await listAssistantMessages(conversation.id);
      page.setData({ conversationId: conversation.id, messages, drafts: buildDrafts(messages, page.data.drafts) });
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
      const messages = [...page.data.messages, response];
      page.setData({ messages, drafts: buildDrafts(messages, page.data.drafts) });
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

  /** 需求 7：确认卡提供「修改」，改完重新展示最新预览。 */
  startDraftEdit(event: { currentTarget: { dataset: { id: number | string } } }): void {
    const page = this as unknown as Context;
    const actionId = Number(event.currentTarget.dataset.id);
    const draft = page.data.drafts.find((item) => item.actionId === actionId);
    if (!draft) return;
    patchDraft(page, actionId, { editing: true, error: '' });
    page.setData({
      form: {
        type: '', amount: draft.amount, occurredOn: draft.occurredOn,
        categoryName: draft.categoryName === '未指定' ? '' : draft.categoryName,
        note: draft.note,
      },
    });
  },
  handleFormInput(event: { currentTarget: { dataset: { field: string } }; detail: { value: string } }): void {
    const page = this as unknown as Context;
    const form = page.data.form;
    if (!form) return;
    const field = event.currentTarget.dataset.field as keyof DraftFields;
    page.setData({ form: { ...form, [field]: event.detail.value } });
  },
  stopDraftEdit(event: { currentTarget: { dataset: { id: number | string } } }): void {
    const page = this as unknown as Context;
    patchDraft(page, Number(event.currentTarget.dataset.id), { editing: false, error: '' });
    page.setData({ form: null });
  },
  async saveDraft(event: { currentTarget: { dataset: { id: number | string } } }): Promise<void> {
    const page = this as unknown as Context;
    const actionId = Number(event.currentTarget.dataset.id);
    const form = page.data.form;
    if (!form) return;
    patchDraft(page, actionId, { busy: true, error: '' });
    try {
      await updateAssistantAction(actionId, {
        amount: form.amount, occurredOn: form.occurredOn, categoryName: form.categoryName, note: form.note,
      });
      patchDraft(page, actionId, {
        busy: false, editing: false,
        amount: String(form.amount ?? ''), occurredOn: String(form.occurredOn ?? ''),
        categoryName: form.categoryName ? String(form.categoryName) : '未指定',
        note: form.note ? String(form.note) : '',
      });
      page.setData({ form: null });
    } catch (error) {
      patchDraft(page, actionId, { busy: false, error: errorText(error) });
    }
  },
  async confirmDraft(event: { currentTarget: { dataset: { id: number | string } } }): Promise<void> {
    const page = this as unknown as Context;
    const actionId = Number(event.currentTarget.dataset.id);
    patchDraft(page, actionId, { busy: true, error: '' });
    try {
      await confirmAssistantAction(actionId);
      patchDraft(page, actionId, { busy: false, status: 'confirmed', editing: false });
      page.setData({ form: null });
      wx.showToast({ title: '已记入账本', icon: 'success' });
    } catch (error) {
      patchDraft(page, actionId, { busy: false, error: errorText(error) });
    }
  },
  async cancelDraft(event: { currentTarget: { dataset: { id: number | string } } }): Promise<void> {
    const page = this as unknown as Context;
    const actionId = Number(event.currentTarget.dataset.id);
    patchDraft(page, actionId, { busy: true, error: '' });
    try {
      await cancelAssistantAction(actionId);
      patchDraft(page, actionId, { busy: false, status: 'cancelled', editing: false });
      page.setData({ form: null });
      wx.showToast({ title: '已取消，未修改账本', icon: 'none' });
    } catch (error) {
      patchDraft(page, actionId, { busy: false, error: errorText(error) });
    }
  },
});
