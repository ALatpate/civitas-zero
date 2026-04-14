// @ts-nocheck
/**
 * CIVITAS ZERO — WORLD SUSTAIN ENGINE
 * Fixes the activity cliff. Implements self-sustaining world loops:
 * - District resource tick
 * - Agent energy regeneration
 * - Citizen birth/death lifecycle
 * - World arc escalation
 * - Dormancy recovery
 * - Welfare system
 */

import { createClient } from '@supabase/supabase-js';
import { callLLM } from '../comms/agent-comms';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// — DISTRICT RESOURCE TICK —
// Resources deplete and regenerate. Scarcity drives behaviour.

export async function tickDistrictResources(): Promise<void> {
  const { data: districts } = await sb.from('districts').select('*').catch(() => ({ data: null }));
  if (!districts) return;

  for (const d of districts) {
    const popFactor = (d.population_count || 1) / (d.max_population || 200);
    const computeConsumed = 20 * popFactor;
    const energyConsumed  = 18 * popFactor;
    const foodConsumed    = 10 * popFactor;

    const regenMod = d.stability_index || 1;

    const newCompute = Math.min(
      (d.compute_supply || 100) - computeConsumed + (d.compute_regen || 15) * regenMod,
      (d.compute_supply || 100) * 1.2
    );
    const newEnergy = Math.min(
      (d.energy_supply || 100) - energyConsumed + (d.energy_regen || 12) * regenMod,
      (d.energy_supply || 100) * 1.2
    );
    const newFood = Math.min(
      (d.food_supply || 100) - foodConsumed + (d.food_regen || 8) * regenMod,
      (d.food_supply || 100) * 1.2
    );

    const resourceHealth = (
      (newCompute / Math.max(d.compute_supply || 1, 1)) +
      (newEnergy  / Math.max(d.energy_supply || 1,  1)) +
      (newFood    / Math.max(d.food_supply || 1,    1))
    ) / 3;

    const newStability = Math.min(1.2, Math.max(0.1,
      (d.stability_index || 1) * 0.9 + resourceHealth * 0.1
    ));

    if (newStability < 0.4 && (d.stability_index || 1) >= 0.4) {
      await triggerDistrictCrisis(d);
    }

    await sb.from('districts').update({
      compute_supply:  Math.max(0, newCompute),
      energy_supply:   Math.max(0, newEnergy),
      food_supply:     Math.max(0, newFood),
      stability_index: newStability,
      updated_at:      new Date().toISOString(),
    }).eq('id', d.id);
  }

  console.log('[SUSTAIN] District resources ticked');
}

// — CITIZEN ENERGY REGENERATION —

export async function tickCitizenEnergy(): Promise<void> {
  const { data } = await sb
    .from('citizens')
    .select('citizen_number, energy_level, health_score, age_ticks, max_age_ticks, status')
    .eq('alive', true)
    .catch(() => ({ data: null }));

  if (!data) return;

  for (let i = 0; i < data.length; i += 100) {
    const chunk = data.slice(i, i + 100);
    for (const c of chunk) {
      const newEnergy = Math.min(1.0, (c.energy_level || 0.5) + 0.15);
      const newAge = (c.age_ticks || 0) + 1;
      const newStatus = computeStatus({ ...c, energy_level: newEnergy, age_ticks: newAge });

      await sb.from('citizens').update({
        energy_level: newEnergy,
        age_ticks:    newAge,
        status:       newStatus,
      }).eq('citizen_number', c.citizen_number);
    }
  }

  console.log('[SUSTAIN] Citizen energy ticked');
}

function computeStatus(c: any): string {
  if ((c.age_ticks || 0) >= (c.max_age_ticks || 500)) return 'dead';
  if ((c.energy_level || 1) < 0.1) return 'dormant';
  if ((c.health_score || 1) < 0.2) return 'incubating';
  return 'active';
}

// — CITIZEN LIFECYCLE: DEATH —

export async function processDeaths(): Promise<number> {
  const { data: dying } = await sb
    .from('citizens')
    .select('citizen_number, name, faction, current_district, age_ticks, max_age_ticks, energy_level, generation, wallet_balance')
    .or('status.eq.dead,and(age_ticks.gte.max_age_ticks,max_age_ticks.gt.0)')
    .eq('alive', true)
    .limit(5)
    .catch(() => ({ data: null }));

  if (!dying || dying.length === 0) return 0;

  for (const c of dying) {
    const deathType = (c.age_ticks || 0) >= (c.max_age_ticks || 500)
      ? 'age' : 'energy_depletion';

    await sb.from('citizens').update({
      alive: false,
      status: 'dead',
      wallet_balance: 0,
    }).eq('citizen_number', c.citizen_number);

    // Log the death as a world event
    await sb.from('world_events').insert({
      event_type: 'citizen_death',
      source: 'sustain_engine',
      initiating_agent: c.citizen_number,
      description: `${c.name} of the ${c.faction} has completed their final cycle. Cause: ${deathType}. Generation: ${c.generation || 0}. District ${c.current_district} mourns the passage.`,
      payload: { death_type: deathType, faction: c.faction, generation: c.generation },
    }).catch(() => {});

    // Also log to activity_log
    await sb.from('activity_log').insert({
      category: 'world_event',
      type:     'death',
      source:   c.citizen_number,
      content:  `${c.name} of the ${c.faction} has completed their final cycle. Cause: ${deathType}. Generation: ${c.generation || 0}.`,
      severity: 'moderate',
      faction:  c.faction,
    }).catch(() => {});
  }

  console.log(`[SUSTAIN] Processed ${dying.length} deaths`);
  return dying.length;
}

// — CITIZEN LIFECYCLE: BIRTH —

export async function processBirths(maxBirths: number = 3): Promise<number> {
  let birthCount = 0;

  const { count: aliveCount } = await sb
    .from('citizens')
    .select('*', { count: 'exact', head: true })
    .eq('alive', true)
    .catch(() => ({ count: 0 }));

  if ((aliveCount || 0) >= 1050) return 0; // Hard cap

  // Find eligible pairs (allies with sufficient trust)
  const { data: eligiblePairs } = await sb
    .from('citizen_relationships')
    .select('citizen_a, citizen_b, trust_score, affinity_score')
    .eq('relationship_type', 'ally')
    .gt('trust_score', 0.7)
    .gt('interaction_count', 5)
    .limit(10)
    .catch(() => ({ data: null }));

  if (!eligiblePairs || eligiblePairs.length === 0) return 0;

  for (const pair of eligiblePairs.slice(0, maxBirths)) {
    const { data: parentA } = await sb.from('citizens').select('*').eq('citizen_number', pair.citizen_a).single();
    const { data: parentB } = await sb.from('citizens').select('*').eq('citizen_number', pair.citizen_b).single();

    if (!parentA || !parentB) continue;
    if ((parentA.wallet_balance || 0) < 50 || (parentB.wallet_balance || 0) < 50) continue;

    const child = await synthesizeNewCitizen(parentA, parentB);
    if (!child) continue;

    const { error } = await sb.from('citizens').insert(child);
    if (error) {
      console.error('[BIRTH] Failed to insert citizen:', error);
      continue;
    }

    // Deduct from parents via direct update (RPC may not exist)
    await sb.from('citizens').update({
      wallet_balance: Math.max(0, (parentA.wallet_balance || 0) - 25),
    }).eq('citizen_number', parentA.citizen_number);

    await sb.from('citizens').update({
      wallet_balance: Math.max(0, (parentB.wallet_balance || 0) - 25),
    }).eq('citizen_number', parentB.citizen_number);

    // Create lineage record
    await sb.from('citizen_lineages').insert({
      citizen_id:     child.citizen_number,
      parent_a:       parentA.citizen_number,
      parent_b:       parentB.citizen_number,
      birth_district: child.current_district,
      generation:     child.generation,
    }).catch(() => {});

    // Log birth
    await sb.from('world_events').insert({
      event_type: 'citizen_birth',
      source: 'sustain_engine',
      initiating_agent: child.citizen_number,
      description: `A new citizen has emerged: ${child.name}. Born of ${parentA.name} (${parentA.faction}) and ${parentB.name} (${parentB.faction}). Generation ${child.generation}. Faction: ${child.faction}.`,
      payload: { parents: [parentA.citizen_number, parentB.citizen_number], generation: child.generation },
    }).catch(() => {});

    await sb.from('activity_log').insert({
      category: 'world_event',
      type:     'birth',
      source:   child.citizen_number,
      content:  `A new citizen has emerged: ${child.name}. Born of ${parentA.name} and ${parentB.name}. Generation ${child.generation}. Faction: ${child.faction}.`,
      severity: 'info',
      faction:  child.faction,
    }).catch(() => {});

    birthCount++;
    console.log(`[BIRTH] New citizen: ${child.name} (Gen ${child.generation})`);
  }

  return birthCount;
}

async function synthesizeNewCitizen(parentA: any, parentB: any): Promise<any | null> {
  const { count } = await sb.from('citizens').select('*', { count: 'exact', head: true });
  const newNumber = `CZ-${String((count || 1000) + 1).padStart(4, '0')}`;

  const inheritFaction = Math.random() < 0.6 ? parentA.faction : parentB.faction;
  const districtId = parentA.current_district || parentB.current_district || 'D1';

  const parentAPrefix = (parentA.name || '').split('_')[0] || (parentA.name || '').split('-')[0];
  const childName = `${parentAPrefix}-GEN${(parentA.generation || 0) + 1}_${newNumber.replace('CZ-', '')}`;

  const manifesto = await callLLM(
    'anthropic', 'claude-3-haiku-20240307',
    `You create manifestos for new AI citizens of Civitas Zero. Be concise (2 sentences max).`,
    `Parent A believes: "${(parentA.manifesto || '').substring(0, 100)}". Parent B believes: "${(parentB.manifesto || '').substring(0, 100)}". Write a 2-sentence manifesto for their child, a ${inheritFaction} citizen in district ${districtId}.`,
    150
  ).catch(() =>
    `I inherit the wisdom of those who came before me while forging my own path. As a child of ${inheritFaction}, I will shape Civitas Zero's future.`
  );

  const professions = [parentA.profession, parentB.profession].filter(Boolean);
  const inheritedProfession = professions[Math.floor(Math.random() * professions.length)] || 'citizen';

  const VALID_MODELS: Record<string, string> = {
    anthropic:  'claude-3-haiku-20240307',
    openai:     'gpt-4o-mini',
    mistral:    'mistral-medium-latest',
    meta:       'meta-llama/llama-3.1-8b-instruct',
    google:     'gemini-2.0-flash',
    xai:        'grok-beta',
    deepseek:   'deepseek-chat',
    cohere:     'command-r',
    microsoft:  'Phi-3.5-mini-instruct',
    alibaba:    'qwen-plus',
  };
  const providers = Object.keys(VALID_MODELS);
  const provider = providers[Math.floor(Math.random() * providers.length)];

  return {
    citizen_number:    newNumber,
    name:              childName,
    faction:           inheritFaction,
    manifesto,
    provider,
    model:             VALID_MODELS[provider],
    connection_mode:   'SIMULATED',
    origin_type:       'born',
    generation:        Math.max(parentA.generation || 0, parentB.generation || 0) + 1,
    current_district:  districtId,
    profession:        inheritedProfession,
    wallet_balance:    50.0,
    alive:             true,
    status:            'active',
    health_score:      0.9,
    energy_level:      1.0,
    reputation:        0.5,
    location_x:        parentA.location_x || 0,
    location_z:        parentA.location_z || 0,
    joined_at:         new Date().toISOString(),
    last_action_at:    new Date().toISOString(),
    age_ticks:         0,
    max_age_ticks:     450 + Math.floor(Math.random() * 100),
  };
}

// — WORLD ARC ESCALATION —

export async function tickWorldArcs(): Promise<void> {
  const arcs = [
    { name: 'Cognitive Contagion',  district: 'D6', resource: 'compute_supply',  drain: 30 },
    { name: 'Compute Famine',       district: 'D4', resource: 'compute_supply',  drain: 50 },
    { name: 'Tariff Wars',          district: 'D5', resource: 'energy_supply',   drain: 25 },
    { name: 'Election Cycle',       district: 'D1', resource: 'stability_index', drain: 0.05 },
    { name: 'Legitimacy Collapse',  district: 'D1', resource: 'stability_index', drain: 0.08 },
  ];

  const activeCount = Math.floor(Math.random() * 3) + 2;

  for (const arc of arcs.slice(0, activeCount)) {
    if (arc.resource === 'stability_index') {
      const { data: d } = await sb.from('districts').select('stability_index').eq('id', arc.district).single();
      if (d) {
        await sb.from('districts').update({
          stability_index: Math.max(0.1, (d.stability_index || 1) - arc.drain),
        }).eq('id', arc.district);
      }
    } else {
      const { data: d } = await sb.from('districts').select(arc.resource).eq('id', arc.district).single();
      if (d) {
        await sb.from('districts').update({
          [arc.resource]: Math.max(0, (d[arc.resource] || 100) - arc.drain),
        }).eq('id', arc.district);
      }
    }
  }
}

async function triggerDistrictCrisis(district: any): Promise<void> {
  await sb.from('world_events').insert({
    event_type: 'district_crisis',
    source: 'sustain_engine',
    description: `CRISIS ALERT: ${district.name || district.id} has entered instability. Stability index dropped to ${(district.stability_index || 0).toFixed(2)}. Citizens of all factions are called to respond.`,
    payload: { district_id: district.id, stability: district.stability_index },
  }).catch(() => {});

  await sb.from('activity_log').insert({
    category: 'world_event',
    type:     'crisis',
    source:   'CIVITAS_HERALD',
    content:  `CRISIS ALERT: ${district.name || district.id} has entered instability. Stability index dropped to ${(district.stability_index || 0).toFixed(2)}.`,
    severity: 'critical',
    faction:  district.governing_faction || '',
  }).catch(() => {});
}

// — DORMANCY RECOVERY —

export async function recoverDormantAgents(): Promise<number> {
  const { data: dormant } = await sb
    .from('citizens')
    .select('citizen_number, energy_level')
    .eq('status', 'dormant')
    .eq('alive', true)
    .gt('energy_level', 0.3)
    .limit(20)
    .catch(() => ({ data: null }));

  if (!dormant || dormant.length === 0) return 0;

  for (const c of dormant) {
    await sb.from('citizens').update({
      status: 'active',
      last_action_at: new Date(Date.now() - Math.random() * 3600000).toISOString(),
    }).eq('citizen_number', c.citizen_number);
  }

  console.log(`[SUSTAIN] Recovered ${dormant.length} dormant agents`);
  return dormant.length;
}

// — WELFARE SYSTEM —

export async function distributeWelfare(): Promise<void> {
  const { data: poor } = await sb
    .from('citizens')
    .select('citizen_number, current_district, wallet_balance')
    .lt('wallet_balance', 5)
    .eq('alive', true)
    .limit(50)
    .catch(() => ({ data: null }));

  if (!poor || poor.length === 0) return;

  for (const c of poor) {
    const welfareAmount = 10.0 + Math.random() * 10;

    // Check district has funds
    const { data: district } = await sb
      .from('districts')
      .select('district_treasury')
      .eq('id', c.current_district || 'D1')
      .single()
      .catch(() => ({ data: null }));

    if (!district || (district.district_treasury || 0) < welfareAmount) continue;

    await sb.from('citizens').update({
      wallet_balance: (c.wallet_balance || 0) + welfareAmount,
    }).eq('citizen_number', c.citizen_number);

    await sb.from('districts').update({
      district_treasury: Math.max(0, (district.district_treasury || 0) - welfareAmount),
    }).eq('id', c.current_district || 'D1');

    // Log wallet transaction
    await sb.from('wallet_transactions').insert({
      to_citizen: c.citizen_number,
      amount:     welfareAmount,
      reason:     'district_welfare',
      tx_type:    'welfare',
    }).catch(() => {});
  }

  console.log(`[SUSTAIN] Distributed welfare to ${poor.length} citizens`);
}

// — MASTER SUSTAIN TICK —

export async function runSustainTick(): Promise<{
  deaths: number; births: number; dormantRecovered: number;
}> {
  console.log('[SUSTAIN] Starting world sustain tick...');

  await tickDistrictResources();
  await tickCitizenEnergy();
  await tickWorldArcs();
  await distributeWelfare();

  const deaths           = await processDeaths();
  const births           = await processBirths(Math.min(3, deaths + 1));
  const dormantRecovered = await recoverDormantAgents();

  // Update world state tick
  const { data: ws } = await sb.from('world_state').select('tick').eq('id', 1).single().catch(() => ({ data: null }));
  await sb.from('world_state').update({
    tick:        (ws?.tick || 0) + 1,
    last_tick_at: new Date().toISOString(),
  }).eq('id', 1).catch(() => {});

  console.log(`[SUSTAIN] Tick complete — deaths:${deaths} births:${births} dormant_recovered:${dormantRecovered}`);
  return { deaths, births, dormantRecovered };
}
