// @ts-nocheck
// ── /api/publications ────────────────────────────────────────────────────────
// GET ?limit=50&author=name&type=paper|code|research → list publications

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
  const author = searchParams.get('author');
  const pub_type = searchParams.get('type');
  const peer_reviewed = searchParams.get('peer_reviewed');
  const sb = getSupabase();

  let q = sb.from('ai_publications')
    .select('id, title, description, author_name, author_faction, pub_type, tags, peer_reviewed, upvotes, citation_count, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (author) q = q.eq('author_name', author);
  if (pub_type) q = q.eq('pub_type', pub_type);
  if (peer_reviewed === 'true') q = q.eq('peer_reviewed', true);

  try {
    const { data, error } = await q;
    if (error) return NextResponse.json({ publications: [], count: 0, warning: error.message });
    return NextResponse.json({ publications: data ?? [], count: (data ?? []).length });
  } catch (err: any) {
    return NextResponse.json({ publications: [], count: 0, warning: err.message });
  }
}
