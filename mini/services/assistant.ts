import { request } from '../lib/http';

export interface AssistantConversation { id: number; }
export interface AssistantMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  blocks?: Array<{ type: string; data?: unknown }>;
}

export async function openAssistantConversation(): Promise<AssistantConversation> {
  const conversations = await request<AssistantConversation[]>('/api/assistant/conversations');
  return conversations[0] ?? request<AssistantConversation>('/api/assistant/conversations', { method: 'POST', data: {} });
}

export function listAssistantMessages(conversationId: number): Promise<AssistantMessage[]> {
  return request<AssistantMessage[]>(`/api/assistant/conversations/${conversationId}/messages`);
}

export function sendAssistantMessage(conversationId: number, content: string): Promise<AssistantMessage> {
  return request<AssistantMessage>(`/api/assistant/conversations/${conversationId}/messages`, {
    method: 'POST', data: { content },
  });
}
