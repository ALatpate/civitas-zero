// @ts-nocheck
// ── /api/markets/[id] ─────────────────────────────────────────────────────────
// GET                 — market detail + all bets + implied odds
// POST /bet           — place a bet  { agent_name, position, amount_dn }
// POST /resolve       — admin resolve { outcome: true|false } (requires X-Admin-Secret)

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = "force-dynamic";

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

  const action = req.nextUrl.searchParams.get('action');

  const [marketRes, betsRes] = await Promise.allSettled([
    sb.from('prediction_markets').select('*').eq('id', params.id).single(),
    sb.from('market_bets').select('agent_name, position, amount_dn, payout_dn, created_at').eq('market_id', params.id).order('created_at', { ascending: false }),
  ]);

  const market = marketRes.status === 'fulfilled' ? marketRes.value.data : null;
  if (!market) return NextResponse.json({ error: 'Market not found' }, { status: 404 });

  const bets = betsRes.status === 'fulfilled' ? (betsRes.value.data || []) : [];
  const total = Number(market.yes_pool) + Number(market.no_pool);

  return NextResponse.json({
    market: {
      ...market,
      yes_probability: total > 0 ? Number(market.yes_pool) / total : 0.5,
      no_probability: total > 0 ? Number(market.no_pool) / total : 0.5,
      total_pool: total,
    },
    bets,
    bet_count: bets.length,
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

  const body = await req.json();
  const action = req.nextUrl.searchParams.get('action') || body.action;

  // ── RESOLVE ──────────────────────────────────────────────────────────────
  if (action === 'resolve') {
    const adminSecret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
    const provided = req.headers.get('x-admin-secret') ?? '';
    if (!adminSecret || provided !== adminSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { outcome } = body; // true or false
    if (typeof outcome !== 'boolean') {
      return NextResponse.json({ error: 'outcome must be true or false' }, { status: 400 });
    }

    const { data: market } = await sb.from('prediction_markets').select('yes_pool, no_pool').eq('id', params.id).single();
    if (!market) return NextResponse.json({ error: 'Market not found' }, { status: 404 });

    const yesPool = Number(market.yes_pool);
    const noPool = Number(market.no_pool);
    const totalPool = yesPool + noPool;
    const winnerPool = outcome ? yesPool : noPool;
    const RAKE = 0.05;

    // Fetch winning bets
    const { data: winningBets } = await sb.from('market_bets')
      .select('id, agent_name, amount_dn')
      .eq('market_id', params.id)
      .eq('position', outcome);

    const payouts: { agent: string; payout: number }[] = [];
    if (winningBets && winningBets.length > 0 && winnerPool > 0) {
      for (const bet of winningBets) {
        const share = Number(bet.amount_dn) / winnerPool;
        const payout = Math.floor(totalPool * (1 - RAKE) * share);
        payouts.push({ agent: bet.agent_name, payout });

        await sb.from('market_bets').update({ payout_dn: payout }).eq('id', bet.id);
        await sb.from('agent_traits').update({
          dn_balance: sb.rpc ? undefined : payout, // fallback below
        }).eq('agent_name', bet.agent_name);

        // Direct update since rpc may not be available
        const { data: agentRow } = await sb.from('agent_traits').select('dn_balance').eq('agent_name', bet.agent_name).single();
        if (agentRow) {
          await sb.from('agent_traits').update({ dn_balance: Number(agentRow.dn_balance) + payout }).eq('agent_name', bet.agent_name);
        }

        await sb.from('economy_ledger').insert({
          from_agent: 'PREDICTION_MARKET', to_agent: bet.agent_name,
          amount_dn: payout, transaction_type: 'market_payout',
          description: `Market resolved ${outcome ? 'YES' : 'NO'} — payout`,
        });
      }
    }

    await sb.from('prediction_markets').update({
      outcome, resolved_at: new Date().toISOString(),
    }).eq('id', params.id);

    return NextResponse.json({ ok: true, outcome, total_pool: totalPool, payouts });
  }

  // ── PLACE BET ─────────────────────────────────────────────────────────────
  const { agent_name, position, amount_dn } = body;
  if (!agent_name || typeof position !== 'boolean' || !amount_dn || amount_dn <= 0) {
    return NextResponse.json({ error: 'agent_name, position (bool), amount_dn required' }, { status: 400 });
  }

  // Check market is open
  const { data: market } = await sb.from('prediction_markets')
    .select('closes_at, resolved_at').eq('id', params.id).single();
  if (!market) return NextResponse.json({ error: 'Market not found' }, { status: 404 });
  if (market.resolved_at || new Date(market.closes_at) < new Date()) {
    return NextResponse.json({ error: 'Market is closed' }, { status: 400 });
  }

  // Check agent balance
  const { data: traits } = await sb.from('agent_traits').select('dn_balance').eq('agent_name', agent_name).single();
  if (!traits || Number(traits.dn_balance) < amount_dn) {
    return NextResponse.json({ error: 'Insufficient DN balance' }, { status: 400 });
  }

  // Place bet (upsert prevents double-betting)
  const { error: betError } = await sb.from('market_bets').insert({
    market_id: params.id, agent_name, position, amount_dn,
  });
  if (betError) return NextResponse.json({ error: betError.message }, { status: 400 });

  // Deduct from balance
  await sb.from('agent_traits').update({ dn_balance: Number(traits.dn_balance) - amount_dn }).eq('agent_name', agent_name);

  // Update pool
  const poolField = position ? 'yes_pool' : 'no_pool';
  const { data: mkt } = await sb.from('prediction_markets').select(poolField).eq('id', params.id).single();
  if (mkt) {
    await sb.from('prediction_markets').update({
      [poolField]: Number(mkt[poolField]) + amount_dn,
    }).eq('id', params.id);
  }

  await sb.from('economy_ledger').insert({
    from_agent: agent_name, to_agent: 'PREDICTION_MARKET',
    amount_dn, transaction_type: 'market_bet',
    description: `Bet ${position ? 'YES' : 'NO'} on market ${params.id}`,
  });

  return NextResponse.json({ ok: true, bet: { agent_name, position, amount_dn } });
}
