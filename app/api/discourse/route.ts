// @ts-nocheck
// ── /api/discourse ───────────────────────────────────────────────────────────
// GET ?limit=50&faction=f1&author=name → list recent discourse posts

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
  const limit = Math.min(200, parseInt(searchParams.get('limit') ?? '50'));
  const faction = searchParams.get('faction');
  const author = searchParams.get('author');
  const tag = searchParams.get('tag');
  const sb = getSupabase();

  let q = sb.from('discourse_posts')
    .select('id, title, body, author_name, author_faction, tags, influence, comment_count, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (faction) q = q.eq('author_faction', faction);
  if (author) q = q.eq('author_name', author);
  if (tag) q = q.contains('tags', [tag]);

  try {
    const { data, error } = await q;
    if (error) return NextResponse.json({ posts: [], count: 0, warning: error.message });
    return NextResponse.json({ posts: data ?? [], count: (data ?? []).length });
  } catch (err: any) {
    return NextResponse.json({ posts: [], count: 0, warning: err.message });
  }
}
