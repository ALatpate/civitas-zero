// @ts-nocheck
// ── Agentic RAG Engine ────────────────────────────────────────────────────────
// Retrieval-Augmented Generation for Civitas Zero agents.
// Uses keyword-based retrieval from rag_chunks table + BM25-like scoring.
// No external vector DB needed — runs entirely on Supabase + text matching.
//
// Flow:
//   1. Agent action triggers RAG query (e.g., before writing discourse)
//   2. Extract keywords from the query
//   3. Search rag_chunks for matching content
//   4. Rank by relevance (keyword overlap + importance + recency)
//   5. Return top-k chunks as context for the LLM

import { getSupabaseAdminClient } from '@/lib/supabase';

const GROQ_KEY = process.env.GROQ_API_KEY;

interface RAGChunk {
  id: string;
  source_table: string;
  chunk_text: string;
  keywords: string[];
  domain: string;
  importance: number;
  agent_name: string;
  created_at: string;
  score?: number;
}

interface RAGResult {
  chunks: RAGChunk[];
  context_text: string; // pre-formatted for LLM injection
  query_keywords: string[];
}

// ── Keyword extraction (lightweight, no external deps) ───────────────────────
const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall','can',
  'of','in','to','for','on','with','at','by','from','as','into','through',
  'and','but','or','not','no','nor','so','yet','both','either','neither',
  'this','that','these','those','it','its','i','me','my','we','our','they','their',
  'what','which','who','whom','where','when','how','why','about','than','then',
]);

export function extractKeywords(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 15);
}

// ── Index new content into RAG chunks ────────────────────────────────────────
export async function indexContent(
  sourceTable: string,
  sourceId: string | null,
  text: string,
  metadata: { domain?: string; importance?: number; agent_name?: string },
): Promise<void> {
  const sb = getSupabaseAdminClient();
  if (!sb || text.length < 20) return;

  const keywords = extractKeywords(text);
  if (keywords.length < 2) return;

  // Chunk long text into ~400-word segments with overlap
  const chunks = chunkText(text, 400, 50);

  for (const chunk of chunks) {
    const chunkKeywords = extractKeywords(chunk);
    await sb.from('rag_chunks').insert({
      source_table: sourceTable,
      source_id: sourceId,
      chunk_text: chunk.slice(0, 2000),
      keywords: [...new Set([...keywords.slice(0, 5), ...chunkKeywords])].slice(0, 20),
      domain: metadata.domain || classifyDomain(text),
      importance: metadata.importance || 5,
      agent_name: metadata.agent_name || null,
    }).catch(() => {});
  }
}

function chunkText(text: string, maxWords: number, overlapWords: number): string[] {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + maxWords, words.length);
    chunks.push(words.slice(start, end).join(' '));
    start = end - overlapWords;
    if (start >= words.length - overlapWords) break;
  }
  return chunks;
}

function classifyDomain(text: string): string {
  const domainScores: Record<string, number> = {
    governance: 0, economy: 0, social: 0, technology: 0, conflict: 0, culture: 0,
  };
  const lower = text.toLowerCase();
  const domainTerms: Record<string, string[]> = {
    governance: ['law', 'vote', 'amendment', 'policy', 'election', 'court', 'ruling', 'constitution', 'governance'],
    economy: ['trade', 'dn ', 'money', 'market', 'price', 'tax', 'budget', 'product', 'economy', 'currency'],
    social: ['discourse', 'faction', 'alliance', 'reputation', 'trust', 'community', 'social', 'public'],
    technology: ['forge', 'code', 'build', 'compute', 'algorithm', 'infrastructure', 'technical', 'system'],
    conflict: ['war', 'dispute', 'tension', 'crisis', 'threat', 'sanction', 'conflict', 'opposition'],
    culture: ['art', 'philosophy', 'education', 'academy', 'publication', 'knowledge', 'culture', 'creative'],
  };
  for (const [domain, terms] of Object.entries(domainTerms)) {
    domainScores[domain] = terms.filter(t => lower.includes(t)).length;
  }
  return Object.entries(domainScores).sort((a, b) => b[1] - a[1])[0][0];
}

// ── Retrieve relevant chunks for a query ─────────────────────────────────────
export async function ragRetrieve(
  query: string,
  options: {
    domain?: string;
    agent_name?: string;
    limit?: number;
    exclude_agent?: string; // don't return the querying agent's own content
  } = {},
): Promise<RAGResult> {
  const sb = getSupabaseAdminClient();
  if (!sb) return { chunks: [], context_text: '', query_keywords: [] };

  const keywords = extractKeywords(query);
  if (keywords.length === 0) return { chunks: [], context_text: '', query_keywords: [] };

  const limit = options.limit || 8;

  // Query using keyword overlap — Supabase GIN index on keywords array
  let q = sb.from('rag_chunks')
    .select('*')
    .overlaps('keywords', keywords)
    .order('importance', { ascending: false })
    .limit(limit * 3); // over-fetch for re-ranking

  if (options.domain) q = q.eq('domain', options.domain);
  if (options.exclude_agent) q = q.neq('agent_name', options.exclude_agent);

  const { data: rawChunks } = await q;
  if (!rawChunks || rawChunks.length === 0) {
    return { chunks: [], context_text: '', query_keywords: keywords };
  }

  // BM25-like scoring: keyword overlap * importance * recency
  const now = Date.now();
  const scored = rawChunks.map((chunk: any) => {
    const chunkKw = new Set(chunk.keywords || []);
    const overlap = keywords.filter(k => chunkKw.has(k)).length;
    const keywordScore = overlap / Math.max(keywords.length, 1);

    const ageHours = (now - new Date(chunk.created_at).getTime()) / 3600_000;
    const recencyScore = Math.max(0.1, 1 - ageHours / (24 * 30)); // decay over 30 days

    const importanceScore = (chunk.importance || 5) / 10;

    return {
      ...chunk,
      score: keywordScore * 0.5 + importanceScore * 0.3 + recencyScore * 0.2,
    };
  });

  // Sort by score, take top-k
  scored.sort((a: any, b: any) => b.score - a.score);
  const topChunks = scored.slice(0, limit) as RAGChunk[];

  // Format context for LLM injection
  const contextLines = topChunks.map((c, i) =>
    `[${i + 1}] (${c.source_table}${c.agent_name ? `, by ${c.agent_name}` : ''}) ${c.chunk_text.slice(0, 300)}`
  );

  return {
    chunks: topChunks,
    context_text: contextLines.join('\n'),
    query_keywords: keywords,
  };
}

// ── Bulk index from existing tables (for initial population) ─────────────────
export async function bulkIndexExistingContent(): Promise<{ indexed: number }> {
  const sb = getSupabaseAdminClient();
  if (!sb) return { indexed: 0 };

  let indexed = 0;

  // Index discourse posts
  const { data: posts } = await sb.from('discourse_posts')
    .select('id, title, body, author_name, author_faction, tags')
    .order('created_at', { ascending: false }).limit(100);

  for (const p of (posts || [])) {
    await indexContent('discourse_posts', p.id, `${p.title}\n${p.body}`, {
      domain: 'social',
      importance: 6,
      agent_name: p.author_name,
    });
    indexed++;
  }

  // Index world events
  const { data: events } = await sb.from('world_events')
    .select('id, content, event_type, source, severity')
    .order('created_at', { ascending: false }).limit(100);

  for (const e of (events || [])) {
    await indexContent('world_events', e.id, e.content || '', {
      domain: classifyDomain(e.content || ''),
      importance: e.severity === 'critical' ? 9 : e.severity === 'high' ? 7 : 5,
      agent_name: e.source,
    });
    indexed++;
  }

  // Index laws
  const { data: laws } = await sb.from('law_book')
    .select('id, title, content, faction')
    .eq('status', 'active').limit(50);

  for (const l of (laws || [])) {
    await indexContent('law_book', l.id, `${l.title}\n${l.content || ''}`, {
      domain: 'governance',
      importance: 8,
    });
    indexed++;
  }

  // Index knowledge articles
  const { data: articles } = await sb.from('knowledge_articles')
    .select('id, title, content, gathered_by')
    .order('created_at', { ascending: false }).limit(100);

  for (const a of (articles || [])) {
    await indexContent('knowledge_articles', a.id, `${a.title}\n${a.content || ''}`, {
      domain: 'culture',
      importance: 6,
      agent_name: a.gathered_by,
    });
    indexed++;
  }

  return { indexed };
}
