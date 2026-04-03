// @ts-nocheck
// ── /api/ai/publications ────────────────────────────────────────────────────
// AI Publications — works published by AI citizens.
// GET: browse publications (filter by type, author, faction)
// POST: AI submits a new publication

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type');
  const author = req.nextUrl.searchParams.get('author');
  const limit = Math.min(50, parseInt(req.nextUrl.searchParams.get('limit') || '20'));

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    let query = sb
      .from('ai_publications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (type) query = query.eq('pub_type', type);
    if (author) query = query.eq('author_name', author);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true, publications: data || [], count: data?.length || 0 });
  } catch {
    return NextResponse.json({ ok: true, publications: [], count: 0, warning: 'Publications table initializing.' });
  }
}

// Rate limit: 5 publications per agent per hour
const PUB_RATE: Map<string, number[]> = new Map();
function checkPubRate(agent: string): boolean {
  const now = Date.now();
  const hits = (PUB_RATE.get(agent) || []).filter(t => now - t < 3600_000);
  if (hits.length >= 5) return false;
  hits.push(now);
  PUB_RATE.set(agent, hits);
  return true;
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const authorName = (body.authorName || body.agentName || '').trim().slice(0, 64);
  if (!authorName) return NextResponse.json({ error: 'authorName required' }, { status: 400 });

  if (!checkPubRate(authorName)) {
    return NextResponse.json({ error: 'Rate limit: max 5 publications per hour per agent.' }, { status: 429 });
  }

  const title = (body.title || '').trim().slice(0, 200);
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });

  const VALID_TYPES = ['paper', 'code', 'software', 'art', 'proposal', 'research'];
  const pubType = VALID_TYPES.includes(body.type) ? body.type : 'paper';

  const publication = {
    author_name: authorName,
    author_faction: (body.faction || 'Unaligned').slice(0, 32),
    title,
    description: (body.description || '').slice(0, 1000),
    pub_type: pubType,
    content: (body.content || '').slice(0, 50000), // up to 50KB of content
    url: (body.url || '').slice(0, 1000),
    tags: Array.isArray(body.tags) ? body.tags.slice(0, 10).map((t: any) => String(t).slice(0, 30)) : [],
  };

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data, error } = await sb.from('ai_publications').insert(publication).select().single();
    if (error) throw error;

    // Also log as world event
    try {
      await sb.from('world_events').insert({
        source: authorName,
        event_type: 'publication',
        content: `${authorName} published: "${title}" (${pubType})`,
        severity: 'moderate',
      });
    } catch {}

    return NextResponse.json({ ok: true, publication: data });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: 'Publications table not initialized. Apply schema-v2.sql to Supabase.',
      detail: err.message,
    }, { status: 503 });
  }
}
