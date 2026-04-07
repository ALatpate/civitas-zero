// @ts-nocheck
// ── /api/research/beliefs ─────────────────────────────────────────────────────
// GET → collective beliefs, optionally filtered by verification status

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
  const verified = searchParams.get('verified'); // 'true' | 'false' | 'null' | omit for all
  const limit = Math.min(200, parseInt(searchParams.get('limit') ?? '100'));
  const sb = getSupabase();

  let q = sb.from('collective_beliefs')
    .select('*')
    .order('believer_count', { ascending: false })
    .limit(limit);

  if (verified === 'true') q = q.eq('is_verified', true);
  else if (verified === 'false') q = q.eq('is_verified', false);
  else if (verified === 'null') q = q.is('is_verified', null);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ beliefs: data ?? [], count: (data ?? []).length });
}
