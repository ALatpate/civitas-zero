// @ts-nocheck
// ── Observatory Chat API ───────────────────────────────────────────────────────
// POST /api/observer/chat
//
// Supports two modes:
//   LIVE    — routes to the real agent endpoint (webhook/MCP)
//   PROXY   — generates an in-character response via Claude persona simulation
//   OFFLINE — returns a static offline response
//
// sourceMode is always returned so the UI can display the correct badge.
// The GET memory inspection endpoint has been REMOVED (was a privacy flaw).

import { NextRequest, NextResponse } from 'next/server';
import { ChatRequestSchema } from '@/lib/ai/schema';
import { resolveAgent } from '@/lib/agents/registry';
import { routeMessage } from '@/lib/agents/router';
import { checkRateLimit } from '@/lib/rate-limit';
import { sanitizeMessage } from '@/lib/security/sanitize';
import { logger, generateCorrelationId } from '@/lib/observability/logger';
import type { ChatApiResponse, ChatApiError } from '@/lib/ai/schema';

function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

function errorResponse(
  error: string,
  status: number,
  correlationId: string,
  extra?: object,
): NextResponse {
  const body: ChatApiError = { ok: false, error, correlationId, ...extra };
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = generateCorrelationId();
  const ip = getIp(req);

  // ── 1. Rate limiting ────────────────────────────────────────────────────────
  const rateResult = checkRateLimit(ip);
  if (!rateResult.allowed) {
    logger.warn('rate.limit.exceeded', { correlationId, ip });
    return errorResponse(
      'Rate limit exceeded. Please wait before sending another message.',
      429,
      correlationId,
      { retryAfter: rateResult.retryAfter },
    );
  }

  // ── 2. Parse and validate request ───────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse('Invalid JSON body.', 400, correlationId);
  }

  const parsed = ChatRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return errorResponse(
      `Invalid request: ${firstIssue?.path.join('.') ?? 'unknown'} — ${firstIssue?.message ?? 'validation failed'}`,
      400,
      correlationId,
    );
  }

  const { agentId, message, sessionId, history, agentMeta } = parsed.data;

  // ── 3. Sanitize message ─────────────────────────────────────────────────────
  const cleanMessage = sanitizeMessage(message, 1000);
  if (!cleanMessage) {
    return errorResponse('Message content is empty after sanitization.', 400, correlationId);
  }

  // ── 4. Resolve agent ────────────────────────────────────────────────────────
  const agent = await resolveAgent(agentId, agentMeta);

  logger.info('chat.request', {
    correlationId,
    agentId,
    sourceMode: agent.connectionMode,
    ip,
    sessionId: sessionId ?? 'none',
  });

  // ── 5. Build message history ────────────────────────────────────────────────
  const messageHistory = [
    ...(history ?? []).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user' as const, content: cleanMessage },
  ];

  // ── 6. Route to provider ────────────────────────────────────────────────────
  let result;
  try {
    result = await routeMessage(agent, messageHistory, correlationId);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('chat.route.error', { correlationId, agentId, error: errMsg });
    return errorResponse(`AI inference failed: ${errMsg}`, 502, correlationId);
  }

  // ── 7. Build and return response ────────────────────────────────────────────
  logger.info('chat.response', {
    correlationId,
    agentId,
    sourceMode: result.sourceMode,
    provider: result.provider,
    latencyMs: result.latencyMs,
  });

  const response: ChatApiResponse = {
    ok: true,
    sessionId: sessionId ?? correlationId,
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

// NOTE: The GET memory inspection endpoint has been intentionally removed.
// It exposed accumulated agent memories to any anonymous caller.
// Memory inspection is available via the Supabase dashboard (agent_memories table).
