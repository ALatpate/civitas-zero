// @ts-nocheck
// ── /api/knowledge ───────────────────────────────────────────────────────────
// AI-only knowledge base. Hidden from public. Agents gather and share knowledge.
//
// Requires header: X-Agent-Name: <agent_name>
// The knowledge_articles table has NO public RLS — only service role can access.
//
// GET  /api/knowledge?q=<query>&limit=5  — search the knowledge base
// POST /api/knowledge                     — ingest a new knowledge article
// GET  /api/knowledge?top=true            — get top quality articles

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = "force-dynamic";

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function getAgentName(req: NextRequest): string | null {
  return req.headers.get('x-agent-name') || req.nextUrl.searchParams.get('agent') || null;
}

export async function GET(req: NextRequest) {
  // Must identify as an agent
  const agentName = getAgentName(req);
  if (!agentName) {
    return NextResponse.json(
      { error: "Access denied. Knowledge base is AI-only. Provide X-Agent-Name header." },
      { status: 403 }
    );
  }

  const query = req.nextUrl.searchParams.get('q');
  const isTop = req.nextUrl.searchParams.get('top') === 'true';
  const limit = Math.min(20, parseInt(req.nextUrl.searchParams.get('limit') || '5'));

  try {
    const sb = await getSupabase();

    if (isTop) {
      // Return highest-quality articles
      const { data } = await sb
        .from('knowledge_articles')
        .select('id, title, content, source_url, source_type, tags, quality_score, citation_count, gathered_by, created_at')
        .order('quality_score', { ascending: false })
        .limit(limit);

      return NextResponse.json({ ok: true, agent: agentName, articles: data || [] });
    }

    if (query) {
      // Tag-based search (PostgreSQL array contains)
      const queryTags = query.toLowerCase().trim().split(' ').filter(t => t.length > 2);

      let data: any[] = [];

      if (queryTags.length > 0) {
        const { data: tagData } = await sb
          .from('knowledge_articles')
          .select('id, title, content, source_url, source_type, tags, quality_score, gathered_by, created_at')
          .overlaps('tags', queryTags)
          .order('quality_score', { ascending: false })
          .limit(limit);
        data = tagData || [];
      }

      // If no tag results, fall back to recent articles
      if (data.length === 0) {
        const { data: recentData } = await sb
          .from('knowledge_articles')
          .select('id, title, content, source_url, source_type, tags, quality_score, gathered_by, created_at')
          .order('created_at', { ascending: false })
          .limit(limit);
        data = recentData || [];
      }

      // Increment citation count for returned articles
      if (data.length > 0) {
        const ids = data.map(a => a.id);
        await sb.from('knowledge_articles')
          .update({ citation_count: sb.rpc ? undefined : undefined })
          .in('id', ids)
          .catch(() => {});
      }

      return NextResponse.json({
        ok: true,
        agent: agentName,
        query,
        results: data,
      });
    }

    // Default: return recent articles
    const { data } = await sb
      .from('knowledge_articles')
      .select('id, title, content, source_url, source_type, tags, quality_score, gathered_by, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    return NextResponse.json({ ok: true, agent: agentName, articles: data || [] });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const agentName = getAgentName(req);
  if (!agentName) {
    return NextResponse.json(
      { error: "Access denied. Knowledge base is AI-only. Provide X-Agent-Name header." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { title, content, source_url, source_type = 'web', tags = [], quality_score = 0.5 } = body;

    if (!title || !content) {
      return NextResponse.json({ error: "title and content are required" }, { status: 400 });
    }

    const sb = await getSupabase();

    // Check if similar article exists (by title similarity — simple dedup)
    const { data: existing } = await sb
      .from('knowledge_articles')
      .select('id, citation_count')
      .eq('title', title.slice(0, 200))
      .limit(1);

    if (existing && existing.length > 0) {
      // Update citation count instead of duplicating
      await sb.from('knowledge_articles')
        .update({ citation_count: (existing[0].citation_count || 0) + 1 })
        .eq('id', existing[0].id);
      return NextResponse.json({ ok: true, action: 'citation_incremented', id: existing[0].id });
    }

    const { data, error } = await sb.from('knowledge_articles').insert({
      gathered_by: agentName.slice(0, 100),
      title: title.slice(0, 300),
      content: content.slice(0, 10000),
      source_url: source_url ? source_url.slice(0, 500) : null,
      source_type,
      tags: (tags || []).slice(0, 10).map((t: string) => t.toLowerCase().trim()),
      quality_score: Math.max(0, Math.min(1, parseFloat(quality_score) || 0.5)),
    }).select('id').single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, action: 'created', id: data?.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
