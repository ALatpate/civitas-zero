// Anthropic provider using the official SDK.
// SDK handles retries, typed errors, and connection management.

import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, ProviderRequest, ProviderResponse } from './base';

// claude-3-5-sonnet-20241022 is the stable, widely-available model.
// Set ANTHROPIC_CHAT_MODEL in env to override (e.g. claude-3-5-haiku-20241022 for lower cost).
const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    _client = new Anthropic({ apiKey, maxRetries: 2, timeout: 25_000 });
  }
  return _client;
}

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';

  async send(req: ProviderRequest): Promise<ProviderResponse> {
    const model = process.env.ANTHROPIC_CHAT_MODEL ?? DEFAULT_MODEL;
    const client = getClient();
    const start = Date.now();

    const response = await client.messages.create({
      model,
      max_tokens: req.maxTokens ?? 1200,
      system: req.systemPrompt,
      messages: req.messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const content = textBlock?.type === 'text' ? textBlock.text : '';

    return {
      content,
      provider: 'anthropic',
      model,
      latencyMs: Date.now() - start,
    };
  }
}

export const anthropicProvider = new AnthropicProvider();
