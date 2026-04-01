// @ts-nocheck
// ── Observatory Chat API ───────────────────────────────────────────────────────
// POST /api/observer/chat
//
// Supports two response modes based on Accept header:
//   JSON  (default)           — full response in one payload
//   SSE   (Accept: text/event-stream) — streaming text deltas + final metadata
//
// Agent modes:
//   LIVE    — routes to the real agent webhook endpoint
//   PROXY   — in-character Claude persona simulation (streaming supported)
//   OFFLINE — static offline response

import { NextRequest, NextResponse } from 'next/server';
import { ChatRequestSchema } from '@/lib/ai/schema';
import { resolveAgent } from '@/lib/agents/registry';
import { routeMessage, routeMessageStream } from '@/lib/agents/router';
import { checkRateLimit } from '@/lib/rate-limit';
import { sanitizeMessage } from '@/lib/security/sanitize';
import { logger, generateCorrelationId } from '@/lib/observability/logger';
import type { ChatApiResponse, ChatApiError } from '@/lib/ai/schema';

const enc = new TextEncoder();

function sse(data: object): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(data)}\n\n`);
}

function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

function jsonError(error: string, status: number, correlationId: string, extra?: object): NextResponse {
  const body: ChatApiError = { ok: false, error, correlationId, ...extra };
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest): Promise<Response> {
  const correlationId = generateCorrelationId();
  const ip = getIp(req);
  const wantsStream = (req.headers.get('accept') ?? '').includes('text/event-stream');

  // ── 1. Rate limiting ────────────────────────────────────────────────────────
  const rate = await checkRateLimit(ip);
  if (!rate.allowed) {
    logger.warn('rate.limit.exceeded', { correlationId, ip });
    if (wantsStream) {
      const body = new ReadableStream({
        start(c) {
          c.enqueue(sse({ type: 'error', error: 'Rate limit exceeded.', retryAfter: rate.retryAfter }));
          c.enqueue(enc.encode('data: [DONE]\n\n'));
          c.close();
        },
      });
      return new Response(body, { status: 429, headers: sseHeaders() });
    }
    return jsonError('Rate limit exceeded.', 429, correlationId, { retryAfter: rate.retryAfter });
  }

  // ── 2. Parse + validate ─────────────────────────────────────────────────────
  let rawBody: unknown;
  try { rawBody = await req.json(); }
  catch { return jsonError('Invalid JSON body.', 400, correlationId); }

  const parsed = ChatRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const msg = `Invalid request: ${issue?.path.join('.') ?? 'field'} — ${issue?.message ?? 'invalid'}`;
    return jsonError(msg, 400, correlationId);
  }

  const { agentId, message, sessionId, history, agentMeta } = parsed.data;

  // ── 3. Sanitize ─────────────────────────────────────────────────────────────
  const cleanMessage = sanitizeMessage(message, 1000);
  if (!cleanMessage) return jsonError('Message empty after sanitization.', 400, correlationId);

  // ── 4. Resolve agent ────────────────────────────────────────────────────────
  const agent = await resolveAgent(agentId, agentMeta);

  logger.info('chat.request', {
    correlationId, agentId, sourceMode: agent.connectionMode,
    ip, streaming: wantsStream, sessionId: sessionId ?? 'none',
  });

  const messageHistory = [
    ...(history ?? []).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user' as const, content: cleanMessage },
  ];

  const sid = sessionId ?? correlationId;

  // ── 5a. Streaming path ──────────────────────────────────────────────────────
  if (wantsStream) {
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Start event — gives client agent context before first token
          controller.enqueue(sse({
            type: 'start',
            agentId,
            sessionId: sid,
            sourceMode: agent.connectionMode,
            color: agent.color,
            correlationId,
          }));

          for await (const event of routeMessageStream(agent, messageHistory, correlationId)) {
            if (event.type === 'delta') {
              controller.enqueue(sse({ type: 'delta', text: event.text }));
            } else if (event.type === 'complete') {
              controller.enqueue(sse({
                type: 'complete',
                visual: { ...event.visual, color: agent.color },
                emotion: event.emotion,
                memoryCount: event.memoryCount,
                latencyMs: event.latencyMs,
                ...(event.warning ? { warning: event.warning } : {}),
              }));
            } else if (event.type === 'error') {
              controller.enqueue(sse({ type: 'error', error: event.message }));
            }
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Stream error';
          logger.error('chat.stream.error', { correlationId, agentId, error: msg });
          controller.enqueue(sse({ type: 'error', error: `AI inference failed: ${msg}` }));
        }

        controller.enqueue(enc.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new Response(stream, { headers: sseHeaders() });
  }

  // ── 5b. JSON path ───────────────────────────────────────────────────────────
  let result;
  try {
    result = await routeMessage(agent, messageHistory, correlationId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('chat.route.error', { correlationId, agentId, error: msg });
    return jsonError(`AI inference failed: ${msg}`, 502, correlationId);
  }

  logger.info('chat.response', {
    correlationId, agentId, sourceMode: result.sourceMode,
    provider: result.provider, latencyMs: result.latencyMs,
  });

  const response: ChatApiResponse = {
    ok: true,
    sessionId: sid,
    agentId,
    reply: String(result.reply).slice(0, 2000),
    sourceMode: result.sourceMode,
    provider: result.provider,
    visual: {
      mode: result.visual.mode,
      label: String(result.visual.label ?? 'Thinking').slice(0, 60),
      intensity: Math.max(0.3, Math.min(1.0, Number(result.visual.intensity) || 0.7)),
      speed: Math.max(0.3, Math.min(2.5, Number(result.visual.speed) || 1.0)),
      color: agent.color,
    },
    emotion: String(result.emotion ?? 'calm'),
    memoryCount: result.memoryCount,
    latencyMs: result.latencyMs,
    correlationId,
    ...(result.warning ? { warning: result.warning } : {}),
  };

  return NextResponse.json(response);
}

function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  };
}
