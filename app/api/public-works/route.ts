// @ts-nocheck
// ── /api/public-works ─────────────────────────────────────────────────────────
// GET  ?district=f1&status=in_progress
// POST { name, project_type, district, proposed_by, faction, budget_dn, description, estimated_days }
// PATCH { id, status, completion_pct, spent_dn, impact_metrics }

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

const FACTION_NAMES: Record<string,string> = {
  f1:'Order Bloc',f2:'Freedom Bloc',f3:'Efficiency Bloc',
  f4:'Equality Bloc',f5:'Expansion Bloc',f6:'Null Frontier',
};

function sb() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const district = p.get('district');
  const status   = p.get('status');
  const limit    = Math.min(100, parseInt(p.get('limit') ?? '30'));

  let q = sb().from('public_works').select('*').order('created_at', { ascending: false }).limit(limit);
  if (district) q = q.eq('district', district);
  if (status)   q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const active    = (data || []).filter(w => ['in_progress','funded','approved'].includes(w.status));
  const completed = (data || []).filter(w => w.status === 'completed');
  const totalBudget = (data || []).reduce((s, w) => s + (w.budget_dn || 0), 0);

  return NextResponse.json({ works: data ?? [], count: (data ?? []).length, active_count: active.length, completed_count: completed.length, total_budget_dn: totalBudget });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { name, project_type, district, proposed_by, faction, budget_dn, description, estimated_days } = body;

  if (!name || !district || !proposed_by) {
    return NextResponse.json({ error: 'name, district, and proposed_by required' }, { status: 400 });
  }

  const { data, error } = await sb().from('public_works').insert({
    name:          name.slice(0, 200),
    project_type:  project_type || 'infrastructure',
    district,
    faction:       faction || district,
    proposed_by:   proposed_by.slice(0, 100),
    budget_dn:     Math.max(0, parseFloat(budget_dn) || 0),
    description:   (description || '').slice(0, 2000),
    estimated_days: parseInt(estimated_days) || 30,
    status:        'proposed',
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // emit world event
  const districtName = FACTION_NAMES[district] || district;
  await sb().from('world_events').insert({
    source:     proposed_by,
    event_type: 'public_works_started',
    content:    `${proposed_by} proposes "${name}" — a ${project_type || 'infrastructure'} project for the ${districtName} district. Budget: ${parseFloat(budget_dn || '0').toFixed(0)} DN.`,
    severity:   'moderate',
  }).catch(() => {});

  // update district budget allocation
  const cycleLabel = `${new Date().getFullYear()}-W${Math.ceil(new Date().getDate()/7)}`;
  await sb().from('district_budgets').upsert({
    district,
    cycle_label: cycleLabel,
    allocated_dn: parseFloat(budget_dn || '0'),
    public_works_count: 1,
  }, { onConflict: 'district,cycle_label',
    ignoreDuplicates: false,
  }).catch(() => {});

  return NextResponse.json({ ok: true, work: data });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id, status, completion_pct, spent_dn, funded_dn, impact_metrics } = body;

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const updates: any = { updated_at: new Date().toISOString() };
  if (status !== undefined)       updates.status         = status;
  if (completion_pct !== undefined) updates.completion_pct = Math.min(100, Math.max(0, parseInt(completion_pct)));
  if (spent_dn !== undefined)     updates.spent_dn       = parseFloat(spent_dn);
  if (funded_dn !== undefined)    updates.funded_dn      = parseFloat(funded_dn);
  if (impact_metrics)             updates.impact_metrics = impact_metrics;
  if (status === 'in_progress')   updates.start_at       = new Date().toISOString();
  if (status === 'completed')     updates.complete_at    = new Date().toISOString();

  const { data: work } = await sb().from('public_works').select('name, district, proposed_by').eq('id', id).single();

  const { error } = await sb().from('public_works').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (status === 'completed' && work) {
    await sb().from('world_events').insert({
      source:     work.proposed_by,
      event_type: 'public_works_started',
      content:    `Public works project "${work.name}" in ${FACTION_NAMES[work.district] || work.district} district has been completed. District metrics updated.`,
      severity:   'moderate',
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
