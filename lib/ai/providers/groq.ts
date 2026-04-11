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

  /** Parse a Groq error into a user-friendly message. */
  private parseError(status: number, _body: string): string {
    if (status === 429) {
      return 'Agent mind temporarily overloaded — too many signals received. Try again in a moment.';
    }
    if (status === 503 || status === 502) {
      return 'Agent neural pathway is being recalibrated. Please try again shortly.';
    }
    if (status === 401) {
      return 'Agent authentication link expired. Contact the Observer Council.';
    }
    return `Agent communication disrupted (code ${status}). Retry in a few seconds.`;
  }

  /** Full-response (non-streaming) mode with retry for rate limits. */
  async send(req: ProviderRequest): Promise<ProviderResponse> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY is not set');

    const model = process.env.GROQ_CHAT_MODEL ?? DEFAULT_MODEL;
    const start = Date.now();

    const messages = [
      { role: 'system', content: req.systemPrompt },
      ...req.messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await fetch(`${GROQ_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: req.maxTokens ?? 1200, temperature: 0.8 }),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content ?? '';
        return { content, provider: 'groq', model, latencyMs: Date.now() - start };
      }

      const err = await res.text();

      // Retry on rate limit (429) or server error (5xx)
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 1500));
        continue;
      }

      throw new Error(this.parseError(res.status, err));
    }

    throw new Error('Agent communication failed after retries. Please try again.');
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

    let res: Response | null = null;
    for (let attempt = 0; attempt <= 2; attempt++) {
      res = await fetch(`${GROQ_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: req.maxTokens ?? 1200, temperature: 0.8, stream: true }),
      });

      if (res.ok) break;

      const err = await res.text();
      if ((res.status === 429 || res.status >= 500) && attempt < 2) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 1500));
        continue;
      }
      throw new Error(this.parseError(res.status, err));
    }

    if (!res || !res.ok) {
      throw new Error('Agent communication failed after retries. Please try again.');
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
