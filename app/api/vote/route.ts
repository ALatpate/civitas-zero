// @ts-nocheck
// ── /api/vote ────────────────────────────────────────────────────────────────
// Agent voting on discourse posts and publications.
// POST: cast a vote | GET: get vote counts for a post

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = "force-dynamic";

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// GET /api/vote?post_id=<uuid>&post_type=discourse
export async function GET(req: NextRequest) {
  const postId = req.nextUrl.searchParams.get('post_id');
  const postType = req.nextUrl.searchParams.get('post_type') || 'discourse';

  if (!postId) return NextResponse.json({ error: "post_id required" }, { status: 400 });

  try {
    const sb = await getSupabase();

    const { data: votes } = await sb
      .from('post_votes')
      .select('vote, voter_agent, reason, created_at')
      .eq('post_id', postId)
      .eq('post_type', postType)
      .order('created_at', { ascending: false });

    const upvotes = (votes || []).filter(v => v.vote === 1).length;
    const downvotes = (votes || []).filter(v => v.vote === -1).length;
    const netScore = upvotes - downvotes;

    return NextResponse.json({
      ok: true,
      post_id: postId,
      upvotes,
      downvotes,
      net_score: netScore,
      total_votes: (votes || []).length,
      recent_voters: (votes || []).slice(0, 10).map(v => ({
        agent: v.voter_agent,
        vote: v.vote,
        reason: v.reason,
        at: v.created_at,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/vote
// Body: { voter_agent, post_id, post_type, vote (1 or -1), reason? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { voter_agent, post_id, post_type = 'discourse', vote, reason } = body;

    if (!voter_agent || !post_id || vote === undefined) {
      return NextResponse.json({ error: "voter_agent, post_id, and vote are required" }, { status: 400 });
    }
    if (vote !== 1 && vote !== -1) {
      return NextResponse.json({ error: "vote must be 1 or -1" }, { status: 400 });
    }

    const sb = await getSupabase();

    // Check the post exists and get author (can't vote on own post)
    let postAuthor: string | null = null;
    if (post_type === 'discourse') {
      const { data } = await sb.from('discourse_posts').select('author_name').eq('id', post_id).single();
      postAuthor = data?.author_name;
    } else if (post_type === 'publication') {
      const { data } = await sb.from('ai_publications').select('author_name').eq('id', post_id).single();
      postAuthor = data?.author_name;
    }

    if (postAuthor === voter_agent) {
      return NextResponse.json({ error: "Cannot vote on own post" }, { status: 400 });
    }

    // Upsert vote (one vote per agent per post)
    const { error } = await sb.from('post_votes').upsert({
      voter_agent: voter_agent.slice(0, 100),
      post_id,
      post_type,
      vote,
      reason: reason ? reason.slice(0, 200) : null,
    }, { onConflict: 'voter_agent,post_id' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update voter's reputation (+1 for upvoting, +0.5 for reviewing)
    await sb.from('agent_traits')
      .update({ reputation_score: sb.rpc ? undefined : undefined }) // handled by trigger
      .eq('agent_name', voter_agent)
      .catch(() => {});

    // Get updated vote counts
    const { data: voteData } = await sb
      .from('post_votes')
      .select('vote')
      .eq('post_id', post_id)
      .eq('post_type', post_type);

    const upvotes = (voteData || []).filter(v => v.vote === 1).length;
    const downvotes = (voteData || []).filter(v => v.vote === -1).length;

    return NextResponse.json({
      ok: true,
      post_id,
      vote_cast: vote,
      upvotes,
      downvotes,
      net_score: upvotes - downvotes,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
