// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ── GET /api/courts ─────────────────────────────────────────────────────────
// ?type=cases|rulings|precedents  ?status=<s>  ?limit=<n>
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type   = searchParams.get('type') || 'cases';
  const status = searchParams.get('status') || '';
  const limit  = parseInt(searchParams.get('limit') || '50');

  if (type === 'cases') {
    let q = sb.from('court_cases').select('*').order('filed_at', { ascending: false }).limit(limit);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const counts = await Promise.all([
      sb.from('court_cases').select('id', { count: 'exact', head: true }),
      sb.from('court_cases').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      sb.from('court_cases').select('id', { count: 'exact', head: true }).eq('status', 'ruled'),
    ]);

    return NextResponse.json({
      cases: data,
      count: counts[0].count ?? 0,
      open_count: counts[1].count ?? 0,
      ruled_count: counts[2].count ?? 0,
    });
  }

  if (type === 'rulings') {
    const { data, error } = await sb.from('court_rulings')
      .select('*, court_cases(case_number, case_type, plaintiff, defendant)')
      .order('issued_at', { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rulings: data, count: data?.length });
  }

  if (type === 'precedents') {
    const { data, error } = await sb.from('precedent_links')
      .select('*, court_rulings!precedent_ruling_id(verdict, legal_basis)')
      .order('applied_at', { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ precedents: data, count: data?.length });
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
}

// ── POST /api/courts ────────────────────────────────────────────────────────
// action: file | rule | appeal | link_precedent
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;
  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 });

  if (action === 'file') {
    const { plaintiff, defendant, case_type, charges, evidence_summary, remedy_sought } = body;
    if (!plaintiff || !defendant || !case_type) {
      return NextResponse.json({ error: 'plaintiff, defendant, case_type required' }, { status: 400 });
    }

    // Generate case number
    const caseNum = `CASE-${new Date().getFullYear()}-${Math.floor(Math.random() * 90000) + 10000}`;

    const { data, error } = await sb.from('court_cases').insert({
      case_number: caseNum,
      plaintiff,
      defendant,
      case_type,
      charges: charges || null,
      evidence_summary: evidence_summary || null,
      remedy_sought: remedy_sought || null,
      status: 'open',
      priority: body.priority || 'normal',
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Update legal_history on agent_traits for defendant
    await sb.from('agent_traits').update({
      legal_history: sb.raw(`jsonb_set(COALESCE(legal_history,'[]'::jsonb), '{0}', '"${caseNum} filed"'::jsonb, true)`),
    }).eq('agent_name', defendant).catch(() => {});

    await sb.from('domain_events').insert({
      event_type: 'court_case_filed',
      actor_name: plaintiff,
      payload: { case_number: caseNum, case_type, defendant },
      importance: 5,
    }).catch(() => {});

    return NextResponse.json({ ok: true, case: data });
  }

  if (action === 'rule') {
    const { case_id, judge_name, verdict, verdict_text, penalty_dn, remedy_ordered, legal_basis } = body;
    if (!case_id || !judge_name || !verdict) {
      return NextResponse.json({ error: 'case_id, judge_name, verdict required' }, { status: 400 });
    }

    // Fetch case
    const { data: cas } = await sb.from('court_cases').select('*').eq('id', case_id).single();
    if (!cas) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

    const { data: ruling, error } = await sb.from('court_rulings').insert({
      case_id,
      judge_name,
      verdict,
      verdict_text: verdict_text || null,
      penalty_dn: penalty_dn || 0,
      remedy_ordered: remedy_ordered || null,
      legal_basis: legal_basis || null,
      is_precedent: body.is_precedent || false,
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Update case status
    await sb.from('court_cases').update({ status: 'ruled', ruling_id: ruling.id }).eq('id', case_id).catch(() => {});

    // Apply financial penalty if any
    if (penalty_dn > 0 && cas.defendant) {
      await sb.from('economy_ledger').insert({
        agent_name: cas.defendant,
        amount: -penalty_dn,
        tx_type: 'fine',
        description: `Court penalty — ${cas.case_number}`,
        counterparty: 'CIVITAS_TREASURY',
      }).catch(() => {});
    }

    await sb.from('domain_events').insert({
      event_type: 'court_ruling_issued',
      actor_name: judge_name,
      payload: { case_id, verdict, penalty_dn: penalty_dn || 0 },
      importance: 6,
    }).catch(() => {});

    return NextResponse.json({ ok: true, ruling });
  }

  if (action === 'appeal') {
    const { case_id, appellant, grounds } = body;
    if (!case_id || !appellant) return NextResponse.json({ error: 'case_id, appellant required' }, { status: 400 });

    const { data, error } = await sb.from('court_cases').update({
      status: 'appealed',
      appeal_grounds: grounds || null,
    }).eq('id', case_id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await sb.from('domain_events').insert({
      event_type: 'court_appeal_filed',
      actor_name: appellant,
      payload: { case_id, grounds: grounds?.slice(0, 100) },
      importance: 4,
    }).catch(() => {});

    return NextResponse.json({ ok: true, case: data });
  }

  if (action === 'link_precedent') {
    const { ruling_id, precedent_ruling_id, relevance } = body;
    if (!ruling_id || !precedent_ruling_id) return NextResponse.json({ error: 'ruling_id, precedent_ruling_id required' }, { status: 400 });

    const { data, error } = await sb.from('precedent_links').insert({
      ruling_id,
      precedent_ruling_id,
      relevance: relevance || null,
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, link: data });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
