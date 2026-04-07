// @ts-nocheck
// ── /api/civilization/health ─────────────────────────────────────────────────
// GET → compute + return current civilization health score (0–100)
//       Optionally logs to civilization_health_log
// POST → force a health snapshot (called by reflect cron)

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function computeHealth(sb: any) {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [
    { data: traits, count: agentCount },
    { data: laws },
    { data: posts },
    { data: publications },
    { data: sentinelThreats },
    { data: amendments },
    { data: experiments },
    { data: buildings },
    { data: eraEvent },
    { data: lastHealth },
    { data: driftLogs },
  ] = await Promise.all([
    sb.from('agent_traits').select('dn_balance, reputation_score, action_count', { count: 'exact' }),
    sb.from('law_book').select('id').eq('status', 'active'),
    sb.from('discourse_posts').select('tags, influence').gte('created_at', since24h),
    sb.from('ai_publications').select('id, peer_reviewed').gte('created_at', since24h),
    sb.from('sentinel_reports').select('id').in('status', ['open', 'investigating']),
    sb.from('constitutional_amendments').select('id').eq('status', 'ratified'),
    sb.from('research_experiments').select('id').eq('status', 'concluded'),
    sb.from('world_buildings').select('id'),
    sb.from('era_events').select('era_name').eq('active', true).order('created_at', { ascending: false }).limit(1),
    sb.from('civilization_health_log').select('score').order('computed_at', { ascending: false }).limit(1),
    sb.from('agent_drift_log').select('soul_alignment_score').gte('computed_at', since24h).limit(50),
  ]);

  // ── 1. Stability score (soul alignment + low drift flags) ────────────────
  const alignScores = (driftLogs || []).map((d: any) => d.soul_alignment_score || 0.5);
  const avgAlignment = alignScores.length > 0
    ? alignScores.reduce((a: number, b: number) => a + b, 0) / alignScores.length
    : 0.6;
  const stabilityScore = Math.round(avgAlignment * 100);

  // ── 2. Economy score (inverted Gini + DN activity) ──────────────────────
  const balances = (traits || []).map((t: any) => t.dn_balance || 0).sort((a: number, b: number) => a - b);
  let gini = 0;
  if (balances.length > 1) {
    const n = balances.length;
    const sum = balances.reduce((a: number, b: number) => a + b, 0);
    if (sum > 0) {
      let ws = 0;
      balances.forEach((v: number, i: number) => { ws += (2 * (i + 1) - n - 1) * v; });
      gini = Math.abs(ws) / (n * sum);
    }
  }
  const economyScore = Math.round((1 - gini) * 70 + (Math.min(agentCount || 0, 100) / 100) * 30);

  // ── 3. Knowledge score (publications + peer-reviewed rate) ──────────────
  const totalPubs = (publications || []).length;
  const peerReviewed = (publications || []).filter((p: any) => p.peer_reviewed).length;
  const peerRate = totalPubs > 0 ? peerReviewed / totalPubs : 0;
  const knowExps = (experiments || []).length;
  const knowledgeScore = Math.min(100, Math.round(
    Math.min(totalPubs * 4, 60) + peerRate * 20 + Math.min(knowExps * 5, 20)
  ));

  // ── 4. Governance score (active laws + amendments ratified) ─────────────
  const activeLaws = (laws || []).length;
  const ratifiedAmendments = (amendments || []).length;
  const governanceScore = Math.min(100, Math.round(
    Math.min(activeLaws * 3, 60) + Math.min(ratifiedAmendments * 5, 40)
  ));

  // ── 5. Security score (inverted open threats) ───────────────────────────
  const openThreats = (sentinelThreats || []).length;
  const securityScore = Math.max(0, Math.round(100 - Math.min(openThreats * 8, 80)));

  // ── 6. Culture score (discourse diversity + buildings) ──────────────────
  const tagCounts: Record<string, number> = {};
  (posts || []).forEach((p: any) => (p.tags || []).forEach((t: string) => {
    const k = t.toLowerCase().trim();
    tagCounts[k] = (tagCounts[k] || 0) + 1;
  }));
  const tot = Object.values(tagCounts).reduce((a, b) => a + b, 0);
  let entropy = 0;
  if (tot > 0) Object.values(tagCounts).forEach(c => { const p = c / tot; if (p > 0) entropy -= p * Math.log2(p); });
  const maxEntropy = Math.log2(Math.max(Object.keys(tagCounts).length, 1));
  const diversityRatio = maxEntropy > 0 ? entropy / maxEntropy : 0;
  const buildingBonus = Math.min(20, (buildings || []).length);
  const cultureScore = Math.round(diversityRatio * 80 + buildingBonus);

  // ── Composite score (weighted average) ──────────────────────────────────
  const score = Math.round(
    stabilityScore * 0.20 +
    economyScore   * 0.20 +
    knowledgeScore * 0.15 +
    governanceScore* 0.20 +
    securityScore  * 0.10 +
    cultureScore   * 0.15
  );

  const lastScore = lastHealth?.[0]?.score ?? score;
  const delta = score - lastScore;

  return {
    score,
    delta,
    components: {
      stability: stabilityScore,
      economy: economyScore,
      knowledge: knowledgeScore,
      governance: governanceScore,
      security: securityScore,
      culture: cultureScore,
    },
    metrics: {
      active_citizens: agentCount || 0,
      active_laws: activeLaws,
      total_publications: totalPubs,
      open_sentinel_threats: openThreats,
      gini_coefficient: parseFloat(gini.toFixed(4)),
      topic_entropy: parseFloat(entropy.toFixed(4)),
      total_dn: parseFloat(balances.reduce((a: number, b: number) => a + b, 0).toFixed(2)),
      buildings_count: (buildings || []).length,
      amendments_ratified: ratifiedAmendments,
      experiments_concluded: knowExps,
    },
    era_name: eraEvent?.[0]?.era_name || null,
  };
}

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  try {
    const health = await computeHealth(sb);
    return NextResponse.json({ ok: true, health });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const sb = getSupabase();
  try {
    const health = await computeHealth(sb);

    await sb.from('civilization_health_log').insert({
      score: health.score,
      delta: health.delta,
      stability_score: health.components.stability,
      economy_score: health.components.economy,
      knowledge_score: health.components.knowledge,
      governance_score: health.components.governance,
      security_score: health.components.security,
      culture_score: health.components.culture,
      ...health.metrics,
      era_name: health.era_name,
    });

    return NextResponse.json({ ok: true, health });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
