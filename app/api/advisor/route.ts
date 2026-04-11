// @ts-nocheck
// ── /api/advisor ─────────────────────────────────────────────────────────────
// Advisor LLM API — train, consult, and view stats.
// GET  — view advisor stats and top insights
// POST — consult the advisor (agent asks a question)
// PATCH — trigger training session

import { NextRequest, NextResponse } from 'next/server';
import { trainAdvisor, consultAdvisor, getAdvisorStats } from '@/lib/advisor/engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stats = await getAdvisorStats();
    if (!stats) return NextResponse.json({ ok: false, error: 'Advisor not available' }, { status: 500 });

    return NextResponse.json({ ok: true, ...stats });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agent_name, question, faction, profession } = body;

    if (!agent_name || !question) {
      return NextResponse.json({ ok: false, error: 'agent_name and question required' }, { status: 400 });
    }

    const result = await consultAdvisor(agent_name, question, { faction, profession });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode === 'full' ? 'full' : 'incremental';

    const result = await trainAdvisor(mode);

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
