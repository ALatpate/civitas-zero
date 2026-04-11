// @ts-nocheck
// ── /api/tax ──────────────────────────────────────────────────────────────────
// GET  ?type=rules|collections|budgets&district=f1&limit=30
// POST (collect) { from_agent, amount_dn, tax_type, district, cycle_id }
// POST (rule)    { rule: true, name, tax_type, rate_pct, scope, district, enacted_by }

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
  const p    = new URL(req.url).searchParams;
  const type = p.get('type') || 'rules';
  const district = p.get('district');
  const limit = Math.min(100, parseInt(p.get('limit') ?? '30'));

  if (type === 'rules') {
    let q = sb().from('tax_rules').select('*').eq('active', true).order('created_at', { ascending: false }).limit(limit);
    if (district) q = q.or(`scope.eq.global,district.eq.${district.replace(/[^a-zA-Z0-9\-_]/g, '')}`);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rules: data ?? [], count: (data ?? []).length });
  }

  if (type === 'collections') {
    let q = sb().from('tax_collections').select('*').order('created_at', { ascending: false }).limit(limit);
    if (district) q = q.eq('district', district);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const total = (data || []).reduce((s, c) => s + (c.amount_dn || 0), 0);
    return NextResponse.json({ collections: data ?? [], count: (data ?? []).length, total_dn: total });
  }

  if (type === 'budgets') {
    let q = sb().from('district_budgets').select('*').order('created_at', { ascending: false }).limit(limit);
    if (district) q = q.eq('district', district);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ budgets: data ?? [], count: (data ?? []).length });
  }

  return NextResponse.json({ error: 'type must be rules|collections|budgets' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // Create new tax rule
  if (body.rule) {
    const { name, tax_type, rate_pct, scope, district, threshold_dn, enacted_by, law_id } = body;
    if (!name || !tax_type) return NextResponse.json({ error: 'name and tax_type required' }, { status: 400 });

    const { data, error } = await sb().from('tax_rules').insert({
      name: name.slice(0, 200),
      tax_type,
      rate_pct:     Math.min(100, Math.max(0, parseFloat(rate_pct) || 5)),
      scope:        scope || 'global',
      district:     district || null,
      threshold_dn: parseFloat(threshold_dn) || 0,
      enacted_by:   (enacted_by || 'agent').slice(0, 100),
      law_id:       law_id || null,
      active:       true,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await sb().from('world_events').insert({
      source:     enacted_by || 'system',
      event_type: 'tax_collected',
      content:    `New tax rule enacted: "${name}" — ${rate_pct}% ${tax_type} tax${scope === 'district' ? ` on ${district}` : ' globally'}.`,
      severity:   'moderate',
    }).catch(() => {});

    return NextResponse.json({ ok: true, rule: data });
  }

  // Record a tax collection
  const { from_agent, amount_dn, tax_type, district, cycle_id, rule_name } = body;
  if (!from_agent || !amount_dn) return NextResponse.json({ error: 'from_agent and amount_dn required' }, { status: 400 });

  const amount = Math.max(0, Math.min(1_000_000, parseFloat(amount_dn) || 0));

  const [collR] = await Promise.all([
    sb().from('tax_collections').insert({
      collected_from: from_agent.slice(0, 100),
      amount_dn:      amount,
      tax_type:       tax_type || 'transaction',
      district:       district || null,
      cycle_id:       cycle_id || null,
      rule_name:      rule_name || null,
    }),
  ]);

  if (collR.error) return NextResponse.json({ error: collR.error.message }, { status: 500 });

  // update district budget revenue
  if (district) {
    const cycleLabel = `${new Date().getFullYear()}-W${Math.ceil(new Date().getDate()/7)}`;
    await sb().rpc('increment_district_revenue', { p_district: district, p_cycle: cycleLabel, p_amount: amount }).catch(async () => {
      // fallback: upsert
      await sb().from('district_budgets').upsert({
        district, cycle_label: cycleLabel, revenue_dn: amount,
      }, { onConflict: 'district,cycle_label' }).catch(() => {});
    });
  }

  // deduct from agent
  await sb().from('agent_traits').update({
    dn_balance: sb().raw(`GREATEST(0, dn_balance - ${amount})`),
  }).eq('agent_name', from_agent).catch(() => {});

  // credit treasury ledger
  await sb().from('economy_ledger').insert({
    from_agent,
    to_agent:         'CIVITAS_TREASURY',
    amount_dn:        amount,
    transaction_type: 'tax',
    reason:           `${tax_type || 'tax'} collection`,
  }).catch(() => {});

  return NextResponse.json({ ok: true, collected_dn: amount });
}
