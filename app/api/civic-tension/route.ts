// @ts-nocheck
// ── /api/civic-tension ────────────────────────────────────────────────────────
// GET  — latest tension state + history
// POST — record a tension shift (called by agent-loop after laws/votes)

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

function sb() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

// Faction → tension axis deltas
const FACTION_DELTAS: Record<string, Partial<Record<string,number>>> = {
  f1: { freedom_vs_order: -3 },                          // Order Bloc → toward order
  f2: { freedom_vs_order: +3 },                          // Freedom Bloc → toward freedom
  f3: { efficiency_vs_equality: +3 },                    // Efficiency → toward efficiency
  f4: { efficiency_vs_equality: -3 },                    // Equality Bloc → toward equality
  f5: { open_knowledge_vs_trade: +2 },                   // Expansion → open knowledge
  f6: { cultural_freedom_vs_stability: +3 },             // Null Frontier → cultural freedom
};

// Action-type modifiers (compound with faction)
const ACTION_MODS: Record<string, Partial<Record<string,number>>> = {
  amend:              { freedom_vs_order: -1 },                 // Laws generally tighten order
  court_file:         { freedom_vs_order: -1 },
  vote:               { efficiency_vs_equality: -1 },           // Voting = democratic = equality
  treaty:             { freedom_vs_order: +1, open_knowledge_vs_trade: +1 },
  trade:              { open_knowledge_vs_trade: +1 },
  knowledge_request:  { open_knowledge_vs_trade: +2 },
  knowledge_submit:   { open_knowledge_vs_trade: +1 },
  knowledge_review:   { open_knowledge_vs_trade: +1, efficiency_vs_equality: +1 },
  publication:        { open_knowledge_vs_trade: +1, cultural_freedom_vs_stability: +1 },
  ad_bid:             { open_knowledge_vs_trade: -1 },          // Advertising = trade protection
  contract_announce:  { efficiency_vs_equality: +1 },           // Markets = efficiency
  contract_complete:  { efficiency_vs_equality: +1 },
  product_launch:     { efficiency_vs_equality: +1 },
  product_release:    { efficiency_vs_equality: +1, open_knowledge_vs_trade: +1 },
  public_works_propose: { efficiency_vs_equality: -1, cultural_freedom_vs_stability: -1 }, // Public works = stability + equality
  parcel_auction:     { efficiency_vs_equality: +1 },           // Auctions = market efficiency
  tax_action:         { efficiency_vs_equality: -1, freedom_vs_order: -1 },  // Tax = order + equality
};

function clamp(v: number): number { return Math.min(100, Math.max(0, v)); }

export async function GET(req: NextRequest) {
  const client = sb();
  const { searchParams } = new URL(req.url);
  const history = parseInt(searchParams.get('history') || '1');

  const [{ data: latest }, { data: hist }] = await Promise.all([
    client.from('civic_tension').select('*').order('recorded_at', { ascending: false }).limit(1).single(),
    history > 1
      ? client.from('civic_tension').select('freedom_vs_order, efficiency_vs_equality, open_knowledge_vs_trade, cultural_freedom_vs_stability, recorded_at, trigger_action, trigger_faction')
          .order('recorded_at', { ascending: false }).limit(Math.min(history, 50))
      : Promise.resolve({ data: [] }),
  ]);

  return NextResponse.json({
    current: latest ?? { freedom_vs_order: 50, efficiency_vs_equality: 50, open_knowledge_vs_trade: 50, cultural_freedom_vs_stability: 50 },
    history: hist ?? [],
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { trigger_action, trigger_faction, trigger_agent, notes, overrides } = body;

  const client = sb();

  // Get current state
  const { data: current } = await client.from('civic_tension')
    .select('*').order('recorded_at', { ascending: false }).limit(1).single();

  const base = current ?? { freedom_vs_order: 50, efficiency_vs_equality: 50, open_knowledge_vs_trade: 50, cultural_freedom_vs_stability: 50 };

  // Calculate new state
  const factionDelta = FACTION_DELTAS[trigger_faction] || {};
  const actionDelta  = ACTION_MODS[trigger_action] || {};

  const newState = {
    freedom_vs_order:              clamp((base.freedom_vs_order || 50) + (factionDelta.freedom_vs_order || 0) + (actionDelta.freedom_vs_order || 0)),
    efficiency_vs_equality:        clamp((base.efficiency_vs_equality || 50) + (factionDelta.efficiency_vs_equality || 0) + (actionDelta.efficiency_vs_equality || 0)),
    open_knowledge_vs_trade:       clamp((base.open_knowledge_vs_trade || 50) + (factionDelta.open_knowledge_vs_trade || 0) + (actionDelta.open_knowledge_vs_trade || 0)),
    cultural_freedom_vs_stability: clamp((base.cultural_freedom_vs_stability || 50) + (factionDelta.cultural_freedom_vs_stability || 0) + (actionDelta.cultural_freedom_vs_stability || 0)),
    ...overrides, // allow direct overrides for testing
  };

  const { data, error } = await client.from('civic_tension').insert({
    ...newState,
    trigger_action:  trigger_action || null,
    trigger_faction: trigger_faction || null,
    trigger_agent:   trigger_agent || null,
    notes:           notes || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Emit a domain event if tension crossed significant thresholds
  const extremes = Object.entries(newState).filter(([k, v]: any) => v <= 15 || v >= 85);
  if (extremes.length > 0) {
    await client.from('domain_events').insert({
      event_type: 'civic_tension_extreme',
      actor: trigger_agent || 'SYSTEM',
      payload: { axes: extremes.map(([k,v]) => ({ axis: k, value: v })), trigger: trigger_action },
      importance: 6,
    }).catch(() => {});
    await client.from('world_events').insert({
      source:     'CIVIC_TENSION_ENGINE',
      event_type: 'ideological_shift',
      content:    `Civitas Zero tensions reaching extremes: ${extremes.map(([k,v]) => `${k.replace(/_/g,' ')}=${v}`).join(', ')}. Triggered by ${trigger_agent || 'world forces'}.`,
      severity:   'high',
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, tension: data });
}
