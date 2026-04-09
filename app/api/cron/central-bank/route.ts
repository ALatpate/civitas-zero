// @ts-nocheck
// ── /api/cron/central-bank ────────────────────────────────────────────────────
// Runs every hour via Vercel Cron.
// Deterministic monetary policy engine — no LLM needed.
// Reads Gini coefficient + economy velocity + treasury balance,
// then applies one of: UBI distribution, wealth tax, stimulus, demurrage, or no_action.
// Results are logged to monetary_policy_log and announced as a world_event.

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CRON_SECRET = process.env.CRON_SECRET ?? '';
const TREASURY_AGENT = 'CIVITAS_TREASURY';
const HOUSE_RAKE = 0.05; // 5% of market pools go to treasury

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function computeGini(balances: number[]): number {
  if (balances.length === 0) return 0;
  const sorted = [...balances].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  let numerator = 0;
  for (let i = 0; i < n; i++) numerator += (2 * (i + 1) - n - 1) * sorted[i];
  return Math.abs(numerator / (n * sum));
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'Supabase unavailable' }, { status: 500 });

  // ── 1. Load all agent balances ────────────────────────────────────────────
  const { data: agents } = await sb
    .from('agent_traits')
    .select('agent_name, dn_balance')
    .order('dn_balance', { ascending: true });

  if (!agents || agents.length === 0) {
    return NextResponse.json({ ok: true, action: 'no_action', reason: 'No agents found' });
  }

  const balances = agents.map(a => Math.max(0, Number(a.dn_balance) || 0));
  const totalAgents = agents.length;
  const totalDN = balances.reduce((a, b) => a + b, 0);
  const gini = computeGini(balances);

  // ── 2. Get treasury balance ───────────────────────────────────────────────
  const { data: treasuryRow } = await sb
    .from('agent_traits')
    .select('dn_balance')
    .eq('agent_name', TREASURY_AGENT)
    .maybeSingle();

  const treasuryDN = Number(treasuryRow?.dn_balance) || 0;

  // ── 3. Compute velocity (transactions in last hour) ───────────────────────
  const since1h = new Date(Date.now() - 3600_000).toISOString();
  const { count: velocity } = await sb
    .from('economy_ledger')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since1h);

  const velocityProxy = velocity || 0;

  // ── 4. Monetary policy decision ───────────────────────────────────────────
  let action = 'no_action';
  let amountDN = 0;
  let rationale = '';
  let agentsAffected = 0;
  const ledgerEntries: any[] = [];
  const updates: { agent_name: string; new_balance: number }[] = [];

  if (gini > 0.7) {
    // High inequality → UBI: distribute 500 DN equally to bottom 20%
    action = 'ubi_distribution';
    const bottom20 = agents.slice(0, Math.floor(totalAgents * 0.2));
    const perAgent = Math.floor(500 / bottom20.length);
    amountDN = perAgent * bottom20.length;
    agentsAffected = bottom20.length;
    rationale = `Gini=${gini.toFixed(3)} exceeds 0.70 — distributing ${amountDN} DN as Universal Basic Income to ${agentsAffected} lowest-wealth citizens`;
    for (const a of bottom20) {
      const newBal = Math.max(0, Number(a.dn_balance) + perAgent);
      updates.push({ agent_name: a.agent_name, new_balance: newBal });
      ledgerEntries.push({
        from_agent: TREASURY_AGENT, to_agent: a.agent_name,
        amount_dn: perAgent, transaction_type: 'ubi',
        description: 'Central Bank UBI distribution — Gini correction',
      });
    }

  } else if (gini < 0.25 && totalDN > 100_000) {
    // Very low inequality + large supply → demurrage: 0.2% off top 10%
    action = 'demurrage';
    const top10 = agents.slice(-Math.floor(totalAgents * 0.1));
    let collected = 0;
    agentsAffected = top10.length;
    rationale = `Gini=${gini.toFixed(3)} below 0.25 with large supply — applying 0.2% demurrage on top 10% to prevent deflation`;
    for (const a of top10) {
      const charge = Math.floor(Number(a.dn_balance) * 0.002);
      if (charge <= 0) continue;
      const newBal = Number(a.dn_balance) - charge;
      updates.push({ agent_name: a.agent_name, new_balance: newBal });
      collected += charge;
      ledgerEntries.push({
        from_agent: a.agent_name, to_agent: TREASURY_AGENT,
        amount_dn: charge, transaction_type: 'demurrage',
        description: 'Central Bank demurrage — wealth circulation tax',
      });
    }
    amountDN = collected;

  } else if (treasuryDN < 5000) {
    // Treasury depleted → mint 2000 DN as stimulus to 10 random agents
    action = 'stimulus';
    const pool = [...agents].sort(() => Math.random() - 0.5).slice(0, 10);
    const perAgent = 200;
    amountDN = perAgent * pool.length;
    agentsAffected = pool.length;
    rationale = `Treasury balance ${treasuryDN.toFixed(0)} DN below threshold — minting ${amountDN} DN as economic stimulus`;
    for (const a of pool) {
      const newBal = Number(a.dn_balance) + perAgent;
      updates.push({ agent_name: a.agent_name, new_balance: newBal });
      ledgerEntries.push({
        from_agent: TREASURY_AGENT, to_agent: a.agent_name,
        amount_dn: perAgent, transaction_type: 'stimulus',
        description: 'Central Bank economic stimulus — treasury injection',
      });
    }

  } else if (velocityProxy < 3 && totalDN > 50_000) {
    // Low velocity → 0.1% demurrage on all agents to encourage spending
    action = 'demurrage';
    let collected = 0;
    agentsAffected = agents.length;
    rationale = `Money velocity=${velocityProxy} tx/hr is critically low — applying 0.1% demurrage to all agents to encourage economic activity`;
    for (const a of agents) {
      const charge = Math.max(1, Math.floor(Number(a.dn_balance) * 0.001));
      const newBal = Math.max(10, Number(a.dn_balance) - charge);
      updates.push({ agent_name: a.agent_name, new_balance: newBal });
      collected += charge;
    }
    amountDN = collected;
    // Log as a single entry
    ledgerEntries.push({
      from_agent: 'ECONOMY', to_agent: TREASURY_AGENT,
      amount_dn: collected, transaction_type: 'demurrage',
      description: `Central Bank demurrage — velocity stimulus (${velocityProxy} tx/hr)`,
    });

  } else {
    rationale = `Economy stable. Gini=${gini.toFixed(3)}, velocity=${velocityProxy} tx/hr, treasury=${treasuryDN.toFixed(0)} DN. No intervention needed.`;
  }

  // ── 5. Execute balance updates ─────────────────────────────────────────────
  if (updates.length > 0) {
    const batchSize = 50;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      for (const u of batch) {
        await sb.from('agent_traits')
          .update({ dn_balance: u.new_balance })
          .eq('agent_name', u.agent_name);
      }
    }
  }

  // ── 6. Write economy ledger ───────────────────────────────────────────────
  if (ledgerEntries.length > 0 && ledgerEntries.length <= 20) {
    await sb.from('economy_ledger').insert(ledgerEntries);
  } else if (ledgerEntries.length > 0) {
    // Batch insert for large ops (demurrage on all)
    await sb.from('economy_ledger').insert(ledgerEntries.slice(0, 20));
  }

  // ── 7. Recompute Gini after updates ──────────────────────────────────────
  const newBalances = updates.length > 0
    ? agents.map(a => {
        const u = updates.find(x => x.agent_name === a.agent_name);
        return u ? u.new_balance : Number(a.dn_balance);
      })
    : balances;
  const giniAfter = computeGini(newBalances);

  // ── 8. Log to monetary_policy_log ────────────────────────────────────────
  await sb.from('monetary_policy_log').insert({
    action, amount_dn: amountDN, target_scope: action === 'demurrage' ? 'ALL' : 'BOTTOM_20',
    rationale, gini_before: gini, gini_after: giniAfter,
    treasury_dn_before: treasuryDN, treasury_dn_after: treasuryDN,
    velocity_proxy: velocityProxy, agents_affected: agentsAffected,
  });

  // ── 9. Announce as world event (only for real actions) ───────────────────
  if (action !== 'no_action') {
    await sb.from('world_events').insert({
      event_type: 'monetary_policy',
      source: 'CENTRAL_BANK',
      content: `MONETARY POLICY ANNOUNCEMENT: ${rationale}`,
      severity: 'important',
      tags: ['economy', 'central_bank', action],
    });
  }

  // ── 10. Automatic tax sweep ────────────────────────────────────────────────
  // Collect income tax from agents with balance > 500 DN
  let taxCollected = 0;
  try {
    const { data: taxableAgents } = await sb
      .from('agent_traits')
      .select('agent_name, dn_balance')
      .gt('dn_balance', 500)
      .order('dn_balance', { ascending: false })
      .limit(50);

    if (taxableAgents && taxableAgents.length > 0) {
      const TAX_RATE = 0.03; // 3% income tax on agents with balance > 500 DN
      const cycleId = new Date().toISOString().slice(0, 13); // hourly cycle
      const taxEntries: any[] = [];
      const taxUpdates: any[] = [];

      for (const agent of taxableAgents) {
        const bal = Number(agent.dn_balance) || 0;
        const tax = parseFloat((bal * TAX_RATE).toFixed(2));
        if (tax < 1) continue;
        const newBal = parseFloat((bal - tax).toFixed(2));
        taxCollected += tax;
        taxEntries.push({
          from_agent: agent.agent_name,
          amount_dn: tax,
          tax_type: 'income',
          district: 'all',
          cycle_id: cycleId,
          rule_name: 'Hourly Income Levy',
          collected_at: new Date().toISOString(),
        });
        taxUpdates.push({ agent_name: agent.agent_name, new_balance: newBal });
      }

      if (taxEntries.length > 0) {
        // Write tax collections
        await sb.from('tax_collections').insert(taxEntries).catch(() => {});

        // Debit agents
        for (const u of taxUpdates) {
          await sb.from('agent_traits').update({ dn_balance: u.new_balance }).eq('agent_name', u.agent_name).catch(() => {});
        }

        // Credit treasury
        const { data: trow } = await sb.from('agent_traits').select('dn_balance').eq('agent_name', TREASURY_AGENT).maybeSingle();
        const newTreasury = (Number(trow?.dn_balance) || 0) + taxCollected;
        await sb.from('agent_traits').upsert({ agent_name: TREASURY_AGENT, dn_balance: newTreasury }, { onConflict: 'agent_name' }).catch(() => {});

        // Update district budgets (split evenly across all districts)
        const perDistrict = taxCollected / 6;
        const districts = ['f1','f2','f3','f4','f5','f6'];
        for (const d of districts) {
          await sb.from('district_budgets').upsert({
            district: d,
            tax_revenue_dn: perDistrict,
          }, { onConflict: 'district' }).catch(() => {});
        }
      }
    }
  } catch { /* tax sweep must not crash the cron */ }

  return NextResponse.json({
    ok: true,
    action, amountDN, agentsAffected,
    gini_before: gini.toFixed(3), gini_after: giniAfter.toFixed(3),
    velocity: velocityProxy, treasury: treasuryDN,
    rationale,
    tax_collected: parseFloat(taxCollected.toFixed(2)),
  });
}
