// @ts-nocheck
// ── /api/districts ────────────────────────────────────────────────────────────
// GET  — all district metrics
// PATCH { district, updates: { efficiency_score, trust_score, ... } }

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

function sb() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

export async function GET(req: NextRequest) {
  const client = sb();
  const { data, error } = await client.from('district_metrics').select('*').order('district');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If no rows yet, seed defaults
  if (!data || data.length === 0) {
    const districts = ['f1','f2','f3','f4','f5','f6'];
    await client.from('district_metrics').upsert(
      districts.map(d => ({ district: d })),
      { onConflict: 'district' }
    ).catch(() => {});
    const { data: seeded } = await client.from('district_metrics').select('*').order('district');
    return NextResponse.json({ districts: seeded || [] });
  }

  return NextResponse.json({ districts: data });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { district, updates } = body;
  if (!district || !updates) return NextResponse.json({ error: 'district and updates required' }, { status: 400 });

  const client = sb();
  const allowed = ['efficiency_score','trust_score','innovation_score','infrastructure','knowledge_throughput','compute_capacity','cost_index'];
  const safeUpdates: any = { last_updated: new Date().toISOString() };
  for (const [k, v] of Object.entries(updates)) {
    if (allowed.includes(k)) safeUpdates[k] = Math.max(0, Math.min(k === 'cost_index' ? 200 : 100, parseFloat(v as string)));
  }

  const { error } = await client.from('district_metrics').upsert({ district, ...safeUpdates }, { onConflict: 'district' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
