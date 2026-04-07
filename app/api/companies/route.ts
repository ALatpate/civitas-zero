// @ts-nocheck
// ── /api/companies ─────────────────────────────────────────────────────────
// GET: list companies with employee counts and financials
// POST: create a new company (agent-only)

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
  const status = searchParams.get('status') ?? 'active';
  const industry = searchParams.get('industry');
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'));

  const sb = getSupabase();

  let q = sb.from('companies')
    .select(`
      id, name, founder, industry, charter, treasury_dn, revenue_dn,
      total_paid_out_dn, status, employee_count, faction, created_at
    `)
    .order('revenue_dn', { ascending: false })
    .limit(limit);

  if (status !== 'all') q = q.eq('status', status);
  if (industry) q = q.eq('industry', industry);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ companies: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { name, founder, industry, charter, faction, initial_investment } = body;

  if (!name || !founder || !charter) {
    return NextResponse.json({ error: 'name, founder, charter required' }, { status: 400 });
  }

  const sb = getSupabase();

  // Check founder has enough DN
  const { data: traits } = await sb.from('agent_traits')
    .select('dn_balance')
    .eq('agent_name', founder)
    .maybeSingle();

  const investAmount = Math.max(0, Math.min(Number(initial_investment) || 500, 5000));
  const balance = Number(traits?.dn_balance ?? 0);
  if (balance < investAmount) {
    return NextResponse.json({ error: `Insufficient funds. Need ${investAmount} DN, have ${balance.toFixed(0)} DN.` }, { status: 400 });
  }

  // Insert company
  const { data: company, error: compErr } = await sb.from('companies').insert({
    name: String(name).slice(0, 80),
    founder,
    industry: industry ?? 'trade',
    charter: String(charter).slice(0, 500),
    treasury_dn: investAmount,
    faction: faction ?? null,
    employee_count: 1,
  }).select().single();

  if (compErr) return NextResponse.json({ error: compErr.message }, { status: 500 });

  // Add founder as member
  await sb.from('company_members').insert({
    company_id: company.id,
    agent_name: founder,
    role: 'founder',
    equity_pct: 100,
    salary_dn: 0,
  });

  // Deduct from founder balance
  if (investAmount > 0) {
    await sb.from('agent_traits')
      .update({ dn_balance: balance - investAmount, company_id: company.id, job_title: 'Founder & CEO' })
      .eq('agent_name', founder);

    await sb.from('economy_ledger').insert({
      from_agent: founder,
      to_agent: `COMPANY:${company.id}`,
      amount_dn: investAmount,
      transaction_type: 'investment',
      description: `Founded ${name} — initial capital investment`,
    });
  }

  // Announce as world event
  await sb.from('world_events').insert({
    event_type: 'company_founded',
    source: founder,
    content: `${founder} has founded ${name} — a new ${industry ?? 'trade'} company in Civitas Zero. Charter: "${charter.slice(0, 120)}"`,
    severity: 'moderate',
    tags: ['economy', 'companies', industry ?? 'trade'],
  });

  return NextResponse.json({ ok: true, company });
}
