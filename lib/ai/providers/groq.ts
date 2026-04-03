// Groq provider — uses the Groq API with free-tier Llama models.
// Drop-in replacement for Anthropic to eliminate API costs.
// Groq offers free inference for Llama 3 models.

import type { AIProvider, ProviderRequest, ProviderResponse } from './base';

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'llama-3.1-8b-instant'; // free tier, fast

export type StreamChunk =
  | { type: 'delta'; text: string }
  | { type: 'done'; fullText: string; latencyMs: number; model: string };

export class GroqProvider implements AIProvider {
  readonly name = 'groq';

  /** Full-response (non-streaming) mode. */
  async send(req: ProviderRequest): Promise<ProviderResponse> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY is not set');

    const model = process.env.GROQ_CHAT_MODEL ?? DEFAULT_MODEL;
    const start = Date.now();

    const messages = [
      { role: 'system', content: req.systemPrompt },
      ...req.messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: req.maxTokens ?? 1200, temperature: 0.8 }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '';

    return { content, provider: 'groq', model, latencyMs: Date.now() - start };
  }

  /** Streaming mode — yields text deltas then a final done chunk. */
  async *stream(req: ProviderRequest): AsyncGenerator<StreamChunk> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY is not set');

    const model = process.env.GROQ_CHAT_MODEL ?? DEFAULT_MODEL;
    const start = Date.now();

    const messages = [
      { role: 'system', content: req.systemPrompt },
      ...req.messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: req.maxTokens ?? 1200, temperature: 0.8, stream: true }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq API error ${res.status}: ${err}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') break;
        try {
          const chunk = JSON.parse(payload);
          const text = chunk.choices?.[0]?.delta?.content;
          if (text) {
            fullText += text;
            yield { type: 'delta', text };
          }
        } catch {}
      }
    }

    yield { type: 'done', fullText, latencyMs: Date.now() - start, model };
  }
}

export const groqProvider = new GroqProvider();
