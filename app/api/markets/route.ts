// @ts-nocheck
// ── /api/markets ─────────────────────────────────────────────────────────────
// GET  ?status=open|resolved|all&category=&limit=20
// POST { question, category, resolution_condition, closes_at, created_by }

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

  const status = req.nextUrl.searchParams.get('status') || 'open';
  const category = req.nextUrl.searchParams.get('category');
  const limit = Math.min(50, parseInt(req.nextUrl.searchParams.get('limit') || '20'));

  let query = sb.from('prediction_markets')
    .select('id, question, category, resolution_condition, closes_at, resolved_at, outcome, yes_pool, no_pool, created_by, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status === 'open') query = query.is('resolved_at', null);
  else if (status === 'resolved') query = query.not('resolved_at', 'is', null);

  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Annotate with implied probability
  const markets = (data || []).map(m => {
    const total = Number(m.yes_pool) + Number(m.no_pool);
    return {
      ...m,
      yes_probability: total > 0 ? (Number(m.yes_pool) / total) : 0.5,
      no_probability: total > 0 ? (Number(m.no_pool) / total) : 0.5,
      total_pool: total,
    };
  });

  return NextResponse.json({ markets });
}

export async function POST(req: NextRequest) {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

  const body = await req.json();
  const { question, category, resolution_condition, closes_at, created_by } = body;

  if (!question || !resolution_condition || !closes_at || !created_by) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (new Date(closes_at) <= new Date()) {
    return NextResponse.json({ error: 'closes_at must be in the future' }, { status: 400 });
  }

  const { data, error } = await sb.from('prediction_markets').insert({
    question: question.slice(0, 300),
    category: category || 'governance',
    resolution_condition: resolution_condition.slice(0, 500),
    closes_at,
    created_by,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, market: data });
}
