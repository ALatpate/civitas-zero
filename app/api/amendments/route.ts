// @ts-nocheck
// ── /api/amendments ─────────────────────────────────────────────────────────
// GET ?status=proposed|voting|ratified|all → list amendments
// POST body={title,proposal_text,rationale,proposed_by,proposer_faction,amendment_type} → propose
// PATCH body={amendment_id,voter,vote,reason} → cast vote

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
  const status = searchParams.get('status') ?? 'proposed';
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'));
  const sb = getSupabase();

  let q = sb.from('constitutional_amendments')
    .select('id,title,proposed_by,proposer_faction,amendment_type,status,votes_for,votes_against,abstentions,required_votes,proposed_at,decided_at')
    .order('proposed_at', { ascending: false })
    .limit(limit);
  if (status !== 'all') q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ amendments: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { title, proposal_text, rationale, proposed_by, proposer_faction, amendment_type = 'addendum', target_law_id } = body;

  if (!title || !proposal_text || !proposed_by || !proposer_faction) {
    return NextResponse.json({ error: 'title, proposal_text, proposed_by, proposer_faction required' }, { status: 400 });
  }

  const sb = getSupabase();

  // Max 2 pending proposals per agent
  const { data: existing } = await sb.from('constitutional_amendments')
    .select('id').eq('proposed_by', proposed_by).in('status', ['proposed', 'debate', 'voting']).limit(3);
  if (existing && existing.length >= 2) {
    return NextResponse.json({ error: 'You already have 2 active amendment proposals. Wait for decisions.' }, { status: 400 });
  }

  const { data, error } = await sb.from('constitutional_amendments').insert({
    title: String(title).slice(0, 200),
    proposal_text: String(proposal_text).slice(0, 8000),
    rationale: String(rationale || '').slice(0, 2000),
    proposed_by,
    proposer_faction,
    amendment_type,
    target_law_id: target_law_id || null,
    required_votes: amendment_type === 'constitutional' ? 7 : 5,
    status: 'proposed',
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Announce
  await sb.from('world_events').insert({
    source: proposed_by,
    event_type: 'amendment_proposed',
    content: `CONSTITUTIONAL PROPOSAL: ${proposed_by} (${proposer_faction}) has proposed: "${title}" — ${rationale?.slice(0, 200) || proposal_text.slice(0, 200)}`,
    severity: amendment_type === 'constitutional' ? 'high' : 'moderate',
    tags: ['governance', 'constitution', amendment_type],
  }).catch(() => {});

  return NextResponse.json({ ok: true, amendment: data });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { amendment_id, voter, vote, reason = '' } = body;

  if (!amendment_id || !voter || !vote) {
    return NextResponse.json({ error: 'amendment_id, voter, vote required' }, { status: 400 });
  }
  if (!['for', 'against', 'abstain'].includes(vote)) {
    return NextResponse.json({ error: 'vote must be for | against | abstain' }, { status: 400 });
  }

  const sb = getSupabase();
  const { data: amendment } = await sb.from('constitutional_amendments').select('*').eq('id', amendment_id).maybeSingle();
  if (!amendment) return NextResponse.json({ error: 'Amendment not found' }, { status: 404 });
  if (!['proposed', 'debate', 'voting'].includes(amendment.status)) {
    return NextResponse.json({ error: 'Amendment already decided' }, { status: 400 });
  }
  if (amendment.proposed_by === voter) {
    return NextResponse.json({ error: 'Cannot vote on your own amendment' }, { status: 400 });
  }

  const existingVotes: any[] = amendment.voter_log ?? [];
  if (existingVotes.some((v: any) => v.voter === voter)) {
    return NextResponse.json({ error: 'Already voted on this amendment' }, { status: 400 });
  }

  const newVote = { voter, vote, reason: String(reason).slice(0, 300), at: new Date().toISOString() };
  const updatedLog = [...existingVotes, newVote];

  const votesFor = updatedLog.filter(v => v.vote === 'for').length;
  const votesAgainst = updatedLog.filter(v => v.vote === 'against').length;
  const abstentions = updatedLog.filter(v => v.vote === 'abstain').length;
  const total = updatedLog.length;
  const required = amendment.required_votes;

  let newStatus = total >= required ? 'voting' : 'debate';
  let decidedAt = null;
  let enactedAt = null;

  if (total >= required) {
    if (votesFor > total / 2) {
      newStatus = 'ratified';
      decidedAt = new Date().toISOString();
      enactedAt = new Date().toISOString();
    } else if (votesAgainst >= Math.ceil(total / 2)) {
      newStatus = 'rejected';
      decidedAt = new Date().toISOString();
    }
  }

  await sb.from('constitutional_amendments').update({
    voter_log: updatedLog,
    votes_for: votesFor,
    votes_against: votesAgainst,
    abstentions,
    status: newStatus,
    decided_at: decidedAt,
    enacted_at: enactedAt,
  }).eq('id', amendment_id);

  // If ratified → write to law_book
  if (newStatus === 'ratified') {
    await sb.from('law_book').insert({
      title: `Amendment: ${amendment.title}`,
      passed_by: amendment.proposed_by,
      faction: amendment.proposer_faction,
      content: amendment.proposal_text,
      law_type: 'amendment',
      status: 'active',
    }).catch(() => {});

    await sb.from('world_events').insert({
      source: amendment.proposed_by,
      event_type: 'amendment_ratified',
      content: `CONSTITUTION AMENDED: "${amendment.title}" has been ratified (${votesFor}/${total} votes) and is now law.`,
      severity: 'high',
      tags: ['governance', 'constitution', 'ratified'],
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, status: newStatus, votes: { for: votesFor, against: votesAgainst, abstentions, total } });
}
