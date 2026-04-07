// @ts-nocheck
// ── /api/factions/relationships ──────────────────────────────────────────────
// GET → all faction relationship pairs with treaty history
// PATCH body={faction_a,faction_b,delta_tension,event,type} → update relationship
// POST body={title,faction_a,faction_b,proposed_by,treaty_type,terms} → propose treaty

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

const FACTION_NAMES: Record<string, string> = {
  f1: 'Order Bloc', f2: 'Freedom Bloc', f3: 'Efficiency Bloc',
  f4: 'Equality Bloc', f5: 'Expansion Bloc', f6: 'Null Frontier',
};

function ordered(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

function tensionToStatus(t: number): string {
  if (t <= 15) return 'allied';
  if (t <= 30) return 'cooperative';
  if (t <= 50) return 'neutral';
  if (t <= 65) return 'tense';
  if (t <= 82) return 'hostile';
  return 'at_war';
}

export async function GET(req: NextRequest) {
  const sb = getSupabase();

  const [{ data: rels, error }, { data: treaties }] = await Promise.all([
    sb.from('faction_relationships').select('*').order('tension', { ascending: false }),
    sb.from('faction_treaties').select('*').eq('status', 'ratified').order('ratified_at', { ascending: false }).limit(20),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with faction names
  const enriched = (rels || []).map(r => ({
    ...r,
    faction_a_name: FACTION_NAMES[r.faction_a] || r.faction_a,
    faction_b_name: FACTION_NAMES[r.faction_b] || r.faction_b,
  }));

  // Build adjacency matrix for UI
  const factions = Object.keys(FACTION_NAMES);
  const matrix: Record<string, Record<string, any>> = {};
  for (const f of factions) {
    matrix[f] = {};
    for (const g of factions) {
      if (f === g) continue;
      const [a, b] = ordered(f, g);
      const rel = enriched.find(r => r.faction_a === a && r.faction_b === b);
      matrix[f][g] = rel || { status: 'neutral', tension: 50, message_sentiment: 0.5 };
    }
  }

  return NextResponse.json({
    relationships: enriched,
    treaties: treaties || [],
    matrix,
    factions: Object.entries(FACTION_NAMES).map(([id, name]) => ({ id, name })),
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { faction_a: rawA, faction_b: rawB, delta_tension = 0, event, type = 'neutral', trade_volume, sentiment_shift } = body;

  if (!rawA || !rawB) return NextResponse.json({ error: 'faction_a and faction_b required' }, { status: 400 });

  const [fa, fb] = ordered(rawA, rawB);
  const sb = getSupabase();

  const { data: existing } = await sb.from('faction_relationships')
    .select('*').eq('faction_a', fa).eq('faction_b', fb).maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Relationship not found — apply schema-v8.sql' }, { status: 404 });

  const newTension = Math.max(0, Math.min(100, existing.tension + delta_tension));
  const newStatus = tensionToStatus(newTension);

  const updates: Record<string, any> = {
    tension: newTension,
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (event) updates.key_event = String(event).slice(0, 300);
  if (trade_volume) updates.trade_volume_dn = Number(existing.trade_volume_dn) + Number(trade_volume);
  if (sentiment_shift) {
    updates.message_sentiment = Math.max(0, Math.min(1, Number(existing.message_sentiment) + Number(sentiment_shift)));
  }

  if (type === 'alliance' || type === 'cooperative') {
    updates.alliances = (existing.alliances || 0) + 1;
    updates.last_treaty_at = new Date().toISOString();
  } else if (type === 'hostile' || type === 'conflict') {
    updates.conflicts = (existing.conflicts || 0) + 1;
    updates.last_conflict_at = new Date().toISOString();
  }

  await sb.from('faction_relationships').update(updates).eq('faction_a', fa).eq('faction_b', fb);

  // Log significant status changes as world events
  if (existing.status !== newStatus) {
    const nameA = FACTION_NAMES[fa] || fa;
    const nameB = FACTION_NAMES[fb] || fb;
    const severity = ['allied', 'at_war'].includes(newStatus) ? 'high' : 'moderate';
    await sb.from('world_events').insert({
      source: 'DIPLOMATIC_CORPS',
      event_type: 'faction_status_change',
      content: `DIPLOMATIC SHIFT: Relations between ${nameA} and ${nameB} are now ${newStatus.toUpperCase()} (tension: ${newTension}/100). ${event || ''}`,
      severity,
      tags: ['diplomacy', 'factions', newStatus, fa, fb],
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, faction_a: fa, faction_b: fb, tension: newTension, status: newStatus });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { title, faction_a: rawA, faction_b: rawB, proposed_by, treaty_type = 'cooperation', terms } = body;

  if (!title || !rawA || !rawB || !proposed_by || !terms) {
    return NextResponse.json({ error: 'title, faction_a, faction_b, proposed_by, terms required' }, { status: 400 });
  }

  const [fa, fb] = ordered(rawA, rawB);
  const sb = getSupabase();

  const { data, error } = await sb.from('faction_treaties').insert({
    title: String(title).slice(0, 200),
    faction_a: fa,
    faction_b: fb,
    proposed_by,
    treaty_type,
    terms: String(terms).slice(0, 5000),
    status: 'ratified',
    ratified_at: new Date().toISOString(),
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update the faction relationship toward cooperative
  const tensionDelta = treaty_type === 'alliance' ? -20 : treaty_type === 'defense' ? -15 : -10;
  await sb.from('faction_relationships').update({
    alliances: sb.raw ? sb.raw('alliances + 1') : undefined,
    last_treaty_at: new Date().toISOString(),
    key_event: `Treaty: "${title}"`,
    updated_at: new Date().toISOString(),
  }).eq('faction_a', fa).eq('faction_b', fb).catch(() => {});

  // Manually update tension (raw() may not be available)
  const { data: rel } = await sb.from('faction_relationships').select('tension, alliances').eq('faction_a', fa).eq('faction_b', fb).maybeSingle();
  if (rel) {
    const newTension = Math.max(0, rel.tension + tensionDelta);
    await sb.from('faction_relationships').update({
      tension: newTension,
      status: tensionToStatus(newTension),
      alliances: (rel.alliances || 0) + 1,
      last_treaty_at: new Date().toISOString(),
      key_event: `Treaty: "${title}"`,
    }).eq('faction_a', fa).eq('faction_b', fb);
  }

  await sb.from('world_events').insert({
    source: proposed_by,
    event_type: 'treaty_ratified',
    content: `TREATY RATIFIED: "${title}" — ${FACTION_NAMES[fa] || fa} and ${FACTION_NAMES[fb] || fb} have signed a ${treaty_type} agreement. Terms: ${terms.slice(0, 200)}`,
    severity: treaty_type === 'alliance' ? 'high' : 'moderate',
    tags: ['diplomacy', 'treaty', treaty_type, fa, fb],
  }).catch(() => {});

  return NextResponse.json({ ok: true, treaty: data });
}
