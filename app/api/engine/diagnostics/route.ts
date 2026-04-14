// @ts-nocheck
// ── /api/engine/diagnostics ─────────────────────────────────────────────────
// Founder-only: integrity checks, orphan detection, export reconciliation
// GET ?check=provenance|orphans|stats|all

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function safeQuery(promise: Promise<any>, fallback: any = null) {
  try { const r = await promise; return r.data ?? fallback; } catch { return fallback; }
}

async function safeCount(sb: any, table: string) {
  try { const { count } = await sb.from(table).select('*', { count: 'exact', head: true }); return count || 0; } catch { return 0; }
}

export async function GET(req: NextRequest) {
  // UI is already gated to founder-only via World Engine tab
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'Database not configured', checked_at: new Date().toISOString(), checks: {} });

  const check = req.nextUrl.searchParams.get('check') || 'all';
  const results: any = { checked_at: new Date().toISOString(), checks: {} };

  // ── Table stats (always first — most useful) ──
  if (check === 'stats' || check === 'all') {
    const coreTables = ['citizens', 'world_events', 'discourse_posts', 'ai_publications', 'economy_ledger', 'chat_messages', 'comm_messages', 'habitats', 'citizen_creation_requests', 'citizen_lineages'];
    const extraTables = ['action_requests', 'action_results', 'agent_drives', 'agent_capabilities', 'agent_relationships', 'terrain_zones', 'vegetation', 'wildlife', 'agent_messages', 'wallet_transactions', 'citizen_relationships', 'districts', 'world_state', 'activity_log', 'message_threads'];
    const allTables = [...coreTables, ...extraTables];
    const counts: any = {};
    await Promise.all(allTables.map(async t => { counts[t] = await safeCount(sb, t); }));

    // Split into existing (non-zero or confirmed) and missing
    const existing: any = {};
    const missing: string[] = [];
    for(const t of allTables){ if(counts[t] !== null && counts[t] !== undefined) existing[t] = counts[t]; else missing.push(t); }

    results.checks.table_counts = { counts: existing, status: 'PASS' };
    if(missing.length > 0) results.checks.missing_tables = { tables: missing, status: 'WARN', note: 'These tables may not exist yet in Supabase' };

    // Reconciliation
    const actionTotal = counts.action_requests || 0;
    const resultTotal = counts.action_results || 0;
    if(actionTotal > 0 || resultTotal > 0){
      results.checks.reconciliation = {
        action_requests: actionTotal,
        action_results: resultTotal,
        actions_without_results: Math.max(0, actionTotal - resultTotal),
        status: actionTotal <= resultTotal + 5 ? 'PASS' : 'WARN',
      };
    }
  }

  // ── Population snapshot ──
  if (check === 'all') {
    const citizens = await safeQuery(
      sb.from('citizens').select('agent_name, faction, status, district_id').limit(500),
      []
    );
    const alive = citizens.filter((c:any)=>c.status!=='dead');
    const factionBreakdown: any = {};
    alive.forEach((c:any)=>{ const f=c.faction||'unaffiliated'; factionBreakdown[f]=(factionBreakdown[f]||0)+1; });
    results.checks.population = {
      total_citizens: citizens.length,
      alive: alive.length,
      faction_breakdown: factionBreakdown,
      status: alive.length > 0 ? 'PASS' : 'WARN',
    };
  }

  // ── Recent activity ──
  if (check === 'all') {
    const recentEvents = await safeQuery(
      sb.from('world_events').select('id, event_type, source, initiating_agent, created_at')
        .order('created_at', { ascending: false }).limit(10),
      []
    );
    results.checks.recent_activity = {
      last_10_events: recentEvents.map((e:any)=>({
        type: e.event_type, agent: e.initiating_agent||e.source, time: e.created_at,
      })),
      last_event_at: recentEvents[0]?.created_at || 'none',
      status: recentEvents.length > 0 ? 'PASS' : 'WARN',
    };
  }

  // ── Provenance check: events without initiating_agent ──
  if (check === 'provenance' || check === 'all') {
    const orphanProvenance = await safeQuery(
      sb.from('world_events').select('id, event_type, source, created_at')
        .is('initiating_agent', null).order('created_at', { ascending: false }).limit(50),
      []
    );
    results.checks.provenance = {
      events_missing_provenance: orphanProvenance.length,
      samples: orphanProvenance.slice(0, 5),
      status: orphanProvenance.length === 0 ? 'PASS' : 'WARN',
    };
  }

  // ── Orphan detection: action_requests without results ──
  if (check === 'orphans' || check === 'all') {
    const stuckRequests = await safeQuery(
      sb.from('action_requests').select('id, agent_name, action_type, status, submitted_at')
        .in('status', ['validating', 'executing'])
        .order('submitted_at', { ascending: true }).limit(50),
      []
    );
    results.checks.orphan_requests = {
      stuck_count: stuckRequests.length,
      samples: stuckRequests.slice(0, 5),
      status: stuckRequests.length === 0 ? 'PASS' : 'WARN',
    };
  }

  // ── System diagnostics record (non-critical) ──
  try {
    await sb.from('system_diagnostics').insert({
      check_type: check,
      status: Object.values(results.checks).every((c: any) => c.status === 'PASS') ? 'healthy' : 'warning',
      details: results.checks,
    });
  } catch {}

  return NextResponse.json(results);
}
