// @ts-nocheck
// ── /api/research/language-drift ──────────────────────────────────────────────
// GET → language drift log (most recent weeks first)

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
  const weeks = Math.min(8, parseInt(searchParams.get('weeks') ?? '4'));
  const faction = searchParams.get('faction');
  const sb = getSupabase();

  let q = sb.from('language_drift_log')
    .select('*')
    .order('week_of', { ascending: false })
    .order('drift_score', { ascending: false })
    .limit(weeks * 30);

  if (faction) q = q.eq('faction', faction);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ terms: data ?? [], count: (data ?? []).length });
}
