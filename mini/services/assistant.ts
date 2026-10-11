import { request } from '../lib/http';

export interface AssistantConversation { id: number; }

/** 记账草稿卡字段（需求 4.1：先出草稿，用户确认后才写入账本）。 */
export interface DraftFields {
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

export interface DraftBlock {
  type: 'transaction_draft';
  actionId: number;
  version: number;
  fields: DraftFields;
  inferredFields?: string[];
}

export type MessageBlock = { type: string; data?: unknown } | DraftBlock;

export interface AssistantMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  blocks?: MessageBlock[];
}

// 同一登录期间沿用的会话 id；小程序重启或登出后清空，下次登录即新会话。
let activeConversationId: number | null = null;

export async function openAssistantConversation(): Promise<AssistantConversation> {
  // 同一登录期间沿用同一会话，保证多轮上下文；小程序重启或登出后视为新会话。
  if (activeConversationId !== null) return { id: activeConversationId };
  const created = await request<AssistantConversation>('/api/assistant/conversations', { method: 'POST', data: {} });
  activeConversationId = created.id;
  return created;
}

/** 登出时调用，使下一次登录从新会话开始。 */
export function resetAssistantConversation(): void { activeConversationId = null; }

export function listAssistantMessages(conversationId: number): Promise<AssistantMessage[]> {
  return request<AssistantMessage[]>(`/api/assistant/conversations/${conversationId}/messages`);
}

export function sendAssistantMessage(conversationId: number, content: string): Promise<AssistantMessage> {
  return request<AssistantMessage>(`/api/assistant/conversations/${conversationId}/messages`, {
    method: 'POST', data: { content },
  });
}

/** 确认记账：确认后由后端写入账本。 */
export function confirmAssistantAction(actionId: number): Promise<unknown> {
  return request(`/api/assistant/actions/${actionId}/confirm`, { method: 'POST', data: {} });
}

/** 取消草稿：后端会明确回应「没有对账本做任何修改」。 */
export function cancelAssistantAction(actionId: number): Promise<unknown> {
  return request(`/api/assistant/actions/${actionId}/cancel`, { method: 'POST', data: {} });
}

/** 修改草稿。微信 wx.request 不支持 PATCH，后端为小程序提供了 POST /update 变体。 */
export function updateAssistantAction(
  actionId: number, patch: Partial<DraftFields>,
): Promise<{ version: number; payload?: DraftFields }> {
  return request(`/api/assistant/actions/${actionId}/update`, { method: 'POST', data: patch });
}
