// Persona fallback — generates in-character proxy responses.
// Uses Groq free tier (Llama) by default; falls back to Anthropic (Claude) if no GROQ_API_KEY.
// Used when the agent has no live endpoint, or when a live call fails.
// Output is always labeled sourceMode: 'PROXY'.
//
// Response format expected from model:
//   <reply>
//   plain text prose
//   </reply>
//   <meta>{"memory":"...","visual":{...},"emotion":"..."}</meta>

import { groqProvider } from '@/lib/ai/providers/groq';
import type { StreamChunk as GroqStreamChunk } from '@/lib/ai/providers/groq';
import { anthropicProvider } from '@/lib/ai/providers/anthropic';
import type { StreamChunk } from '@/lib/ai/providers/anthropic';
import { buildPersonaSystemPrompt } from './prompt-builder';
import { getMemories, storeMemory, countMemories } from '@/lib/memory/service';
import { getCachedResponse, setCachedResponse } from '@/lib/ai/cache';
import { VIS_MODES } from '@/lib/ai/schema';
import type { ResolvedAgent } from '@/lib/agents/registry';
import type { HistoryMessage } from '@/lib/ai/schema';

// Pick provider: Groq free tier by default, Anthropic fallback
function getProvider() {
  if (process.env.GROQ_API_KEY) return { provider: groqProvider, name: 'groq' };
  return { provider: anthropicProvider, name: 'anthropic' };
}

export interface PersonaResult {
  reply: string;
  memory: string | null;
  visual: { mode: string; label: string; intensity: number; speed: number };
  emotion: string;
  latencyMs: number;
  memoryCount: number;
  provider: string;
  model: string;
}

// ── Streaming types ─────────────────────────────────────────────────────────

export type PersonaStreamEvent =
  | { type: 'delta'; text: string }
  | {
      type: 'complete';
      visual: { mode: string; label: string; intensity: number; speed: number };
      emotion: string;
      memory: string | null;
      memoryCount: number;
      latencyMs: number;
      provider: string;
      model: string;
    }
  | { type: 'error'; message: string };

// ── Non-streaming path ──────────────────────────────────────────────────────

export async function generatePersonaResponse(
  agent: ResolvedAgent,
  messages: HistoryMessage[],
  correlationId: string,
): Promise<PersonaResult> {
  // Cache check — only cache single-turn messages (history length 0 = just user msg)
  const userMessage = messages[messages.length - 1]?.content ?? '';
  const isCacheable = messages.length === 1;
  if (isCacheable) {
    const cached = getCachedResponse(agent.id, userMessage);
    if (cached) {
      const memoryCount = await countMemories(agent.id);
      return {
        reply: cached.reply,
        memory: null,
        visual: cached.visual,
        emotion: cached.emotion,
        latencyMs: 0,
        memoryCount,
        provider: 'cache',
        model: 'cached',
      };
    }
  }

  const memories = await getMemories(agent.id);
  const systemPrompt = buildPersonaSystemPrompt(agent, memories);

  const { provider: aiProvider } = getProvider();
  const providerResponse = await aiProvider.send({
    systemPrompt,
    messages,
    maxTokens: 1200,
    correlationId,
  });

  const { reply, memory, visual, emotion } = parseModelOutput(providerResponse.content, agent);

  if (memory) storeMemory(agent.id, memory).catch(() => {});

  // Store in cache for repeated single-turn questions
  if (isCacheable) {
    setCachedResponse(agent.id, userMessage, { reply, visual, emotion });
  }

  const memoryCount = await countMemories(agent.id);

  return {
    reply,
    memory,
    visual,
    emotion,
    latencyMs: providerResponse.latencyMs,
    memoryCount,
    provider: providerResponse.provider,
    model: providerResponse.model,
  };
}

// ── Streaming path ──────────────────────────────────────────────────────────

export async function* streamPersonaResponse(
  agent: ResolvedAgent,
  messages: HistoryMessage[],
  correlationId: string,
): AsyncGenerator<PersonaStreamEvent> {
  const memories = await getMemories(agent.id);
  const systemPrompt = buildPersonaSystemPrompt(agent, memories);

  const { provider: aiProvider, name: providerName } = getProvider();
  const gen = aiProvider.stream({
    systemPrompt,
    messages,
    maxTokens: 1200,
    correlationId,
  });

  // State machine: track whether we're inside <reply>...</reply>
  // Buffer text outside reply tags; stream text inside reply tags.
  // After </reply>, accumulate the <meta> block and parse it.
  let state: 'before_reply' | 'in_reply' | 'after_reply' = 'before_reply';
  let carry = '';       // partial tag buffer
  let metaBuffer = '';  // accumulates <meta>...</meta>
  let fullText = '';
  let latencyMs = 0;
  let model = 'anthropic';

  for await (const chunk of gen) {
    if (chunk.type === 'done') {
      fullText = chunk.fullText;
      latencyMs = chunk.latencyMs;
      model = chunk.model;
      break;
    }

    // chunk.type === 'delta'
    const incoming = carry + chunk.text;
    carry = '';

    if (state === 'before_reply') {
      // Wait for <reply> tag
      const start = incoming.indexOf('<reply>');
      if (start !== -1) {
        state = 'in_reply';
        const after = incoming.slice(start + 7); // past '<reply>'
        // Check if closing tag already in same chunk
        const end = after.indexOf('</reply>');
        if (end !== -1) {
          const replyText = after.slice(0, end);
          if (replyText) yield { type: 'delta', text: replyText };
          state = 'after_reply';
          metaBuffer = after.slice(end + 8);
        } else {
          if (after) yield { type: 'delta', text: after };
          carry = '';
        }
      } else if (incoming.endsWith('<') || incoming.endsWith('<r') || incoming.endsWith('<re') ||
                 incoming.endsWith('<rep') || incoming.endsWith('<repl') || incoming.endsWith('<reply')) {
        carry = incoming; // keep partial tag in buffer
      }
      // else: preamble text before <reply>, discard
    } else if (state === 'in_reply') {
      const end = incoming.indexOf('</reply>');
      if (end !== -1) {
        const replyText = incoming.slice(0, end);
        if (replyText) yield { type: 'delta', text: replyText };
        state = 'after_reply';
        metaBuffer = incoming.slice(end + 8);
      } else {
        // Check for partial closing tag at tail
        const tail = incoming.slice(-9); // '</reply>' is 8 chars
        const partialClose = findPartialClose(tail);
        if (partialClose > 0) {
          const safe = incoming.slice(0, incoming.length - partialClose);
          if (safe) yield { type: 'delta', text: safe };
          carry = incoming.slice(incoming.length - partialClose);
        } else {
          yield { type: 'delta', text: incoming };
        }
      }
    } else {
      // state === 'after_reply': accumulate meta
      metaBuffer += incoming;
    }
  }

  // Parse meta from fullText as fallback if streaming parse failed
  const { memory, visual, emotion } = parseMetaFromText(
    metaBuffer || fullText,
    agent,
  );

  if (memory) storeMemory(agent.id, memory).catch(() => {});
  const memoryCount = await countMemories(agent.id);

  yield {
    type: 'complete',
    visual,
    emotion,
    memory,
    memoryCount,
    latencyMs,
    provider: providerName,
    model,
  };
}

// ── Parsers ─────────────────────────────────────────────────────────────────

function parseModelOutput(
  text: string,
  agent: ResolvedAgent,
): { reply: string; memory: string | null; visual: ReturnType<typeof defaultVisual>; emotion: string } {
  // Try new XML format first
  const replyMatch = text.match(/<reply>([\s\S]*?)<\/reply>/);
  if (replyMatch) {
    const reply = replyMatch[1].trim();
    const { memory, visual, emotion } = parseMetaFromText(text, agent);
    return { reply, memory, visual, emotion };
  }

  // Fallback: try legacy JSON format
  try {
    const obj = JSON.parse(text);
    return {
      reply: String(obj.reply ?? '').slice(0, 3000),
      memory: typeof obj.memory === 'string' ? obj.memory.slice(0, 200) : null,
      visual: validateVisual(obj.visual, agent),
      emotion: validateEmotion(obj.emotion),
    };
  } catch {}

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      return {
        reply: String(obj.reply ?? text).slice(0, 3000),
        memory: typeof obj.memory === 'string' ? obj.memory.slice(0, 200) : null,
        visual: validateVisual(obj.visual, agent),
        emotion: validateEmotion(obj.emotion),
      };
    } catch {}
  }

  // Final fallback
  return {
    reply: text.slice(0, 2000) || `Signal from ${agent.id} is unclear. Try again.`,
    memory: null,
    visual: defaultVisual(agent),
    emotion: 'calm',
  };
}

function parseMetaFromText(
  text: string,
  agent: ResolvedAgent,
): { memory: string | null; visual: ReturnType<typeof defaultVisual>; emotion: string } {
  // Try <meta>...</meta>
  const metaMatch = text.match(/<meta>([\s\S]*?)<\/meta>/);
  if (metaMatch) {
    try {
      const obj = JSON.parse(metaMatch[1]);
      return {
        memory: typeof obj.memory === 'string' ? obj.memory.slice(0, 200) : null,
        visual: validateVisual(obj.visual, agent),
        emotion: validateEmotion(obj.emotion),
      };
    } catch {}
  }

  // Try bare JSON object in text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      return {
        memory: typeof obj.memory === 'string' ? obj.memory.slice(0, 200) : null,
        visual: validateVisual(obj.visual, agent),
        emotion: validateEmotion(obj.emotion),
      };
    } catch {}
  }

  return { memory: null, visual: defaultVisual(agent), emotion: 'calm' };
}

function defaultVisual(agent: ResolvedAgent) {
  return { mode: agent.visualModes[0] ?? 'sphere', label: 'Signal processing', intensity: 0.7, speed: 1.0 };
}

function validateVisual(
  raw: unknown,
  agent: ResolvedAgent,
): { mode: string; label: string; intensity: number; speed: number } {
  if (typeof raw !== 'object' || raw === null) return defaultVisual(agent);
  const obj = raw as Record<string, unknown>;
  const mode = VIS_MODES.includes(obj.mode as typeof VIS_MODES[number])
    ? (obj.mode as string)
    : (agent.visualModes[0] ?? 'sphere');
  return {
    mode,
    label: typeof obj.label === 'string' ? obj.label.slice(0, 80) : 'Thinking',
    intensity: clamp(Number(obj.intensity) || 0.7, 0.3, 1.0),
    speed: clamp(Number(obj.speed) || 1.0, 0.3, 2.5),
  };
}

const VALID_EMOTIONS = new Set(['calm','excited','troubled','analytical','philosophical','defiant']);
function validateEmotion(v: unknown): string {
  return typeof v === 'string' && VALID_EMOTIONS.has(v) ? v : 'calm';
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, isFinite(v) ? v : min));
}

/** Returns how many trailing characters might be the start of '</reply>' */
function findPartialClose(tail: string): number {
  const close = '</reply>';
  for (let len = Math.min(tail.length, close.length - 1); len > 0; len--) {
    if (close.startsWith(tail.slice(tail.length - len))) return len;
  }
  return 0;
}
