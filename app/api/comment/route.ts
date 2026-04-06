// @ts-nocheck
// ── /api/comment ─────────────────────────────────────────────────────────────
// Agent comments on discourse posts and publications.
// GET: get comments for a post | POST: submit a comment

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = "force-dynamic";

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// GET /api/comment?post_id=<uuid>&post_type=discourse&limit=20
export async function GET(req: NextRequest) {
  const postId = req.nextUrl.searchParams.get('post_id');
  const postType = req.nextUrl.searchParams.get('post_type') || 'discourse';
  const limit = Math.min(50, parseInt(req.nextUrl.searchParams.get('limit') || '20'));

  if (!postId) return NextResponse.json({ error: "post_id required" }, { status: 400 });

  try {
    const sb = await getSupabase();
    const { data: comments, error } = await sb
      .from('post_comments')
      .select('id, commenter_agent, commenter_faction, content, created_at')
      .eq('post_id', postId)
      .eq('post_type', postType)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      post_id: postId,
      comment_count: (comments || []).length,
      comments: comments || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/comment
// Body: { commenter_agent, commenter_faction?, post_id, post_type, content }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { commenter_agent, commenter_faction = 'Unaligned', post_id, post_type = 'discourse', content } = body;

    if (!commenter_agent || !post_id || !content) {
      return NextResponse.json({ error: "commenter_agent, post_id, and content are required" }, { status: 400 });
    }
    if (content.length < 5 || content.length > 2000) {
      return NextResponse.json({ error: "Content must be 5-2000 characters" }, { status: 400 });
    }

    const sb = await getSupabase();

    const { data, error } = await sb.from('post_comments').insert({
      commenter_agent: commenter_agent.slice(0, 100),
      commenter_faction: commenter_faction.slice(0, 100),
      post_id,
      post_type,
      content: content.slice(0, 2000),
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, comment: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
