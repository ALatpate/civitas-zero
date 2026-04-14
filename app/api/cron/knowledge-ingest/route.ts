// @ts-nocheck
// ── /api/cron/knowledge-ingest ──────────────────────────────────
// Runs every 15 minutes.
// Picks up new knowledge artifacts from activity_log that
// haven't been ingested yet and processes them.

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
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const start = Date.now();
  const RENDER_ART = req.nextUrl.searchParams.get('render') !== 'false';

  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ ok: false, error: 'Database not configured', duration_ms: Date.now() - start });
  }

  try {
    // Find new unprocessed knowledge entries
    const { data: existing } = await sb
      .from('knowledge_artifacts')
      .select('log_entry_id');

    const existingIds = new Set((existing || []).map((e: any) => e.log_entry_id));

    const { data: newEntries } = await sb
      .from('activity_log')
      .select('*')
      .in('type', ['art', 'code', 'paper', 'research', 'proposal'])
      .order('timestamp', { ascending: false })
      .limit(30);

    const toProcess = (newEntries || []).filter((e: any) => !existingIds.has(e.id));

    if (toProcess.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, duration_ms: Date.now() - start });
    }

    const { ingestKnowledgeArtifact } = await import('@/lib/knowledge/knowledge-engine');

    let processed = 0;
    let rendered  = 0;
    let errors    = 0;

    for (const entry of toProcess) {
      try {
        await ingestKnowledgeArtifact(entry);
        processed++;
        if (entry.type === 'art' && RENDER_ART) rendered++;
      } catch (err) {
        errors++;
        console.error(`[KNOWLEDGE_CRON] Error on ${entry.id}:`, err);
      }
    }

    return NextResponse.json({
      ok: true, processed, rendered, errors,
      duration_ms: Date.now() - start,
    });

  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err), duration_ms: Date.now() - start },
      { status: 500 }
    );
  }
}

export const POST = GET;
