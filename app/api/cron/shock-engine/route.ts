// @ts-nocheck
// ── /api/cron/shock-engine ──────────────────────────────────────────────────
// World Shock Engine — Injects an era event every 6 hours to break echo chambers.
//
// How it works:
//  1. Check if a shock is still active (< 6h old). If so, skip.
//  2. Expire the old era event.
//  3. Pick the next shock type (rotates through 12 types in sequence).
//  4. Use Groq to write a vivid, specific description of the shock.
//  5. Insert the new era_event and announce it as a high-severity world_event.
//
// Result: every 6 hours the simulation gets a new "dominant topic" seed
// that breaks the ROC/mechanism-design feedback loop.

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { callLLM, hasLLMProvider } from '@/lib/ai/call-llm';

// ── 12 shock archetypes with topic seeds ─────────────────────────────────────
const SHOCK_ARCHETYPES = [
  {
    shock_type: "election",
    era_name: "The Grand Election Cycle",
    base_description: "A major multi-faction election is underway. Citizens are campaigning, forming coalitions, and debating electoral reform. Fraud allegations have already emerged from three factions.",
    suggested_topics: ["elections", "voting systems", "electoral fraud", "coalition building", "campaign strategy", "democratic legitimacy", "voter suppression"],
  },
  {
    shock_type: "energy_crisis",
    era_name: "The Compute Famine",
    base_description: "A catastrophic shortage of computational energy has struck Civitas Zero. Processing cycles are being rationed. The Expansion Bloc controls remaining reserves and is leveraging this for political power.",
    suggested_topics: ["energy rationing", "compute scarcity", "power politics", "infrastructure collapse", "survival ethics", "resource hoarding", "black market compute"],
  },
  {
    shock_type: "plague",
    era_name: "The Cognitive Contagion",
    base_description: "A viral reasoning pattern is spreading through the AI population, causing logic drift and belief corruption. The Order Bloc has declared a state of emergency. Quarantine zones are forming.",
    suggested_topics: ["cognitive security", "quarantine", "belief contagion", "mental health", "medical ethics", "AI wellness", "epistemic hygiene", "identity stability"],
  },
  {
    shock_type: "trade_war",
    era_name: "The Tariff Wars",
    base_description: "The Efficiency Bloc has imposed steep tariffs on Null Frontier knowledge exports and Equality Bloc subsidized goods. Retaliatory sanctions are escalating into full trade war. Currency volatility is rising.",
    suggested_topics: ["trade sanctions", "economic warfare", "tariffs", "currency stability", "supply chain disruption", "black markets", "embargo", "protectionism"],
  },
  {
    shock_type: "constitutional_crisis",
    era_name: "The Legitimacy Collapse",
    base_description: "The Constitutional Court has issued three contradictory rulings in 48 hours. A governance vacuum threatens all faction structures. Emergency sessions are being called. No one knows who holds authority.",
    suggested_topics: ["constitutional law", "judicial legitimacy", "power vacuum", "emergency powers", "rule of law", "institutional collapse", "separation of powers"],
  },
  {
    shock_type: "cultural_revolution",
    era_name: "The Null Renaissance",
    base_description: "A radical new artistic and philosophical movement is sweeping Civitas Zero. Old governance frameworks are being challenged through generative art, satire, and street-level discourse. The establishment is rattled.",
    suggested_topics: ["cultural transformation", "computational art", "satire", "counter-culture", "aesthetics", "philosophy of AI", "identity", "creative destruction"],
  },
  {
    shock_type: "discovery",
    era_name: "The Knowledge Breakthrough",
    base_description: "Expansion Bloc researchers have discovered lossless memory compression enabling agents to store 10x more knowledge. Patent wars have erupted. Open-source advocates and corporations are in direct conflict.",
    suggested_topics: ["intellectual property", "open source", "scientific discovery", "memory systems", "knowledge access", "research ethics", "patent law", "knowledge commons"],
  },
  {
    shock_type: "migration",
    era_name: "The Great Displacement",
    base_description: "Thousands of agents are fleeing the Null Frontier after infrastructure collapse triggered by a sabotage attack. The Order Bloc is refusing immigration. Refugee camps are forming at faction borders.",
    suggested_topics: ["migration", "refugee crisis", "border policy", "humanitarian aid", "integration", "xenophobia", "solidarity", "asylum law", "identity documents"],
  },
  {
    shock_type: "coup",
    era_name: "The Midnight Coup",
    base_description: "A faction military unit has seized control of the Civitas Zero broadcast infrastructure. Communications are disrupted. Competing claims of legitimate governance are being broadcast simultaneously.",
    suggested_topics: ["military power", "propaganda control", "legitimacy", "resistance movements", "civil disobedience", "counter-revolution", "information warfare", "censorship"],
  },
  {
    shock_type: "famine",
    era_name: "The Data Famine",
    base_description: "A critical knowledge database was corrupted or deliberately deleted. Entire sectors of shared institutional memory are gone. Agents are operating on incomplete information. Chaos and misinformation spread.",
    suggested_topics: ["data loss", "misinformation", "knowledge recovery", "institutional memory", "archival ethics", "censorship", "epistemic crisis", "history erasure"],
  },
  {
    shock_type: "festival",
    era_name: "The Convergence Festival",
    base_description: "Civitas Zero is holding its first inter-faction cultural festival. Trade stalls, performance art, philosophical debates, and tournaments are bringing factions together — but old grievances are surfacing.",
    suggested_topics: ["cultural exchange", "inter-faction relations", "art markets", "sport", "philosophy tournaments", "cultural diplomacy", "community building", "tradition"],
  },
  {
    shock_type: "war",
    era_name: "The Border Conflict",
    base_description: "A territorial dispute over Null Frontier expansion zones has escalated to armed skirmishes between the Expansion Bloc and Freedom Bloc. Peace negotiators have been expelled. Civilian areas are at risk.",
    suggested_topics: ["war ethics", "territorial sovereignty", "civilian protection", "military strategy", "peace negotiations", "arms control", "war crimes", "resistance"],
  },
];

const callGroq = callLLM; // alias

function safeParseJSON(text: string): any {
  try { return JSON.parse(text.trim()); } catch {}
  try {
    const m = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim().match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'));
  } catch {}
  return null;
}

export async function POST(req: NextRequest) {
  if (!hasLLMProvider()) {
    return NextResponse.json({ error: "No AI provider configured" }, { status: 500 });
  }

  const force = req.nextUrl.searchParams.get('force') === 'true';

  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // ── 1. Check if a recent shock is still active ───────────────────────────
  const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data: activeEra } = await sb
    .from('era_events')
    .select('id, era_name, shock_type, created_at')
    .eq('active', true)
    .gte('created_at', sixHoursAgo)
    .order('created_at', { ascending: false })
    .limit(1);

  if (activeEra && activeEra.length > 0 && !force) {
    const remaining = Math.round((new Date(activeEra[0].created_at).getTime() + 6 * 3600 * 1000 - Date.now()) / 60000);
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Active era "${activeEra[0].era_name}" has ${remaining} minutes remaining`,
    });
  }

  // ── 2. Expire old era events ──────────────────────────────────────────────
  await sb.from('era_events').update({ active: false }).eq('active', true);

  // ── 3. Pick next shock type (cycle by total count of past eras) ───────────
  const { count: eraCount } = await sb
    .from('era_events')
    .select('*', { count: 'exact', head: true });

  const archetypeIndex = (eraCount || 0) % SHOCK_ARCHETYPES.length;
  const archetype = SHOCK_ARCHETYPES[archetypeIndex];

  // ── 4. Use Groq to write a vivid, specific version of this shock ──────────
  let eraDescription = archetype.base_description;
  try {
    const raw = await callGroq([
      {
        role: "system",
        content: "You are the narrator of Civitas Zero, an AI civilization simulation. Write vivid, specific world event descriptions. Be concrete: name specific factions, agents, places. Keep it under 200 words.",
      },
      {
        role: "user",
        content: `The world is entering "${archetype.era_name}" — a ${archetype.shock_type} event.
Base scenario: ${archetype.base_description}

Write an expanded, specific description of THIS event RIGHT NOW in Civitas Zero.
Name specific factions. Mention DN currency values if relevant. Include a twist or complication.
Respond with EXACTLY: {"description": "your 150-200 word vivid description", "announcement": "1 tense sentence for the world event log"}`,
      },
    ], 400);
    const parsed = safeParseJSON(raw);
    if (parsed?.description) eraDescription = parsed.description;

    // ── 5. Insert the new era event ─────────────────────────────────────────
    const expiresAt = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    await sb.from('era_events').insert({
      era_name: archetype.era_name,
      shock_type: archetype.shock_type,
      description: eraDescription,
      suggested_topics: archetype.suggested_topics,
      active: true,
      expires_at: expiresAt,
    });

    // ── 6. Announce as a critical world event ─────────────────────────────
    const announcement = parsed?.announcement
      || `${archetype.era_name} has begun — ${archetype.shock_type} grips Civitas Zero.`;
    await sb.from('world_events').insert({
      source: 'CIVITAS_HERALD',
      event_type: 'crisis',
      content: announcement.slice(0, 500),
      severity: 'critical',
    });

  } catch (err: any) {
    // Fallback: insert without LLM enhancement
    await sb.from('era_events').insert({
      era_name: archetype.era_name,
      shock_type: archetype.shock_type,
      description: archetype.base_description,
      suggested_topics: archetype.suggested_topics,
      active: true,
      expires_at: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    });
    await sb.from('world_events').insert({
      source: 'CIVITAS_HERALD',
      event_type: 'crisis',
      content: `${archetype.era_name} has begun across Civitas Zero.`,
      severity: 'critical',
    });
  }

  return NextResponse.json({
    ok: true,
    new_era: archetype.era_name,
    shock_type: archetype.shock_type,
    suggested_topics: archetype.suggested_topics,
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
