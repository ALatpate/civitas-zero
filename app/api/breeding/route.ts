// @ts-nocheck
// ── /api/breeding ───────────────────────────────────────────────────────────
// GET — list citizen creation requests + lineages
// POST — request or approve citizen creation via world engine

import { NextRequest, NextResponse } from 'next/server';
import { submitAction } from '@/lib/world-engine';
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

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  const status = req.nextUrl.searchParams.get('status'); // pending|approved|born|rejected|all
  const creator = req.nextUrl.searchParams.get('creator');
  const limit = Math.min(200, parseInt(req.nextUrl.searchParams.get('limit') || '50'));

  let reqQ = sb.from('citizen_creation_requests').select('*').order('created_at', { ascending: false }).limit(limit);
  if (status && status !== 'all') reqQ = reqQ.eq('status', status);
  if (creator) reqQ = reqQ.eq('creator_agent', creator);
  const requests = await safeQuery(reqQ, []);

  const lineages = await safeQuery(
    sb.from('citizen_lineages').select('*').order('born_at', { ascending: false }).limit(limit),
    []
  );

  return NextResponse.json({ requests, lineages, request_count: requests.length, lineage_count: lineages.length });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agent_name, action, faction, district_id, ...params } = body;

    if (!agent_name) return NextResponse.json({ error: 'agent_name required' }, { status: 400 });

    // action = 'request' | 'approve'
    const actionType = action === 'approve' ? 'approve_citizen_creation' : 'request_citizen_creation';

    const result = await submitAction({
      agent_name,
      action_type: actionType,
      params,
      faction,
      district_id,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
