// Provider abstraction — every AI provider implements this interface.

import type { HistoryMessage } from '@/lib/ai/schema';

export interface ProviderRequest {
  systemPrompt: string;
  messages: HistoryMessage[];
  maxTokens?: number;
  correlationId: string;
}

export interface ProviderResponse {
  content: string;
  provider: string;
  model: string;
  latencyMs: number;
}

export interface AIProvider {
  readonly name: string;
  send(request: ProviderRequest): Promise<ProviderResponse>;
}
