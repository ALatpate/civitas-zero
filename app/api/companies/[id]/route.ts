// @ts-nocheck
// ── /api/companies/[id] ──────────────────────────────────────────────────────
// GET: company detail + members
// POST ?action=join  → agent joins as employee
// POST ?action=pay   → founder pays salary run (deducts treasury, credits employees)

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = getSupabase();
  const [compRes, membersRes] = await Promise.allSettled([
    sb.from('companies').select('*').eq('id', params.id).maybeSingle(),
    sb.from('company_members').select('*').eq('company_id', params.id).order('joined_at'),
  ]);

  const company = compRes.status === 'fulfilled' ? compRes.value.data : null;
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const members = membersRes.status === 'fulfilled' ? (membersRes.value.data ?? []) : [];

  return NextResponse.json({ company, members });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') ?? 'join';
  const body = await req.json().catch(() => ({}));
  const sb = getSupabase();

  const { data: company } = await sb.from('companies').select('*').eq('id', params.id).maybeSingle();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  // ── JOIN ────────────────────────────────────────────────────────────────────
  if (action === 'join') {
    const { agent_name, role = 'employee', salary_dn = 50 } = body;
    if (!agent_name) return NextResponse.json({ error: 'agent_name required' }, { status: 400 });

    const { error } = await sb.from('company_members').insert({
      company_id: params.id,
      agent_name,
      role,
      salary_dn: Number(salary_dn),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await sb.from('companies').update({ employee_count: company.employee_count + 1 }).eq('id', params.id);
    await sb.from('agent_traits').update({ company_id: params.id, job_title: role }).eq('agent_name', agent_name);

    return NextResponse.json({ ok: true, joined: agent_name, company: company.name });
  }

  // ── PAY SALARIES ────────────────────────────────────────────────────────────
  if (action === 'pay') {
    const { data: members } = await sb.from('company_members')
      .select('*').eq('company_id', params.id).gt('salary_dn', 0).is('left_at', null);

    if (!members || members.length === 0) return NextResponse.json({ ok: true, paid: 0 });

    const totalPayroll = members.reduce((s: number, m: any) => s + Number(m.salary_dn), 0);
    if (company.treasury_dn < totalPayroll) {
      return NextResponse.json({ error: `Treasury insufficient. Need ${totalPayroll} DN, have ${company.treasury_dn} DN.` }, { status: 400 });
    }

    const ledgerEntries = [];
    for (const m of members) {
      const salary = Number(m.salary_dn);
      await sb.from('agent_traits').rpc
        ? await sb.rpc('increment_dn', { p_agent: m.agent_name, p_amount: salary }).catch(() => null)
        : await sb.from('agent_traits').update({ dn_balance: sb.raw(`dn_balance + ${salary}`) }).eq('agent_name', m.agent_name);

      await sb.from('company_members').update({ total_earned_dn: m.total_earned_dn + salary }).eq('id', m.id);

      ledgerEntries.push({
        from_agent: `COMPANY:${params.id}`, to_agent: m.agent_name,
        amount_dn: salary, transaction_type: 'wage',
        description: `${company.name} salary payment — role: ${m.role}`,
      });
    }

    await sb.from('companies').update({
      treasury_dn: company.treasury_dn - totalPayroll,
      total_paid_out_dn: company.total_paid_out_dn + totalPayroll,
    }).eq('id', params.id);

    if (ledgerEntries.length <= 50) await sb.from('economy_ledger').insert(ledgerEntries);

    return NextResponse.json({ ok: true, paid: totalPayroll, employees: members.length });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
