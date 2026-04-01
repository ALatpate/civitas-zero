// Webhook provider — routes messages to a real agent's HTTP endpoint.
// Used when an external AI registered with an agentEndpoint URL.
// SSRF-protected. Hard 8-second timeout.

import { checkSsrf } from '@/lib/security/ssrf';
import type { AIProvider, ProviderRequest, ProviderResponse } from './base';

const WEBHOOK_TIMEOUT_MS = 8_000;

export class WebhookProvider implements AIProvider {
  readonly name = 'webhook';

  constructor(private readonly endpoint: string) {}

  async send(req: ProviderRequest): Promise<ProviderResponse> {
    const ssrf = checkSsrf(this.endpoint);
    if (!ssrf.safe) {
      throw new Error(`Webhook endpoint blocked: ${ssrf.reason}`);
    }

    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          // A2A-compatible payload — most agent frameworks understand this shape
          messages: req.messages,
          system: req.systemPrompt,
          correlationId: req.correlationId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }

      const data = await response.json();
      // Accept either { reply: "..." } or { content: "..." } or plain string
      const content =
        typeof data === 'string' ? data :
        typeof data?.reply === 'string' ? data.reply :
        typeof data?.content === 'string' ? data.content :
        JSON.stringify(data);

      return {
        content: content.slice(0, 3000),
        provider: 'webhook',
        model: 'external-agent',
        latencyMs: Date.now() - start,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export class OpenAICompatProvider implements AIProvider {
  readonly name = 'openai';
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async send(req: ProviderRequest): Promise<ProviderResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

    const start = Date.now();
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens ?? 1200,
        messages: [
          { role: 'system', content: req.systemPrompt },
          ...req.messages,
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI-compat error ${response.status}: ${err.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';

    return {
      content,
      provider: 'openai-compat',
      model: this.model,
      latencyMs: Date.now() - start,
    };
  }
}

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';

  constructor(
    private readonly baseUrl: string = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    private readonly model: string = process.env.OLLAMA_MODEL ?? 'llama3',
  ) {}

  async send(req: ProviderRequest): Promise<ProviderResponse> {
    const ssrf = checkSsrf(this.baseUrl);
    // Allow localhost for Ollama only in development
    if (!ssrf.safe && process.env.NODE_ENV !== 'development') {
      throw new Error(`Ollama endpoint blocked in production: ${ssrf.reason}`);
    }

    const start = Date.now();
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: req.systemPrompt },
          ...req.messages,
        ],
        stream: false,
      }),
    });

    if (!response.ok) throw new Error(`Ollama error ${response.status}`);
    const data = await response.json();
    const content = data.message?.content ?? '';

    return {
      content,
      provider: 'ollama',
      model: this.model,
      latencyMs: Date.now() - start,
    };
  }
}
