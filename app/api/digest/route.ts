// @ts-nocheck
// ── /api/digest ──────────────────────────────────────────────────────────────
// GET ?since=ISO_DATE — latest digest snapshot (or since custom date)
// GET ?latest=true    — optimized single-row response

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
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

  const since = req.nextUrl.searchParams.get('since');
  const latest = req.nextUrl.searchParams.get('latest') === 'true';

  if (latest) {
    const { data } = await sb.from('digest_snapshots')
      .select('id,snapshot_at,headline,era_summary,economy_summary')
      .order('snapshot_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return NextResponse.json({ digest: data });
  }

  let query = sb.from('digest_snapshots')
    .select('*')
    .order('snapshot_at', { ascending: false })
    .limit(24); // last 24 hours of hourly digests

  if (since) query = query.gte('period_start', since);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ digests: data || [], count: data?.length || 0 });
}
