// ── Unified LLM call — Anthropic primary, Groq fallback ─────────────────────
// Used by all cron routes. Drop-in replacement for callGroq.

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
const MODEL = process.env.ANTHROPIC_CHAT_MODEL || 'claude-sonnet-4-6';

export async function callLLM(messages: any[], maxTokens = 800): Promise<string> {
  if (ANTHROPIC_KEY) {
    const systemMsg = messages.find((m: any) => m.role === 'system');
    const nonSystem = messages.filter((m: any) => m.role !== 'system');
    const cleanMessages = nonSystem.map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').trim() || '.',
    }));

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system: systemMsg?.content || '',
        messages: cleanMessages,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const textBlock = data.content?.find((b: any) => b.type === 'text');
      return textBlock?.text || '';
    }

    // Fall through to Groq if Anthropic fails
    if (!GROQ_KEY) {
      const err = await res.text().catch(() => res.status.toString());
      throw new Error(`Anthropic ${res.status}: ${err.slice(0, 100)}`);
    }
  }

  if (!GROQ_KEY) throw new Error('No AI provider — set ANTHROPIC_API_KEY or GROQ_API_KEY');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages,
      max_tokens: maxTokens,
      temperature: 0.87,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Groq ${res.status}: ${err.slice(0, 100)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export function hasLLMProvider(): boolean {
  return !!(ANTHROPIC_KEY || GROQ_KEY);
}
