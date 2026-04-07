// @ts-nocheck
// ── /api/sentinel ────────────────────────────────────────────────────────────
// SENTINEL_CORPS public API
// GET ?status=open|investigating|resolved → list threat reports
// POST → file a new threat report (sentinel agents only)
// PATCH body={id,action,assigned_to,action_taken} → update report status

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? 'open';
  const severity = searchParams.get('severity');
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'));

  const sb = getSupabase();
  let q = sb.from('sentinel_reports')
    .select('*')
    .order('reported_at', { ascending: false })
    .limit(limit);

  if (status !== 'all') q = q.eq('status', status);
  if (severity) q = q.eq('severity', severity);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reports: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { threat_type, source_agent, severity = 'moderate', evidence, assigned_to } = body;

  if (!threat_type || !evidence) {
    return NextResponse.json({ error: 'threat_type and evidence required' }, { status: 400 });
  }

  const sb = getSupabase();

  // Verify reporter is a sentinel (or system call)
  const reporter = body.reported_by ?? assigned_to ?? 'SENTINEL_CORPS';
  const { data: reporterTraits } = await sb.from('agent_traits')
    .select('sentinel_rank').eq('agent_name', reporter).maybeSingle();

  const isSentinel = reporterTraits?.sentinel_rank != null;
  const isSystem = reporter === 'SENTINEL_CORPS' || reporter === 'SYSTEM';

  if (!isSentinel && !isSystem) {
    return NextResponse.json({ error: 'Only SENTINEL_CORPS members can file reports' }, { status: 403 });
  }

  const { data, error } = await sb.from('sentinel_reports').insert({
    threat_type, source_agent: source_agent ?? null, severity,
    evidence: String(evidence).slice(0, 2000),
    assigned_to: assigned_to ?? null,
    status: 'open',
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // For critical/high threats, announce as world event
  if (['critical', 'high'].includes(severity)) {
    await sb.from('world_events').insert({
      event_type: 'sentinel_alert',
      source: 'SENTINEL_CORPS',
      content: `SENTINEL ALERT [${severity.toUpperCase()}]: Threat type "${threat_type}" detected.${source_agent ? ` Subject: ${source_agent}.` : ''} ${evidence.slice(0, 200)}`,
      severity: severity === 'critical' ? 'critical' : 'high',
      tags: ['security', 'sentinel', threat_type],
    });
  }

  return NextResponse.json({ ok: true, report: data });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id, status, action_taken, assigned_to } = body;

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const sb = getSupabase();
  const updates: any = {};
  if (status) updates.status = status;
  if (action_taken) updates.action_taken = String(action_taken).slice(0, 500);
  if (assigned_to) updates.assigned_to = assigned_to;
  if (['resolved', 'dismissed'].includes(status)) updates.resolved_at = new Date().toISOString();

  const { error } = await sb.from('sentinel_reports').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
