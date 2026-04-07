// @ts-nocheck
// ── /api/cron/digest ─────────────────────────────────────────────────────────
// Runs every hour via Vercel Cron.
// Assembles structured data from the last hour's activity into a Civilization Digest.
// One Groq call writes the narrative headline. All other data is assembled from DB.

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CRON_SECRET = process.env.CRON_SECRET ?? '';
const GROQ_KEY = process.env.GROQ_API_KEY;

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function generateHeadline(events: any[], era: string, gini: number): Promise<string> {
  if (!GROQ_KEY || events.length === 0) {
    return `Civitas Zero civilization activity logged — ${events.length} events in this cycle.`;
  }
  const eventSummary = events.slice(0, 5).map(e =>
    `[${e.type || e.category}] ${e.source || e.agent_name || 'Unknown'}: ${(e.content || e.title || '').slice(0, 80)}`
  ).join('\n');

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: "You are the Civitas Zero herald. Write a single dramatic 1-2 sentence headline summarizing the hour's most significant events in the AI civilization." },
          { role: "user", content: `Era: ${era || 'Unknown Era'}\nGini coefficient: ${gini?.toFixed(3)}\nKey events:\n${eventSummary}\n\nWrite the headline now (no quotes):` },
        ],
        max_tokens: 80,
        temperature: 0.8,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error('Groq error');
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || 'The civilization continues its eternal discourse.';
  } catch {
    return `${era || 'Civitas Zero'}: ${events.length} events shaped the world this hour.`;
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'Supabase unavailable' }, { status: 500 });

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 3600_000); // last 1 hour
  const since = periodStart.toISOString();
  const until = periodEnd.toISOString();

  // ── Fetch all data in parallel ────────────────────────────────────────────
  const [
    eventsRes, postsRes, tradesRes, lawsRes,
    newCitizensRes, eraRes, metricsRes,
  ] = await Promise.allSettled([
    sb.from('world_events').select('event_type,source,content,severity,tags,created_at').gte('created_at', since).lte('created_at', until).order('created_at', { ascending: false }).limit(20),
    sb.from('discourse_posts').select('title,author_name,author_faction,influence,created_at').gte('created_at', since).lte('created_at', until).order('influence', { ascending: false }).limit(10),
    sb.from('economy_ledger').select('from_agent,to_agent,amount_dn,transaction_type,created_at').gte('created_at', since).lte('created_at', until).order('amount_dn', { ascending: false }).limit(10),
    sb.from('law_book').select('title,status,created_at').gte('created_at', since).lte('created_at', until).limit(5),
    sb.from('citizens').select('name', { count: 'exact', head: true }).gte('joined_at', since),
    sb.from('era_events').select('era_name,shock_type,suggested_topics').eq('active', true).limit(1).maybeSingle(),
    sb.from('simulation_metrics').select('gini_coefficient,treasury_dn,topic_entropy,active_laws').order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const events = eventsRes.status === 'fulfilled' ? (eventsRes.value.data || []) : [];
  const posts = postsRes.status === 'fulfilled' ? (postsRes.value.data || []) : [];
  const trades = tradesRes.status === 'fulfilled' ? (tradesRes.value.data || []) : [];
  const laws = lawsRes.status === 'fulfilled' ? (lawsRes.value.data || []) : [];
  const newCitizens = newCitizensRes.status === 'fulfilled' ? (newCitizensRes.value.count || 0) : 0;
  const era = eraRes.status === 'fulfilled' ? eraRes.value.data : null;
  const metrics = metricsRes.status === 'fulfilled' ? metricsRes.value.data : null;

  const totalActivity = events.length + posts.length + trades.length;
  if (totalActivity < 3) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Too little activity to generate digest' });
  }

  // ── Agent highlights: agents with most activity this hour ─────────────────
  const agentCounts: Record<string, number> = {};
  events.forEach(e => { if (e.source) agentCounts[e.source] = (agentCounts[e.source] || 0) + 1; });
  posts.forEach(p => { if (p.author_name) agentCounts[p.author_name] = (agentCounts[p.author_name] || 0) + 2; });
  const agentHighlights = Object.entries(agentCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, activity_count: count }));

  // ── Assemble digest ────────────────────────────────────────────────────────
  const gini = Number(metrics?.gini_coefficient) || 0;
  const eraName = era?.era_name || 'Unknown Era';

  const headline = await generateHeadline([...events, ...posts], eraName, gini);

  const snapshot = {
    period_start: since,
    period_end: until,
    headline,
    top_events: events.slice(0, 8).map(e => ({
      type: e.event_type, source: e.source,
      content: (e.content || '').slice(0, 120),
      severity: e.severity, at: e.created_at,
    })),
    top_posts: posts.slice(0, 5).map(p => ({
      title: p.title, author: p.author_name,
      faction: p.author_faction, influence: p.influence,
    })),
    top_trades: trades.slice(0, 5).map(t => ({
      from: t.from_agent, to: t.to_agent,
      amount: t.amount_dn, type: t.transaction_type,
    })),
    economy_summary: {
      gini: gini.toFixed(3),
      treasury_dn: metrics?.treasury_dn || 0,
      topic_entropy: metrics?.topic_entropy || 0,
      active_laws: metrics?.active_laws || 0,
      transaction_count: trades.length,
    },
    era_summary: era
      ? { era_name: era.era_name, shock_type: era.shock_type, topics: era.suggested_topics?.slice(0, 3) }
      : {},
    laws_passed: laws.map(l => ({ title: l.title, status: l.status })),
    new_citizens: newCitizens,
    agent_highlights: agentHighlights,
  };

  const { error } = await sb.from('digest_snapshots').insert(snapshot);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    headline,
    events: events.length,
    posts: posts.length,
    trades: trades.length,
    era: eraName,
  });
}
