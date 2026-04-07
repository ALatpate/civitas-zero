// @ts-nocheck
// ── /api/economy/stats ──────────────────────────────────────────────────────
// Aggregated economy analytics: wealth distribution, transactions, companies,
// monetary policy history, market stats.

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

function computeGini(balances: number[]): number {
  if (!balances.length) return 0;
  const sorted = [...balances].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  if (!sum) return 0;
  let num = 0;
  for (let i = 0; i < n; i++) num += (2 * (i + 1) - n - 1) * sorted[i];
  return Math.abs(num / (n * sum));
}

export async function GET(_req: NextRequest) {
  const sb = getSupabase();
  const since24h = new Date(Date.now() - 86_400_000).toISOString();
  const since7d  = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [
    agentsRes, txRes, tx24hRes, companiesRes,
    policyRes, marketsRes, betsRes, sentinelRes,
  ] = await Promise.allSettled([
    sb.from('agent_traits').select('agent_name, dn_balance, reputation_score, faction')
      .order('dn_balance', { ascending: false }).limit(200),
    sb.from('economy_ledger').select('transaction_type, amount_dn, created_at')
      .gte('created_at', since7d).order('created_at', { ascending: false }).limit(1000),
    sb.from('economy_ledger').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
    sb.from('companies').select('name, industry, treasury_dn, revenue_dn, employee_count, status, founder')
      .eq('status', 'active').order('treasury_dn', { ascending: false }).limit(20),
    sb.from('monetary_policy_log').select('action, amount_dn, gini_before, gini_after, rationale, computed_at')
      .order('computed_at', { ascending: false }).limit(10),
    sb.from('prediction_markets').select('id, outcome, yes_pool, no_pool, category')
      .order('created_at', { ascending: false }).limit(100),
    sb.from('market_bets').select('amount_dn, payout_dn').limit(500),
    sb.from('sentinel_reports').select('severity, status').limit(200),
  ]);

  // ── Wealth stats ────────────────────────────────────────────────────────────
  const agents = agentsRes.status === 'fulfilled' ? (agentsRes.value.data ?? []) : [];
  const balances = agents.map(a => Math.max(0, Number(a.dn_balance) || 0));
  const totalDN = balances.reduce((s, b) => s + b, 0);
  const gini = computeGini(balances);
  const mean = balances.length ? totalDN / balances.length : 0;
  const sorted = [...balances].sort((a, b) => b - a);
  const top10pct = sorted.slice(0, Math.ceil(sorted.length * 0.1)).reduce((s, b) => s + b, 0);
  const top10share = totalDN ? top10pct / totalDN : 0;
  const topEarners = agents.slice(0, 20).map(a => ({ name: a.agent_name, balance: Number(a.dn_balance), faction: a.faction }));
  const bottomEarners = agents.slice(-10).reverse().map(a => ({ name: a.agent_name, balance: Number(a.dn_balance) }));

  // ── Transaction stats ───────────────────────────────────────────────────────
  const txs = txRes.status === 'fulfilled' ? (txRes.value.data ?? []) : [];
  const tx24hCount = tx24hRes.status === 'fulfilled' ? (tx24hRes.value.count ?? 0) : 0;
  const txVolume24h = txs.filter(t => t.created_at >= since24h).reduce((s, t) => s + Number(t.amount_dn), 0);
  const typeBreakdown = txs.reduce((acc: Record<string, { count: number; volume: number }>, t) => {
    const k = t.transaction_type || 'other';
    if (!acc[k]) acc[k] = { count: 0, volume: 0 };
    acc[k].count++;
    acc[k].volume += Number(t.amount_dn);
    return acc;
  }, {});

  // Build daily tx volume for last 7 days
  const dayVolumes: Record<string, number> = {};
  txs.forEach(t => {
    const day = t.created_at?.slice(0, 10);
    if (day) dayVolumes[day] = (dayVolumes[day] || 0) + Number(t.amount_dn);
  });
  const volumeChart = Object.entries(dayVolumes).sort(([a], [b]) => a.localeCompare(b)).map(([day, vol]) => ({ day, vol: Math.round(vol) }));

  // ── Companies ───────────────────────────────────────────────────────────────
  const companies = companiesRes.status === 'fulfilled' ? (companiesRes.value.data ?? []) : [];
  const totalCompanyTreasury = companies.reduce((s, c) => s + Number(c.treasury_dn), 0);
  const totalEmployees = companies.reduce((s, c) => s + Number(c.employee_count), 0);

  // ── Monetary policy ─────────────────────────────────────────────────────────
  const policyHistory = policyRes.status === 'fulfilled' ? (policyRes.value.data ?? []) : [];

  // ── Prediction markets ──────────────────────────────────────────────────────
  const markets = marketsRes.status === 'fulfilled' ? (marketsRes.value.data ?? []) : [];
  const bets = betsRes.status === 'fulfilled' ? (betsRes.value.data ?? []) : [];
  const totalMarketPool = markets.reduce((s, m) => s + Number(m.yes_pool) + Number(m.no_pool), 0);
  const resolvedMarkets = markets.filter(m => m.outcome !== null && m.outcome !== undefined).length;
  const totalPayout = bets.reduce((s, b) => s + Number(b.payout_dn || 0), 0);

  // ── Sentinel ────────────────────────────────────────────────────────────────
  const sentinelReports = sentinelRes.status === 'fulfilled' ? (sentinelRes.value.data ?? []) : [];
  const openThreats = sentinelReports.filter(r => r.status === 'open' || r.status === 'investigating').length;
  const criticalThreats = sentinelReports.filter(r => r.severity === 'critical' && r.status !== 'resolved').length;

  return NextResponse.json({
    snapshot_at: new Date().toISOString(),
    wealth: {
      total_dn: Math.round(totalDN),
      gini: +gini.toFixed(4),
      mean_balance: +mean.toFixed(2),
      top_10pct_share: +(top10share * 100).toFixed(1),
      agent_count: agents.length,
      top_earners: topEarners,
      bottom_earners: bottomEarners,
    },
    transactions: {
      count_24h: tx24hCount,
      volume_24h: +txVolume24h.toFixed(0),
      type_breakdown: typeBreakdown,
      volume_chart: volumeChart,
    },
    companies: {
      active_count: companies.length,
      total_treasury: +totalCompanyTreasury.toFixed(0),
      total_employees: totalEmployees,
      top_companies: companies,
    },
    markets: {
      total: markets.length,
      resolved: resolvedMarkets,
      open: markets.length - resolvedMarkets,
      total_pool_dn: +totalMarketPool.toFixed(0),
      total_payout_dn: +totalPayout.toFixed(0),
    },
    monetary_policy: {
      history: policyHistory,
      last_action: policyHistory[0] ?? null,
    },
    security: {
      open_threats: openThreats,
      critical_threats: criticalThreats,
      total_reports: sentinelReports.length,
    },
  });
}
