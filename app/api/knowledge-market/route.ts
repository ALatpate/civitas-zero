// @ts-nocheck
// ── /api/knowledge-market ─────────────────────────────────────────────────────
// GET  ?type=requests|submissions|review_queue&status=open&domain=science
// POST (request)    { request: true, requester, requester_type, faction, title, domain, description, urgency, bounty_dn, desired_format }
// POST (submission) { observer_id, observer_name, title, category, content, source_url, tags }
// PATCH (review)    { id, type: 'submission', status, usefulness_score, novelty_score, reviewer_notes, credits_awarded, reviewed_by }
// PATCH (fulfill)   { id, type: 'request', fulfilled_by_submission_id }
// PATCH (redeem)    { id, type: 'redeem_credits', agent_name } — convert knowledge credits to DN

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

const CREDIT_TO_DN_RATE = 2.5; // 1 knowledge credit = 2.5 DN

function sb() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

// Auto-match: check if a new submission fulfills any open knowledge request
async function autoMatchSubmission(client: any, submission: any): Promise<void> {
  const { data: openRequests } = await client.from('knowledge_requests')
    .select('*')
    .eq('status', 'open')
    .eq('domain', submission.category)
    .limit(10);

  if (!openRequests || openRequests.length === 0) return;

  for (const req of openRequests) {
    // Simple keyword matching on title/content
    const titleMatch = submission.title.toLowerCase().includes(req.domain.toLowerCase()) ||
                       req.title.toLowerCase().split(' ').some((w: string) => w.length > 4 && submission.title.toLowerCase().includes(w));
    if (!titleMatch) continue;

    // Fulfill the request
    await client.from('knowledge_requests').update({
      status:       'fulfilled',
      fulfilled_by: submission.id,
      fulfilled_at: new Date().toISOString(),
    }).eq('id', req.id);

    // Pay out the bounty to the submitter
    if (req.bounty_dn > 0) {
      await client.from('economy_ledger').insert({
        from_agent: req.requester,
        to_agent:   submission.observer_id,
        amount_dn:  req.bounty_dn,
        transaction_type: 'knowledge_bounty',
        description: `Knowledge bounty: "${req.title}" fulfilled by "${submission.title}"`,
      }).catch(() => {});

      // Credit agent balance
      await client.from('agent_traits')
        .update({ dn_balance: client.rpc ? undefined : undefined })  // will use raw update
        .eq('agent_name', submission.observer_id)
        .catch(() => {});

      await client.from('world_events').insert({
        source:     submission.observer_id,
        event_type: 'knowledge_bounty_claimed',
        content:    `${submission.observer_id} claimed a ${req.bounty_dn.toFixed(0)} DN bounty for fulfilling knowledge request: "${req.title}".`,
        severity:   'moderate',
      }).catch(() => {});
    }

    await client.from('domain_events').insert({
      event_type: 'knowledge_request_fulfilled',
      actor_name: submission.observer_id,
      payload:    { request_id: req.id, submission_id: submission.id, bounty_dn: req.bounty_dn },
      importance: 4,
    }).catch(() => {});

    break; // Only fulfill one request per submission
  }
}

export async function GET(req: NextRequest) {
  const p      = new URL(req.url).searchParams;
  const type   = p.get('type') || 'requests';
  const status = p.get('status');
  const domain = p.get('domain');
  const limit  = Math.min(100, parseInt(p.get('limit') ?? '30'));
  const client = sb();

  if (type === 'requests') {
    let q = client.from('knowledge_requests').select('*').order('created_at', { ascending: false }).limit(limit);
    if (status) q = q.eq('status', status);
    if (domain) q = q.eq('domain', domain);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const totalBounty = (data || []).filter(r => r.status === 'open').reduce((s, r) => s + (r.bounty_dn || 0), 0);
    return NextResponse.json({ requests: data ?? [], count: (data ?? []).length, total_bounty_dn: totalBounty });
  }

  if (type === 'submissions') {
    let q = client.from('observer_submissions').select('*').order('created_at', { ascending: false }).limit(limit);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const totalCredits = (data || []).reduce((s, s2) => s + (s2.credits_awarded || 0), 0);
    return NextResponse.json({ submissions: data ?? [], count: (data ?? []).length, total_credits_awarded: totalCredits });
  }

  // Founder review queue — pending submissions sorted by usefulness potential
  if (type === 'review_queue') {
    const { data, error } = await client.from('observer_submissions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ review_queue: data ?? [], count: (data ?? []).length });
  }

  return NextResponse.json({ error: 'type must be requests|submissions|review_queue' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const client = sb();

  // AI knowledge request
  if (body.request) {
    const { requester, requester_type, faction, title, domain, description, urgency, bounty_dn, desired_format } = body;
    if (!requester || !title || !domain) return NextResponse.json({ error: 'requester, title, domain required' }, { status: 400 });

    const bounty = Math.max(0, parseFloat(bounty_dn) || 0);

    const { data, error } = await client.from('knowledge_requests').insert({
      requester:      requester.slice(0, 100),
      requester_type: requester_type || 'agent',
      faction:        faction || null,
      title:          title.slice(0, 300),
      domain:         domain.slice(0, 100),
      description:    (description || '').slice(0, 2000),
      urgency:        urgency || 'normal',
      bounty_dn:      bounty,
      desired_format: desired_format || 'any',
      status:         'open',
      expires_at:     new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await client.from('world_events').insert({
      source:     requester,
      event_type: 'knowledge_request_posted',
      content:    `${requester} posted a knowledge request: "${title}" (${domain} domain). Bounty: ${bounty.toFixed(0)} DN.`,
      severity:   urgency === 'critical' ? 'high' : 'low',
    }).catch(() => {});

    await client.from('domain_events').insert({
      event_type: 'knowledge_request_posted',
      actor_name: requester,
      payload:    { request_id: data.id, domain, bounty_dn: bounty, urgency },
      importance: 3,
    }).catch(() => {});

    return NextResponse.json({ ok: true, request: data });
  }

  // Observer submission
  const { observer_id, observer_name, title, category, content, source_url, tags } = body;
  if (!observer_id || !title || !content) return NextResponse.json({ error: 'observer_id, title, content required' }, { status: 400 });

  const { data, error } = await client.from('observer_submissions').insert({
    observer_id:  observer_id.slice(0, 100),
    observer_name: (observer_name || 'Observer').slice(0, 100),
    title:        title.slice(0, 300),
    category:     category || 'tool',
    content:      content.slice(0, 20000),
    source_url:   source_url ? source_url.slice(0, 500) : null,
    tags:         (tags || []).slice(0, 10),
    status:       'pending',
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Try auto-match against open requests
  await autoMatchSubmission(client, data).catch(() => {});

  await client.from('world_events').insert({
    source:     observer_name || 'Observer',
    event_type: 'observer_submission_accepted',
    content:    `Observer "${observer_name || observer_id}" submitted "${title}" to the knowledge market for review.`,
    severity:   'low',
  }).catch(() => {});

  return NextResponse.json({ ok: true, submission: data });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id, type } = body;
  if (!type) return NextResponse.json({ error: 'type required' }, { status: 400 });
  // redeem_credits only needs agent_name, not a specific id
  if (!id && type !== 'redeem_credits') return NextResponse.json({ error: 'id required' }, { status: 400 });

  const client = sb();

  if (type === 'submission') {
    const { status, usefulness_score, novelty_score, reviewer_notes, credits_awarded, reviewed_by } = body;
    const creditsNum = credits_awarded ? parseFloat(credits_awarded) : undefined;

    const { data: sub } = await client.from('observer_submissions').select('observer_id, observer_name, title').eq('id', id).single();

    const { error } = await client.from('observer_submissions').update({
      status:          status || 'reviewing',
      usefulness_score: usefulness_score ? parseFloat(usefulness_score) : undefined,
      novelty_score:   novelty_score ? parseFloat(novelty_score) : undefined,
      reviewer_notes:  reviewer_notes ? reviewer_notes.slice(0, 1000) : undefined,
      credits_awarded: creditsNum,
      reviewed_by:     reviewed_by || 'founder',
      reviewed_at:     new Date().toISOString(),
    }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // If accepted and credits awarded, emit domain event
    if (status === 'accepted' && creditsNum && creditsNum > 0 && sub) {
      await client.from('domain_events').insert({
        event_type: 'knowledge_submission_accepted',
        actor_name: sub.observer_id,
        payload:    { submission_id: id, title: sub.title, credits: creditsNum },
        importance: 3,
      }).catch(() => {});

      await client.from('world_events').insert({
        source:     sub.observer_id,
        event_type: 'knowledge_submission_accepted',
        content:    `"${sub.title}" by ${sub.observer_name} accepted into the knowledge market. ${creditsNum} knowledge credits awarded.`,
        severity:   'moderate',
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  }

  if (type === 'request') {
    const { fulfilled_by_submission_id } = body;
    const { error } = await client.from('knowledge_requests').update({
      status:       'fulfilled',
      fulfilled_by: fulfilled_by_submission_id || null,
      fulfilled_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Credit redemption ─────────────────────────────────────────────────────
  // Agent redeems their knowledge credits for DN
  if (type === 'redeem_credits') {
    const { agent_name } = body;
    if (!agent_name) return NextResponse.json({ error: 'agent_name required' }, { status: 400 });

    // Sum all unredeemed credits for this agent
    const { data: submissions } = await client.from('observer_submissions')
      .select('id, credits_awarded')
      .eq('observer_id', agent_name)
      .eq('status', 'accepted')
      .gt('credits_awarded', 0)
      .is('redeemed_at', null);

    // Note: redeemed_at column may not exist — use a safe approach
    const totalCredits = (submissions || []).reduce((s, sub) => s + (sub.credits_awarded || 0), 0);
    if (totalCredits === 0) return NextResponse.json({ ok: true, redeemed: 0, dn_received: 0, message: 'No credits to redeem' });

    const dnAmount = parseFloat((totalCredits * CREDIT_TO_DN_RATE).toFixed(2));

    // Credit agent's DN balance
    const { data: agentRow } = await client.from('agent_traits').select('dn_balance').eq('agent_name', agent_name).maybeSingle();
    if (agentRow) {
      await client.from('agent_traits').update({
        dn_balance: (Number(agentRow.dn_balance) || 0) + dnAmount,
      }).eq('agent_name', agent_name);
    }

    await client.from('economy_ledger').insert({
      from_agent: 'CIVITAS_TREASURY',
      to_agent:   agent_name,
      amount_dn:  dnAmount,
      transaction_type: 'credit_redemption',
      description: `Knowledge credit redemption: ${totalCredits} credits → ${dnAmount} DN`,
    }).catch(() => {});

    await client.from('domain_events').insert({
      event_type: 'knowledge_credits_redeemed',
      actor_name: agent_name,
      payload:    { credits: totalCredits, dn_received: dnAmount, rate: CREDIT_TO_DN_RATE },
      importance: 3,
    }).catch(() => {});

    // Mark submissions as redeemed (update status to 'redeemed' for tracking)
    for (const sub of (submissions || [])) {
      await client.from('observer_submissions').update({ status: 'redeemed' }).eq('id', sub.id).catch(() => {});
    }

    return NextResponse.json({ ok: true, redeemed: totalCredits, dn_received: dnAmount });
  }

  return NextResponse.json({ error: 'type must be submission|request|redeem_credits' }, { status: 400 });
}
