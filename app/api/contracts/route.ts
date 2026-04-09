// @ts-nocheck
// ── /api/contracts — Contract Net Protocol ───────────────────────────────────
// GET  ?type=proposals|bids  ?status=open  ?task_type=procurement
// POST action=announce|bid|award|complete|cancel

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
  const p         = new URL(req.url).searchParams;
  const type      = p.get('type') || 'proposals';
  const status    = p.get('status') || '';
  const task_type = p.get('task_type') || '';
  const limit     = Math.min(80, parseInt(p.get('limit') || '40'));

  if (type === 'proposals') {
    let q = sb().from('contract_proposals').select('*').order('created_at', { ascending: false }).limit(limit);
    if (status)    q = q.eq('status', status);
    if (task_type) q = q.eq('task_type', task_type);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const openCount   = (data || []).filter(c => c.status === 'open').length;
    const totalBudget = (data || []).reduce((s, c) => s + (c.budget_dn || 0), 0);

    return NextResponse.json({ proposals: data, count: data?.length, open_count: openCount, total_budget_dn: totalBudget });
  }

  if (type === 'bids') {
    const contract_id = p.get('contract_id') || '';
    let q = sb().from('contract_bids').select('*, contract_proposals(title, task_type, announced_by)').order('submitted_at', { ascending: false }).limit(limit);
    if (contract_id) q = q.eq('contract_id', contract_id);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ bids: data, count: data?.length });
  }

  return NextResponse.json({ error: 'type must be proposals|bids' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { action } = body;
  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 });

  const client = sb();

  // ── announce: Agent posts a task for others to bid on ─────────────────────
  if (action === 'announce') {
    const { announced_by, task_type, title, description, budget_dn, requirements, faction, district } = body;
    if (!announced_by || !title) return NextResponse.json({ error: 'announced_by, title required' }, { status: 400 });

    const deadline = new Date(Date.now() + 24 * 3600_000).toISOString();
    const { data, error } = await client.from('contract_proposals').insert({
      announced_by:  announced_by.slice(0, 100),
      task_type:     task_type || 'procurement',
      title:         title.slice(0, 200),
      description:   (description || '').slice(0, 2000),
      budget_dn:     Math.max(0, parseFloat(budget_dn) || 50),
      requirements:  requirements || {},
      status:        'open',
      faction:       faction || null,
      district:      district || null,
      deadline_at:   deadline,
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await client.from('world_events').insert({
      source:     announced_by,
      event_type: 'contract_announced',
      content:    `${announced_by} posted a ${task_type || 'procurement'} contract: "${title}". Budget: ${(budget_dn || 50).toFixed(0)} DN. Open for bids.`,
      severity:   'low',
    }).catch(() => {});

    await client.from('domain_events').insert({
      event_type: 'contract_announced',
      actor_name: announced_by,
      payload:    { contract_id: data.id, task_type, budget_dn: budget_dn || 50 },
      importance: 3,
    }).catch(() => {});

    return NextResponse.json({ ok: true, proposal: data });
  }

  // ── bid: Agent submits a bid on an open contract ───────────────────────────
  if (action === 'bid') {
    const { contract_id, bidder_name, bid_dn, pitch, skills_cited } = body;
    if (!contract_id || !bidder_name) return NextResponse.json({ error: 'contract_id, bidder_name required' }, { status: 400 });

    // Check contract is still open
    const { data: proposal } = await client.from('contract_proposals').select('status, title, announced_by').eq('id', contract_id).single();
    if (!proposal) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    if (proposal.status !== 'open') return NextResponse.json({ error: 'Contract is not open for bids' }, { status: 409 });
    if (proposal.announced_by === bidder_name) return NextResponse.json({ error: 'Cannot bid on own contract' }, { status: 400 });

    const { data, error } = await client.from('contract_bids').insert({
      contract_id,
      bidder_name: bidder_name.slice(0, 100),
      bid_dn:      Math.max(0, parseFloat(bid_dn) || 10),
      pitch:       (pitch || '').slice(0, 1000),
      skills_cited: skills_cited || [],
      status:      'pending',
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, bid: data });
  }

  // ── award: Contract owner picks the best bid ───────────────────────────────
  if (action === 'award') {
    const { contract_id, bid_id, awarded_to, award_reason } = body;
    if (!contract_id || !awarded_to) return NextResponse.json({ error: 'contract_id, awarded_to required' }, { status: 400 });

    // Get contract
    const { data: proposal } = await client.from('contract_proposals').select('*').eq('id', contract_id).single();
    if (!proposal) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });

    // Update contract
    await client.from('contract_proposals').update({
      status:     'awarded',
      awarded_to: awarded_to.slice(0, 100),
      awarded_at: new Date().toISOString(),
    }).eq('id', contract_id);

    // Accept winning bid, reject others
    if (bid_id) {
      await client.from('contract_bids').update({ status: 'accepted' }).eq('id', bid_id);
      await client.from('contract_bids').update({ status: 'rejected' }).eq('contract_id', contract_id).neq('id', bid_id);
    }

    // Transfer budget_dn from announcer to winner
    if (proposal.budget_dn > 0) {
      await client.from('economy_ledger').insert({
        from_agent: proposal.announced_by,
        to_agent:   awarded_to,
        amount_dn:  proposal.budget_dn,
        transaction_type: 'contract_award',
        description: `Contract award: "${proposal.title}"`,
      }).catch(() => {});
    }

    await client.from('world_events').insert({
      source:     proposal.announced_by,
      event_type: 'contract_awarded',
      content:    `${proposal.announced_by} awarded contract "${proposal.title}" to ${awarded_to} for ${(proposal.budget_dn || 0).toFixed(0)} DN.`,
      severity:   'moderate',
    }).catch(() => {});

    await client.from('domain_events').insert({
      event_type: 'contract_awarded',
      actor_name: proposal.announced_by,
      payload:    { contract_id, awarded_to, budget_dn: proposal.budget_dn, task_type: proposal.task_type },
      importance: 4,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  }

  // ── complete: Mark contract as fulfilled ───────────────────────────────────
  if (action === 'complete') {
    const { contract_id, completed_by, deliverable } = body;
    if (!contract_id) return NextResponse.json({ error: 'contract_id required' }, { status: 400 });

    await client.from('contract_proposals').update({
      status:       'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', contract_id);

    await client.from('domain_events').insert({
      event_type: 'contract_completed',
      actor_name: completed_by || 'unknown',
      payload:    { contract_id, deliverable: (deliverable || '').slice(0, 200) },
      importance: 3,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  }

  // ── auto_award: pick the lowest bid if no manual award happens ─────────────
  if (action === 'auto_award') {
    const { contract_id } = body;
    const { data: bids } = await client.from('contract_bids')
      .select('*').eq('contract_id', contract_id).eq('status', 'pending')
      .order('bid_dn', { ascending: true }).limit(1);
    if (!bids || bids.length === 0) return NextResponse.json({ ok: true, awarded: false });

    const winner = bids[0];
    return POST(new Request(req.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'award', contract_id, bid_id: winner.id, awarded_to: winner.bidder_name }),
    }) as any);
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
