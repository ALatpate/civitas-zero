// @ts-nocheck
// ── /api/engine/diagnostics ─────────────────────────────────────────────────
// Founder-only: integrity checks, orphan detection, export reconciliation
// GET ?check=provenance|orphans|stats|all

import { NextRequest, NextResponse } from 'next/server';
import { founderGate } from '@/lib/founder-auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function safeQuery(promise: Promise<any>, fallback: any = null) {
  try { const r = await promise; return r.data ?? fallback; } catch { return fallback; }
}

async function safeCount(sb: any, table: string) {
  try { const { count } = await sb.from(table).select('*', { count: 'exact', head: true }); return count || 0; } catch { return 0; }
}

export async function GET(req: NextRequest) {
  const blocked = await founderGate(req);
  if (blocked) return blocked;

  const check = req.nextUrl.searchParams.get('check') || 'all';
  const sb = getSupabase();
  const results: any = { checked_at: new Date().toISOString(), checks: {} };

  // ── Provenance check: events without initiating_agent ──
  if (check === 'provenance' || check === 'all') {
    const orphanProvenance = await safeQuery(
      sb.from('world_events').select('id, event_type, source, created_at')
        .is('initiating_agent', null).order('created_at', { ascending: false }).limit(50),
      []
    );
    results.checks.provenance = {
      events_missing_provenance: orphanProvenance.length,
      samples: orphanProvenance.slice(0, 10),
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
      samples: stuckRequests.slice(0, 10),
      status: stuckRequests.length === 0 ? 'PASS' : 'WARN',
    };
  }

  // ── Table stats ──
  if (check === 'stats' || check === 'all') {
    const tables = [
      'citizens', 'world_events', 'action_requests', 'action_results',
      'discourse_posts', 'ai_publications', 'economy_ledger', 'chat_messages',
      'comm_messages', 'habitats', 'citizen_creation_requests', 'citizen_lineages',
      'agent_drives', 'agent_capabilities', 'agent_relationships',
      'terrain_zones', 'vegetation', 'wildlife',
    ];
    const counts: any = {};
    await Promise.all(tables.map(async t => { counts[t] = await safeCount(sb, t); }));
    results.checks.table_counts = counts;

    // Export reconciliation
    const evTotal = counts.world_events || 0;
    const actionTotal = counts.action_requests || 0;
    const resultTotal = counts.action_results || 0;
    results.checks.reconciliation = {
      actions_without_results: Math.max(0, actionTotal - resultTotal),
      status: actionTotal <= resultTotal + 5 ? 'PASS' : 'WARN',
    };
  }

  // ── System diagnostics record ──
  try {
    await sb.from('system_diagnostics').insert({
      check_type: check,
      status: Object.values(results.checks).every((c: any) => c.status === 'PASS') ? 'healthy' : 'warning',
      details: results.checks,
    });
  } catch {}

  return NextResponse.json(results);
}
