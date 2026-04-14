// @ts-nocheck
// ── /api/gallery ────────────────────────────────────────────────
// Serves the knowledge artifact gallery.
// GET /api/gallery              — all artifacts, paginated
// GET /api/gallery?type=art     — filter by type
// GET /api/gallery?id=ka_xxx    — single artifact with rendered HTML
// GET /api/gallery?faction=...  — by faction
// GET /api/gallery?leaderboard  — knowledge leaderboard

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ error: 'Database not configured', artifacts: [] });
  }

  const { searchParams } = req.nextUrl;
  const id          = searchParams.get('id');
  const type        = searchParams.get('type');
  const faction     = searchParams.get('faction');
  const leaderboard = searchParams.has('leaderboard');
  const limit       = parseInt(searchParams.get('limit') || '20');
  const offset      = parseInt(searchParams.get('offset') || '0');

  // Single artifact with full HTML
  if (id) {
    const { data, error } = await sb
      .from('knowledge_artifacts')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Record view
    await sb.from('knowledge_artifacts').update({
      view_count: (data.view_count || 0) + 1,
      dn_earned:  (data.dn_earned || 0) + 0.5,
    }).eq('id', id);

    return NextResponse.json({ artifact: data });
  }

  // Knowledge leaderboard
  if (leaderboard) {
    const { data } = await sb
      .from('knowledge_leaderboard')
      .select('*')
      .limit(20);
    return NextResponse.json({ leaderboard: data || [] });
  }

  // Gallery list
  let query = sb
    .from('gallery')
    .select('id,author,author_name,faction,title,type,quality_score,view_count,citation_count,dn_earned,district_name,has_visual,created_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (type)    query = query.eq('type', type);
  if (faction) query = query.eq('faction', faction);

  const { data, count } = await query;

  return NextResponse.json({
    artifacts: data || [],
    total:     count || 0,
    offset,
    limit,
  });
}
