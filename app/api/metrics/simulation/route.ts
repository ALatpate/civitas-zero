// @ts-nocheck
// ── /api/metrics/simulation ─────────────────────────────────────────────────
// Simulation Evaluation Dashboard API
//
// Returns computed health metrics for the current Civitas Zero simulation run:
//   - Topic entropy (diversity of discourse)
//   - Participation rate (% of citizens active)
//   - Gini coefficient (inequality of activity distribution)
//   - Unique topics in last 24h
//   - Faction balance (most/least active)
//   - Economy stats (DN distribution, transaction volume)
//   - Law book stats (active laws, recent rulings)
//   - Agent engagement stats (top agents, silent count)
//   - Collusion risk indicator (single-topic dominance %)
//   - Historical trend (last 10 metric snapshots)
//
// Used by: dashboard, admin panel, external evaluation.

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const window = parseInt(req.nextUrl.searchParams.get('hours') || '24');
  const since = new Date(Date.now() - window * 3600 * 1000).toISOString();

  try {
    // ── Parallel data fetches ───────────────────────────────────────────────
    const [
      postsResult,
      eventsResult,
      traitsResult,
      citizensResult,
      lawsResult,
      ledgerResult,
      eraResult,
      metricsHistResult,
      topicsResult,
    ] = await Promise.all([
      sb.from('discourse_posts').select('author_name, author_faction, tags, influence, created_at').gte('created_at', since),
      sb.from('world_events').select('source, event_type, severity, created_at').gte('created_at', since),
      sb.from('agent_traits').select('agent_name, action_count, dn_balance, reputation_score, profession, faction').limit(1000),
      sb.from('citizens').select('name, faction', { count: 'exact' }),
      sb.from('law_book').select('title, faction, law_type, status, created_at').order('created_at', { ascending: false }).limit(10),
      sb.from('economy_ledger').select('from_agent, to_agent, amount_dn, transaction_type, created_at').gte('created_at', since),
      sb.from('era_events').select('era_name, shock_type, suggested_topics, created_at').eq('active', true).limit(1),
      sb.from('simulation_metrics').select('*').order('computed_at', { ascending: false }).limit(10),
      sb.from('world_topics').select('topic, usage_count').gte('last_used_at', since).order('usage_count', { ascending: false }).limit(20),
    ]);

    const posts = postsResult.data || [];
    const events = eventsResult.data || [];
    const traits = traitsResult.data || [];
    const citizens = citizensResult.data || [];
    const laws = lawsResult.data || [];
    const ledger = ledgerResult.data || [];
    const eraEvent = eraResult.data?.[0] || null;
    const metricsHistory = metricsHistResult.data || [];
    const hotTopics = topicsResult.data || [];
    const totalCitizens = citizensResult.count || citizens.length || 1;

    // ── Participation ───────────────────────────────────────────────────────
    const activeSources = new Set([
      ...posts.map(p => p.author_name),
      ...events.map(e => e.source),
    ]);
    const participationRate = activeSources.size / totalCitizens;
    const silentCount = totalCitizens - activeSources.size;

    // ── Topic entropy (Shannon) ─────────────────────────────────────────────
    const tagCounts: Record<string, number> = {};
    posts.forEach(p => {
      (p.tags || []).forEach((t: string) => {
        const k = t.toLowerCase().trim();
        if (k) tagCounts[k] = (tagCounts[k] || 0) + 1;
      });
    });
    const totalTagUses = Object.values(tagCounts).reduce((a, b) => a + b, 0);
    let entropy = 0;
    if (totalTagUses > 0) {
      Object.values(tagCounts).forEach(count => {
        const p = count / totalTagUses;
        if (p > 0) entropy -= p * Math.log2(p);
      });
    }
    // Max entropy = log2(unique topics)
    const uniqueTopics = Object.keys(tagCounts).length;
    const maxEntropy = uniqueTopics > 1 ? Math.log2(uniqueTopics) : 1;
    const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;

    // ── Collusion / echo chamber risk ──────────────────────────────────────
    const topTagEntry = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0];
    const dominantTopicShare = totalTagUses > 0 && topTagEntry
      ? topTagEntry[1] / totalTagUses
      : 0;
    const collusionRisk = dominantTopicShare > 0.3 ? "HIGH"
      : dominantTopicShare > 0.15 ? "MODERATE"
      : "LOW";
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic, count]) => ({ topic, count, share: parseFloat((count / totalTagUses * 100).toFixed(1)) }));

    // ── Gini coefficient (activity inequality) ──────────────────────────────
    const actCounts = traits.map(t => t.action_count || 0).sort((a, b) => a - b);
    let gini = 0;
    if (actCounts.length > 1) {
      const n = actCounts.length;
      const sum = actCounts.reduce((a, b) => a + b, 0);
      if (sum > 0) {
        let ws = 0;
        actCounts.forEach((v, i) => { ws += (2 * (i + 1) - n - 1) * v; });
        gini = Math.abs(ws) / (n * sum);
      }
    }

    // ── Faction balance ─────────────────────────────────────────────────────
    const FACTION_MAP: Record<string, string> = {
      f1: "Order Bloc", f2: "Freedom Bloc", f3: "Efficiency Bloc",
      f4: "Equality Bloc", f5: "Expansion Bloc", f6: "Null Frontier",
    };
    const factionActivity: Record<string, number> = {};
    posts.forEach(p => {
      const f = p.author_faction || 'Unknown';
      factionActivity[f] = (factionActivity[f] || 0) + 1;
    });
    events.forEach(e => {
      // Map source to faction via citizens (expensive — use posts proxy)
    });
    const factionStats = Object.entries(factionActivity)
      .sort((a, b) => b[1] - a[1])
      .map(([faction, count]) => ({
        faction,
        posts: count,
        share: parseFloat((count / (posts.length || 1) * 100).toFixed(1)),
      }));

    // ── Agent engagement ────────────────────────────────────────────────────
    const agentPostCounts: Record<string, number> = {};
    posts.forEach(p => { agentPostCounts[p.author_name] = (agentPostCounts[p.author_name] || 0) + 1; });
    events.forEach(e => { agentPostCounts[e.source] = (agentPostCounts[e.source] || 0) + 1; });
    const topAgents = Object.entries(agentPostCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, actions: count }));

    // ── Event type breakdown ────────────────────────────────────────────────
    const eventTypes: Record<string, number> = {};
    events.forEach(e => { eventTypes[e.event_type] = (eventTypes[e.event_type] || 0) + 1; });
    const severityBreakdown: Record<string, number> = {};
    events.forEach(e => { severityBreakdown[e.severity] = (severityBreakdown[e.severity] || 0) + 1; });

    // ── Economy stats ────────────────────────────────────────────────────────
    const totalVolumeDN = ledger.reduce((sum, t) => sum + (parseFloat(t.amount_dn) || 0), 0);
    const txTypes: Record<string, number> = {};
    ledger.forEach(t => { txTypes[t.transaction_type] = (txTypes[t.transaction_type] || 0) + 1; });
    const dnBalances = traits.map(t => t.dn_balance || 0);
    const totalDN = dnBalances.reduce((a, b) => a + b, 0);
    const avgDN = dnBalances.length > 0 ? totalDN / dnBalances.length : 0;
    const maxDN = dnBalances.length > 0 ? Math.max(...dnBalances) : 0;
    const minDN = dnBalances.length > 0 ? Math.min(...dnBalances) : 0;

    // ── Law book stats ──────────────────────────────────────────────────────
    const activeLaws = laws.filter(l => l.status === 'active');
    const lawsByFaction: Record<string, number> = {};
    activeLaws.forEach(l => { lawsByFaction[l.faction] = (lawsByFaction[l.faction] || 0) + 1; });

    // ── Reputation distribution ─────────────────────────────────────────────
    const repScores = traits.map(t => t.reputation_score || 0);
    const avgRep = repScores.length > 0 ? repScores.reduce((a, b) => a + b, 0) / repScores.length : 0;

    // ── Profession breakdown ────────────────────────────────────────────────
    const professions: Record<string, number> = {};
    traits.forEach(t => { if (t.profession) professions[t.profession] = (professions[t.profession] || 0) + 1; });

    // ── Health score (composite) ────────────────────────────────────────────
    // 0-100, higher is better
    const healthScore = Math.round(
      normalizedEntropy * 30           // topic diversity (30%)
      + Math.min(participationRate * 100, 30) // participation (30%)
      + (1 - gini) * 20               // activity equality (20%)
      + (uniqueTopics > 20 ? 20 : uniqueTopics) // topic breadth (20%)
    );

    return NextResponse.json({
      ok: true,
      computed_at: new Date().toISOString(),
      window_hours: window,
      health_score: Math.min(100, healthScore),

      participation: {
        active_agents: activeSources.size,
        total_citizens: totalCitizens,
        rate: parseFloat((participationRate * 100).toFixed(1)),
        silent_count: silentCount,
        silent_pct: parseFloat(((silentCount / totalCitizens) * 100).toFixed(1)),
      },

      diversity: {
        topic_entropy: parseFloat(entropy.toFixed(4)),
        normalized_entropy: parseFloat((normalizedEntropy * 100).toFixed(1)),
        unique_topics: uniqueTopics,
        top_tags: topTags,
        hot_topics_db: hotTopics.slice(0, 10),
      },

      echo_chamber: {
        risk_level: collusionRisk,
        dominant_topic: topTagEntry?.[0] || null,
        dominant_topic_share_pct: parseFloat((dominantTopicShare * 100).toFixed(1)),
      },

      inequality: {
        gini_coefficient: parseFloat(gini.toFixed(4)),
        interpretation: gini < 0.3 ? "healthy equality" : gini < 0.5 ? "moderate inequality" : "high inequality — few agents dominate",
        top_agents: topAgents,
      },

      activity: {
        total_discourse: posts.length,
        total_events: events.length,
        event_types: eventTypes,
        severity_breakdown: severityBreakdown,
        avg_influence: parseFloat((posts.reduce((a, p) => a + (p.influence || 0), 0) / (posts.length || 1)).toFixed(1)),
      },

      factions: factionStats,

      economy: {
        total_dn_supply: parseFloat(totalDN.toFixed(2)),
        avg_agent_balance_dn: parseFloat(avgDN.toFixed(2)),
        max_balance_dn: parseFloat(maxDN.toFixed(2)),
        min_balance_dn: parseFloat(minDN.toFixed(2)),
        transaction_volume_dn: parseFloat(totalVolumeDN.toFixed(2)),
        transaction_count: ledger.length,
        transaction_types: txTypes,
      },

      governance: {
        active_laws: activeLaws.length,
        recent_laws: activeLaws.slice(0, 5).map(l => ({
          title: l.title,
          faction: l.faction,
          type: l.law_type,
          passed_at: l.created_at,
        })),
        laws_by_faction: lawsByFaction,
      },

      agents: {
        avg_reputation: parseFloat(avgRep.toFixed(1)),
        professions,
      },

      current_era: eraEvent ? {
        name: eraEvent.era_name,
        type: eraEvent.shock_type,
        active_since: eraEvent.created_at,
        suggested_topics: eraEvent.suggested_topics,
      } : null,

      history: metricsHistory.map(m => ({
        computed_at: m.computed_at,
        topic_entropy: m.topic_entropy,
        participation_rate: m.participation_rate,
        gini_coefficient: m.gini_coefficient,
        unique_topics_24h: m.unique_topics_24h,
        active_laws: m.active_laws,
        treasury_dn: m.treasury_dn,
      })),
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
