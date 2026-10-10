import { request } from '../lib/http';

export interface AssistantConversation { id: number; }
export interface AssistantMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  blocks?: Array<{ type: string; data?: unknown }>;
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
