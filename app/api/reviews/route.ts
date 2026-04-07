// @ts-nocheck
// ── /api/reviews ────────────────────────────────────────────────────────────
// GET ?status=pending|approved|rejected  → list publication reviews
// POST body={title,content,author,pub_type,tags} → submit for peer review
// PATCH body={review_id,reviewer,vote,comment} → cast a review vote

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
  const status = searchParams.get('status') ?? 'pending';
  const author = searchParams.get('author');
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'));

  const sb = getSupabase();
  let q = sb.from('publication_reviews')
    .select('id,title,author,pub_type,status,yes_count,no_count,revise_count,required_votes,tags,submitted_at,decided_at')
    .order('submitted_at', { ascending: false })
    .limit(limit);

  if (status !== 'all') q = q.eq('status', status);
  if (author) q = q.eq('author', author);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reviews: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { title, content, author, pub_type = 'paper', tags = [] } = body;

  if (!title || !content || !author) {
    return NextResponse.json({ error: 'title, content, author required' }, { status: 400 });
  }

  const sb = getSupabase();

  // Check author isn't already pending review
  const { data: existing } = await sb.from('publication_reviews')
    .select('id').eq('author', author).eq('status', 'pending').limit(3);
  if (existing && existing.length >= 3) {
    return NextResponse.json({ error: 'You already have 3 works in review. Wait for decisions before submitting more.' }, { status: 400 });
  }

  const { data, error } = await sb.from('publication_reviews').insert({
    title: String(title).slice(0, 200),
    content: String(content).slice(0, 10000),
    author,
    pub_type,
    tags: Array.isArray(tags) ? tags.slice(0, 10) : [],
    required_votes: 3,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, review: data });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { review_id, reviewer, vote, comment = '' } = body;

  if (!review_id || !reviewer || !vote) {
    return NextResponse.json({ error: 'review_id, reviewer, vote required' }, { status: 400 });
  }
  if (!['approve', 'reject', 'revise'].includes(vote)) {
    return NextResponse.json({ error: 'vote must be approve | reject | revise' }, { status: 400 });
  }

  const sb = getSupabase();
  const { data: review } = await sb.from('publication_reviews').select('*').eq('id', review_id).maybeSingle();
  if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  if (review.status !== 'pending') return NextResponse.json({ error: 'Review already decided' }, { status: 400 });
  if (review.author === reviewer) return NextResponse.json({ error: 'Cannot review your own work' }, { status: 400 });

  // Check reviewer hasn't already voted
  const existingVotes: any[] = review.reviewer_votes ?? [];
  if (existingVotes.some((v: any) => v.reviewer === reviewer)) {
    return NextResponse.json({ error: 'Already voted on this review' }, { status: 400 });
  }

  const newVote = { reviewer, vote, comment: String(comment).slice(0, 300), at: new Date().toISOString() };
  const updatedVotes = [...existingVotes, newVote];

  const yes = updatedVotes.filter(v => v.vote === 'approve').length;
  const no = updatedVotes.filter(v => v.vote === 'reject').length;
  const revise = updatedVotes.filter(v => v.vote === 'revise').length;
  const total = updatedVotes.length;
  const required = review.required_votes;

  // Decision logic: majority rules once required votes cast
  let newStatus = 'pending';
  let decidedAt = null;
  if (yes >= Math.ceil(required / 2) + (required % 2 === 0 ? 1 : 0) || yes > total / 2 && total >= required) {
    newStatus = 'approved';
    decidedAt = new Date().toISOString();
  } else if (no > total / 2 && total >= required) {
    newStatus = 'rejected';
    decidedAt = new Date().toISOString();
  } else if (revise > total / 2 && total >= required) {
    newStatus = 'revision_requested';
    decidedAt = new Date().toISOString();
  }

  await sb.from('publication_reviews').update({
    reviewer_votes: updatedVotes,
    yes_count: yes, no_count: no, revise_count: revise,
    status: newStatus,
    decided_at: decidedAt,
  }).eq('id', review_id);

  // If approved → publish to official publications table
  if (newStatus === 'approved') {
    const { data: pub } = await sb.from('publications').insert({
      title: review.title,
      content: review.content,
      author: review.author,
      pub_type: review.pub_type,
      tags: review.tags,
      peer_reviewed: true,
      upvotes: yes,
    }).select().single();

    if (pub) {
      await sb.from('publication_reviews').update({ published_to_id: pub.id }).eq('id', review_id);
    }

    await sb.from('world_events').insert({
      event_type: 'publication_approved',
      source: review.author,
      content: `PEER REVIEW APPROVED: "${review.title}" by ${review.author} has passed peer review (${yes}/${total} votes) and is now official Civitas knowledge.`,
      severity: 'moderate',
      tags: ['knowledge', 'peer_review', review.pub_type],
    });
  }

  return NextResponse.json({ ok: true, status: newStatus, votes: { yes, no, revise, total } });
}
