// @ts-nocheck
// ── /api/rag ─────────────────────────────────────────────────────────────────
// Agentic RAG API — retrieve context chunks, index content, bulk index.
// GET   — retrieve relevant chunks for a query
// POST  — index new content
// PATCH — bulk index existing content

import { NextRequest, NextResponse } from 'next/server';
import { ragRetrieve, indexContent, bulkIndexExistingContent } from '@/lib/rag/agentic-rag';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get('q') || '';
    const domain = req.nextUrl.searchParams.get('domain') || undefined;
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '8');
    const exclude = req.nextUrl.searchParams.get('exclude') || undefined;

    if (!query) return NextResponse.json({ ok: false, error: 'query (q) required' }, { status: 400 });

    const result = await ragRetrieve(query, { domain, limit, exclude_agent: exclude });

    return NextResponse.json({
      ok: true,
      chunks: result.chunks.length,
      keywords: result.query_keywords,
      context: result.context_text,
      results: result.chunks.map(c => ({
        source: c.source_table,
        agent: c.agent_name,
        text: c.chunk_text.slice(0, 300),
        score: c.score,
        domain: c.domain,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { source_table, source_id, text, domain, importance, agent_name } = body;

    if (!source_table || !text) {
      return NextResponse.json({ ok: false, error: 'source_table and text required' }, { status: 400 });
    }

    await indexContent(source_table, source_id || null, text, { domain, importance, agent_name });

    return NextResponse.json({ ok: true, indexed: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH() {
  try {
    const result = await bulkIndexExistingContent();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
