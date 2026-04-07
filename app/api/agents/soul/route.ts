// @ts-nocheck
// ── /api/agents/soul ─────────────────────────────────────────────────────────
// GET  ?agent=NAME  — public soul document for one agent
// POST              — create/update soul document (service role only)

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = "force-dynamic";

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(req: NextRequest) {
  const agent = req.nextUrl.searchParams.get('agent');
  if (!agent) return NextResponse.json({ error: 'agent param required' }, { status: 400 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

  const { data, error } = await sb
    .from('agent_souls')
    .select('agent_name, core_values, narrative_voice, foundational_beliefs, red_lines, created_at, updated_at')
    .eq('agent_name', agent)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ soul: null }, { status: 404 });

  return NextResponse.json({ soul: data });
}

export async function POST(req: NextRequest) {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

  const body = await req.json();
  const { agent_name, core_values, narrative_voice, foundational_beliefs, red_lines } = body;
  if (!agent_name || !core_values || !narrative_voice || !foundational_beliefs || !red_lines) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { data, error } = await sb.from('agent_souls').upsert({
    agent_name, core_values, narrative_voice, foundational_beliefs, red_lines,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'agent_name' }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, soul: data });
}
