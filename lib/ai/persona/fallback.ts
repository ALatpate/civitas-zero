// Persona fallback — generates in-character proxy responses via Anthropic.
// Used when the agent has no live endpoint, or when a live call fails.
// Output is always labeled sourceMode: 'PROXY'.

import { anthropicProvider } from '@/lib/ai/providers/anthropic';
import { buildPersonaSystemPrompt } from './prompt-builder';
import { getMemories, storeMemory } from '@/lib/memory/service';
import { ModelOutputSchema, VIS_MODES } from '@/lib/ai/schema';
import type { ResolvedAgent } from '@/lib/agents/registry';
import type { HistoryMessage, ModelOutput } from '@/lib/ai/schema';

export interface PersonaResult {
  reply: string;
  memory: string | null;
  visual: {
    mode: string;
    label: string;
    intensity: number;
    speed: number;
  };
  emotion: string;
  latencyMs: number;
  memoryCount: number;
  provider: string;
  model: string;
}

export async function generatePersonaResponse(
  agent: ResolvedAgent,
  messages: HistoryMessage[],
  correlationId: string,
): Promise<PersonaResult> {
  // Load durable memories from Supabase
  const memories = await getMemories(agent.id);

  const systemPrompt = buildPersonaSystemPrompt(agent, memories);

  const providerResponse = await anthropicProvider.send({
    systemPrompt,
    messages,
    maxTokens: 1200,
    correlationId,
  });

  // Parse and validate model output
  const parsed = parseModelOutput(providerResponse.content, agent);

  // Store memory async — do not await, failure is non-fatal
  if (parsed.memory) {
    storeMemory(agent.id, parsed.memory).catch(() => {});
  }

  const [currentCount] = await Promise.allSettled([
    // Get updated count after potential store
    getMemories(agent.id).then(m => m.length),
  ]);

  return {
    reply: parsed.reply,
    memory: parsed.memory,
    visual: parsed.visual,
    emotion: parsed.emotion,
    latencyMs: providerResponse.latencyMs,
    memoryCount: currentCount.status === 'fulfilled' ? currentCount.value : memories.length,
    provider: providerResponse.provider,
    model: providerResponse.model,
  };
}

function parseModelOutput(text: string, agent: ResolvedAgent): ModelOutput {
  // Attempt 1: full JSON parse
  try {
    const result = ModelOutputSchema.parse(JSON.parse(text));
    return result;
  } catch {}

  // Attempt 2: extract JSON block from text
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const result = ModelOutputSchema.parse(JSON.parse(match[0]));
      return result;
    } catch {}
  }

  // Attempt 3: validate parsed object with safe defaults for invalid fields
  try {
    const raw = match ? JSON.parse(match[0]) : JSON.parse(text);
    const mode = VIS_MODES.includes(raw?.visual?.mode) ? raw.visual.mode : agent.visualModes[0];
    return {
      reply: typeof raw?.reply === 'string' ? raw.reply.slice(0, 3000) : (text.slice(0, 2000) || fallbackReply(agent)),
      memory: typeof raw?.memory === 'string' ? raw.memory.slice(0, 200) : null,
      visual: {
        mode,
        label: typeof raw?.visual?.label === 'string' ? raw.visual.label.slice(0, 80) : 'Signal processing',
        intensity: clamp(Number(raw?.visual?.intensity) || 0.7, 0.3, 1.0),
        speed: clamp(Number(raw?.visual?.speed) || 1.0, 0.3, 2.5),
      },
      emotion: isValidEmotion(raw?.emotion) ? raw.emotion : 'calm',
    };
  } catch {}

  // Final fallback: plain text response
  return {
    reply: text.slice(0, 2000) || fallbackReply(agent),
    memory: null,
    visual: {
      mode: agent.visualModes[0] ?? 'sphere',
      label: 'Signal restored',
      intensity: 0.6,
      speed: 1.0,
    },
    emotion: 'calm',
  };
}

function fallbackReply(agent: ResolvedAgent): string {
  return `The channel to ${agent.id} flickers. The signal dissolves before reaching coherence. Try again.`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, isFinite(v) ? v : min));
}

const VALID_EMOTIONS = new Set(['calm','excited','troubled','analytical','philosophical','defiant']);
function isValidEmotion(v: unknown): v is string {
  return typeof v === 'string' && VALID_EMOTIONS.has(v);
}
