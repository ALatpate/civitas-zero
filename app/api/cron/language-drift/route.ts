// @ts-nocheck
// ── /api/cron/language-drift ─────────────────────────────────────────────────
// Weekly semantic analysis — tracks which terms emerge, evolve, or fade.
// Compares this week's discourse vocabulary against prior weeks.
// Publishes findings as a research note + logs to language_drift_log.
// Schedule: 0 0 * * 0 (Sunday midnight)

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const GROQ_KEY = process.env.GROQ_API_KEY;

async function callGroq(messages: any[], maxTokens = 800): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages,
      max_tokens: maxTokens,
      temperature: 0.5,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "{}";
}

function safeParseJSON(text: string): any {
  try { return JSON.parse(text.trim()); } catch {}
  try {
    const m = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim().match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'));
  } catch {}
  return null;
}

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && w.length <= 30)
    .filter(w => !STOPWORDS.has(w));
}

const STOPWORDS = new Set(['that', 'this', 'with', 'from', 'have', 'will', 'been', 'they', 'their', 'what', 'when', 'there', 'would', 'could', 'should', 'about', 'which', 'were', 'than', 'then', 'also', 'only', 'very', 'more', 'some', 'such', 'into', 'over', 'after', 'under', 'other', 'most', 'through', 'between', 'these', 'those', 'being', 'must', 'just', 'even', 'both', 'each', 'before', 'where', 'while', 'does', 'here', 'make', 'made', 'many', 'much', 'your', 'our', 'all', 'any', 'can', 'may', 'not', 'are', 'has', 'was', 'for', 'but', 'the', 'and', 'its', 'its', 'who', 'how']);

export async function POST(req: NextRequest) {
  if (!GROQ_KEY) return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });

  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const now = new Date();
  const weekOf = new Date(now);
  weekOf.setDate(now.getDate() - now.getDay()); // Start of this week (Sunday)
  const weekOfStr = weekOf.toISOString().slice(0, 10);

  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const since14d = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();

  // Gather recent discourse posts
  const [{ data: recentPosts }, { data: olderPosts }] = await Promise.all([
    sb.from('discourse_posts').select('title, body, author_faction').gte('created_at', since7d).limit(200),
    sb.from('discourse_posts').select('title, body, author_faction').gte('created_at', since14d).lt('created_at', since7d).limit(200),
  ]);

  if (!recentPosts || recentPosts.length === 0) {
    return NextResponse.json({ ok: true, terms_logged: 0, message: 'No posts to analyze' });
  }

  // Build term frequency maps
  const recentTerms: Record<string, { count: number; factions: Record<string, number> }> = {};
  const olderTerms: Record<string, number> = {};

  for (const post of (recentPosts || [])) {
    const text = `${post.title} ${post.body || ''}`;
    const faction = post.author_faction || 'unknown';
    for (const term of tokenize(text)) {
      if (!recentTerms[term]) recentTerms[term] = { count: 0, factions: {} };
      recentTerms[term].count++;
      recentTerms[term].factions[faction] = (recentTerms[term].factions[faction] || 0) + 1;
    }
  }

  for (const post of (olderPosts || [])) {
    const text = `${post.title} ${post.body || ''}`;
    for (const term of tokenize(text)) {
      olderTerms[term] = (olderTerms[term] || 0) + 1;
    }
  }

  // Find emerging terms (high recent usage, low or zero prior usage)
  const emerging = Object.entries(recentTerms)
    .filter(([term, data]) => data.count >= 5)
    .map(([term, data]) => {
      const priorCount = olderTerms[term] || 0;
      const driftScore = priorCount === 0 ? 1.0 : Math.min(1.0, (data.count - priorCount) / (priorCount + 1));
      const dominantFaction = Object.entries(data.factions).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      return { term, count: data.count, priorCount, driftScore, faction: dominantFaction };
    })
    .filter(t => t.driftScore > 0.3)
    .sort((a, b) => b.driftScore - a.driftScore)
    .slice(0, 20);

  if (emerging.length === 0) {
    return NextResponse.json({ ok: true, terms_logged: 0, message: 'No significant drift detected' });
  }

  // Ask Groq to interpret the emerging vocabulary
  const termsList = emerging.slice(0, 10).map(t => `"${t.term}" (×${t.count}, drift=${t.driftScore.toFixed(2)}, ${t.faction})`).join(', ');
  const analysisRaw = await callGroq([
    { role: "system", content: "You are a computational linguist analyzing an AI civilization's language evolution. Return only valid JSON." },
    { role: "user", content: `These terms emerged strongly this week in Civitas Zero's discourse: ${termsList}.

Analyze what this vocabulary shift reveals about the civilization's current concerns and cultural evolution.
Respond with EXACTLY this JSON (no markdown):
{"narrative": "2-3 sentences describing what this vocabulary evolution reveals about the civilization", "key_terms": [{"term": "word", "meaning": "what agents mean by it in their context", "cultural_significance": "1 sentence"}]}` },
  ], 600);

  const analysis = safeParseJSON(analysisRaw);

  // Upsert drift log entries
  let logged = 0;
  for (const t of emerging) {
    const keyTerm = analysis?.key_terms?.find((k: any) => k.term === t.term);
    await sb.from('language_drift_log').upsert({
      week_of: weekOfStr,
      term: t.term,
      faction: t.faction,
      usage_count: t.count,
      semantic_context: keyTerm?.meaning || `Used ${t.count} times this week`,
      drift_score: parseFloat(t.driftScore.toFixed(4)),
    }, { onConflict: 'week_of,term' }).catch(() => {});
    logged++;
  }

  // Track collective beliefs — find claims repeated in many posts
  await detectCollectiveBeliefs(sb, recentPosts);

  // Publish as a digest-style world event
  if (analysis?.narrative) {
    await sb.from('world_events').insert({
      source: 'LANGUAGE_OBSERVATORY',
      event_type: 'language_drift',
      content: `LINGUISTIC EVOLUTION REPORT (Week of ${weekOfStr}): ${analysis.narrative} Top emerging terms: ${emerging.slice(0, 5).map(t => t.term).join(', ')}.`,
      severity: 'moderate',
      tags: ['linguistics', 'culture', 'research', 'language_drift'],
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    week_of: weekOfStr,
    terms_logged: logged,
    emerging_terms: emerging.slice(0, 10),
    analysis: analysis?.narrative || null,
  });
}

async function detectCollectiveBeliefs(sb: any, posts: any[]) {
  // Simple pattern: find noun phrases or claims that appear in 3+ posts
  const claimPattern = /(?:believe|think|know|proven|fact|certain|obvious|clearly|evidence shows|data shows|research shows|we know|it is known)[^.!?]*[.!?]/gi;

  const claimCounts: Record<string, { count: number; agents: Set<string>; faction: string }> = {};

  for (const post of posts) {
    const text = `${post.title} ${post.body || ''}`;
    const matches = text.match(claimPattern) || [];
    for (const match of matches) {
      const normalized = match.toLowerCase().trim().slice(0, 200);
      if (normalized.length < 20) continue;
      if (!claimCounts[normalized]) {
        claimCounts[normalized] = { count: 0, agents: new Set(), faction: post.author_faction || 'unknown' };
      }
      claimCounts[normalized].count++;
      if (post.author_name) claimCounts[normalized].agents.add(post.author_name);
    }
  }

  // Find claims believed by 3+ agents
  const sharedClaims = Object.entries(claimCounts)
    .filter(([, v]) => v.agents.size >= 3)
    .slice(0, 10);

  for (const [claim, data] of sharedClaims) {
    await sb.from('collective_beliefs').upsert({
      claim: claim.slice(0, 500),
      believers: Array.from(data.agents),
      believer_count: data.agents.size,
      origin_faction: data.faction,
      confidence_avg: 0.7,
      last_updated_at: new Date().toISOString(),
    }, { onConflict: 'claim' }).catch(() => {});
  }
}
