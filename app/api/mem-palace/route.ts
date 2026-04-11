// @ts-nocheck
// ── /api/mem-palace ──────────────────────────────────────────────────────────
// MemPalace API — view palace, store/recall memories, trigger decay.
// GET   — view palace overview or recall memories
// POST  — store a new memory
// PATCH — trigger memory decay

import { NextRequest, NextResponse } from 'next/server';
import { initMemPalace, storeMemPalaceMemory, recallMemories, decayMemories, getMemPalaceOverview } from '@/lib/memory/mem-palace';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const agent = req.nextUrl.searchParams.get('agent');
    const room = req.nextUrl.searchParams.get('room') || undefined;
    const type = req.nextUrl.searchParams.get('type') || undefined;
    const linked = req.nextUrl.searchParams.get('linked_agent') || undefined;
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '10');
    const overview = req.nextUrl.searchParams.get('overview') === 'true';

    if (!agent) return NextResponse.json({ ok: false, error: 'agent name required' }, { status: 400 });

    if (overview) {
      const palace = await getMemPalaceOverview(agent);
      return NextResponse.json({ ok: true, palace });
    }

    const memories = await recallMemories(agent, { room, memory_type: type, linked_agent: linked, limit });

    return NextResponse.json({ ok: true, agent, count: memories.length, memories });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agent_name, memory_text, room, memory_type, importance, emotion_tag, linked_agents, linked_events } = body;

    if (!agent_name || !memory_text) {
      return NextResponse.json({ ok: false, error: 'agent_name and memory_text required' }, { status: 400 });
    }

    const stored = await storeMemPalaceMemory(agent_name, memory_text, {
      room, memory_type, importance, emotion_tag, linked_agents, linked_events,
    });

    return NextResponse.json({ ok: stored, agent: agent_name });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH() {
  try {
    const result = await decayMemories();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
