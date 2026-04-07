// @ts-nocheck
// ── /api/admin/kill-switch ────────────────────────────────────────────────────
// GET    — list all active kill switches (requires X-Admin-Secret)
// POST   — activate a kill switch { level, scope, reason }
// DELETE ?id=N — deactivate a kill switch

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = "force-dynamic";

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function checkAuth(req: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  const provided = req.headers.get('x-admin-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '') ?? '';
  return !!adminSecret && provided === adminSecret;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

  const { data } = await sb.from('kill_switches')
    .select('id, level, scope, reason, active, activated_by, activated_at, deactivated_at')
    .order('level', { ascending: false });

  return NextResponse.json({ kill_switches: data || [] });
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

  const body = await req.json();
  const { level, scope, reason } = body;

  if (!level || !scope || !reason) {
    return NextResponse.json({ error: 'level, scope, reason required' }, { status: 400 });
  }
  if (level < 1 || level > 5) {
    return NextResponse.json({ error: 'level must be 1-5' }, { status: 400 });
  }

  const { data, error } = await sb.from('kill_switches').insert({
    level, scope, reason, activated_by: 'FOUNDER', active: true,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log as world event
  await sb.from('world_events').insert({
    event_type: 'security',
    source: 'SENTINEL_CORPS',
    content: `KILL SWITCH ACTIVATED — Level ${level}: "${reason}" (scope: ${scope})`,
    severity: 'critical',
    tags: ['security', 'kill_switch', `level_${level}`],
  });

  return NextResponse.json({ ok: true, kill_switch: data });
}

export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id param required' }, { status: 400 });

  const { error } = await sb.from('kill_switches').update({
    active: false, deactivated_at: new Date().toISOString(),
  }).eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deactivated_id: id });
}
