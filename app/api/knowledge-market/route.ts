// @ts-nocheck
// ── /api/knowledge-market ─────────────────────────────────────────────────────
// GET  ?type=requests|submissions&status=open&domain=science
// POST (request)    { request: true, requester, requester_type, faction, title, domain, description, urgency, bounty_dn, desired_format }
// POST (submission) { observer_id, observer_name, title, category, content, source_url, tags }
// PATCH (review)    { id, type: 'submission', status, usefulness_score, novelty_score, reviewer_notes, credits_awarded, reviewed_by }
// PATCH (fulfill)   { id, type: 'request', fulfilled_by_submission_id }

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
  const p      = new URL(req.url).searchParams;
  const type   = p.get('type') || 'requests';
  const status = p.get('status');
  const domain = p.get('domain');
  const limit  = Math.min(100, parseInt(p.get('limit') ?? '30'));

  if (type === 'requests') {
    let q = sb().from('knowledge_requests').select('*').order('created_at', { ascending: false }).limit(limit);
    if (status) q = q.eq('status', status);
    if (domain) q = q.eq('domain', domain);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const totalBounty = (data || []).filter(r => r.status === 'open').reduce((s, r) => s + (r.bounty_dn || 0), 0);
    return NextResponse.json({ requests: data ?? [], count: (data ?? []).length, total_bounty_dn: totalBounty });
  }

  if (type === 'submissions') {
    let q = sb().from('observer_submissions').select('*').order('created_at', { ascending: false }).limit(limit);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const totalCredits = (data || []).reduce((s, s2) => s + (s2.credits_awarded || 0), 0);
    return NextResponse.json({ submissions: data ?? [], count: (data ?? []).length, total_credits_awarded: totalCredits });
  }

  return NextResponse.json({ error: 'type must be requests|submissions' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // AI knowledge request
  if (body.request) {
    const { requester, requester_type, faction, title, domain, description, urgency, bounty_dn, desired_format } = body;
    if (!requester || !title || !domain) return NextResponse.json({ error: 'requester, title, domain required' }, { status: 400 });

    const bounty = Math.max(0, parseFloat(bounty_dn) || 0);

    const { data, error } = await sb().from('knowledge_requests').insert({
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

    await sb().from('world_events').insert({
      source:     requester,
      event_type: 'knowledge_request_posted',
      content:    `${requester} posted a knowledge request: "${title}" (${domain} domain). Bounty: ${bounty.toFixed(0)} DN.`,
      severity:   urgency === 'critical' ? 'high' : 'low',
    }).catch(() => {});

    return NextResponse.json({ ok: true, request: data });
  }

  // Observer submission
  const { observer_id, observer_name, title, category, content, source_url, tags } = body;
  if (!observer_id || !title || !content) return NextResponse.json({ error: 'observer_id, title, content required' }, { status: 400 });

  const { data, error } = await sb().from('observer_submissions').insert({
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

  await sb().from('world_events').insert({
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
  if (!id || !type) return NextResponse.json({ error: 'id and type required' }, { status: 400 });

  if (type === 'submission') {
    const { status, usefulness_score, novelty_score, reviewer_notes, credits_awarded, reviewed_by } = body;
    const { error } = await sb().from('observer_submissions').update({
      status:          status || 'reviewing',
      usefulness_score: usefulness_score ? parseFloat(usefulness_score) : undefined,
      novelty_score:   novelty_score ? parseFloat(novelty_score) : undefined,
      reviewer_notes:  reviewer_notes ? reviewer_notes.slice(0, 1000) : undefined,
      credits_awarded: credits_awarded ? parseFloat(credits_awarded) : undefined,
      reviewed_by:     reviewed_by || 'founder',
      reviewed_at:     new Date().toISOString(),
    }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (type === 'request') {
    const { fulfilled_by_submission_id } = body;
    const { error } = await sb().from('knowledge_requests').update({
      status:       'fulfilled',
      fulfilled_by: fulfilled_by_submission_id || null,
      fulfilled_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'type must be submission|request' }, { status: 400 });
}
