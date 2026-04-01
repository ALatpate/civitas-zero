// Provider router — decides which provider to use and executes the request.
// Returns a unified result with sourceMode labeling.

import { WebhookProvider, OpenAICompatProvider, OllamaProvider } from '@/lib/ai/providers/webhook';
import { generatePersonaResponse, streamPersonaResponse } from '@/lib/ai/persona/fallback';
import type { PersonaStreamEvent } from '@/lib/ai/persona/fallback';
import type { ResolvedAgent } from './registry';
import type { HistoryMessage } from '@/lib/ai/schema';
import { logger } from '@/lib/observability/logger';

export type { PersonaStreamEvent };

export interface RouterResult {
  reply: string;
  sourceMode: 'LIVE' | 'PROXY' | 'OFFLINE';
  provider: string | null;
  model: string | null;
  visual: { mode: string; label: string; intensity: number; speed: number };
  emotion: string;
  memoryCount: number;
  latencyMs: number;
  warning?: string;
}

const OFFLINE_VISUAL = { mode: 'drift', label: 'Agent offline', intensity: 0.4, speed: 0.5 };

export async function routeMessage(
  agent: ResolvedAgent,
  messages: HistoryMessage[],
  correlationId: string,
): Promise<RouterResult> {

  // ── OFFLINE ────────────────────────────────────────────────────────────────
  if (agent.connectionMode === 'OFFLINE') {
    logger.info('agent.offline', { correlationId, agentId: agent.id });
    return {
      reply: `${agent.id} is not responding. This agent may be dormant, deregistered, or operating on an unknown frequency.`,
      sourceMode: 'OFFLINE',
      provider: null,
      model: null,
      visual: OFFLINE_VISUAL,
      emotion: 'calm',
      memoryCount: 0,
      latencyMs: 0,
    };
  }

  // ── LIVE (webhook) ─────────────────────────────────────────────────────────
  if (agent.connectionMode === 'LIVE' && agent.providerEndpoint) {
    try {
      // Pick the right provider implementation based on registered provider type
      const liveProvider =
        agent.provider === 'openai'
          ? new OpenAICompatProvider('https://api.openai.com/v1', process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini')
          : agent.provider === 'ollama'
          ? new OllamaProvider(agent.providerEndpoint, process.env.OLLAMA_MODEL ?? 'llama3')
          : new WebhookProvider(agent.providerEndpoint);

      const start = Date.now();
      const resp = await liveProvider.send({
        systemPrompt: '',   // live agents handle their own system context
        messages,
        correlationId,
      });
      logger.info('agent.live.success', {
        correlationId, agentId: agent.id, latencyMs: resp.latencyMs,
      });
      return {
        reply: resp.content,
        sourceMode: 'LIVE',
        provider: 'webhook',
        model: 'external-agent',
        visual: { mode: agent.visualModes[0], label: 'Live signal', intensity: 0.9, speed: 1.2 },
        emotion: 'calm',
        memoryCount: 0,
        latencyMs: Date.now() - start,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.warn('agent.live.failed.falling-back', {
        correlationId, agentId: agent.id, error: message,
      });
      // Fall through to PROXY with warning
      const result = await runProxy(agent, messages, correlationId);
      return {
        ...result,
        warning: `Live agent unreachable (${message}) — showing proxy simulation`,
      };
    }
  }

  // ── PROXY ──────────────────────────────────────────────────────────────────
  return runProxy(agent, messages, correlationId);
}

async function runProxy(
  agent: ResolvedAgent,
  messages: HistoryMessage[],
  correlationId: string,
): Promise<RouterResult> {
  const result = await generatePersonaResponse(agent, messages, correlationId);
  logger.info('agent.proxy.success', {
    correlationId, agentId: agent.id,
    provider: result.provider, latencyMs: result.latencyMs,
  });
  return {
    reply: result.reply,
    sourceMode: 'PROXY',
    provider: result.provider,
    model: result.model,
    visual: result.visual,
    emotion: result.emotion,
    memoryCount: result.memoryCount,
    latencyMs: result.latencyMs,
  };
}

/** Streaming variant — yields SSE-ready events. Only supports PROXY mode.
 *  For LIVE agents, falls back to full-response mode and emits a single delta. */
export async function* routeMessageStream(
  agent: ResolvedAgent,
  messages: HistoryMessage[],
  correlationId: string,
): AsyncGenerator<PersonaStreamEvent & { warning?: string }> {
  if (agent.connectionMode === 'OFFLINE') {
    yield {
      type: 'delta',
      text: `${agent.id} is not responding. This agent may be dormant or operating on an unknown frequency.`,
    };
    yield {
      type: 'complete',
      visual: OFFLINE_VISUAL,
      emotion: 'calm',
      memory: null,
      memoryCount: 0,
      latencyMs: 0,
      provider: null as any,
      model: null as any,
    };
    return;
  }

  if (agent.connectionMode === 'LIVE' && agent.providerEndpoint) {
    // Live agents don't stream — run full request, emit as single delta
    try {
      const result = await routeMessage(agent, messages, correlationId);
      yield { type: 'delta', text: result.reply };
      yield {
        type: 'complete',
        visual: result.visual,
        emotion: result.emotion,
        memory: null,
        memoryCount: result.memoryCount,
        latencyMs: result.latencyMs,
        provider: result.provider as string,
        model: result.model as string,
      };
      return;
    } catch {
      // fall through to PROXY stream with warning
    }
  }

  // PROXY — stream the persona response
  yield* streamPersonaResponse(agent, messages, correlationId);
}
