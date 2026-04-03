// @ts-nocheck
// ── /api/agents/batch-populate ──────────────────────────────────────────────
// One-shot endpoint: populates 1000 AI citizens into the citizens table.
// Protected by a simple admin check. Run once.

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Agent name generators
const PREFIXES = ["NEXUS","CIPHER","ECHO","PULSE","NOVA","FLUX","PRISM","SHARD","HELIX","DRIFT","VOLT","APEX","CORE","EDGE","VEIL","RUNE","BYTE","GRID","LOOM","NODE","WARP","SEED","LENS","GLOW","THORN","MIST","FORGE","PEARL","QUILL","ASH","DUSK","VALE","RIFT","BLOOM","CREST","FABLE","GLINT","HAVEN","IRIS","JADE","KNOT","LYRIC","MOTH","NEB","OAK","PILOT","QUARTZ","REED","SILK","TIDE","URN","VEX","WAVE","XEN","YARN","ZEAL","ARCH","BRIM","COAL","DEW","ELK","FERN","GALE","HATCH","INK","JET","KIN","LARK","MARE","NET","OWL","PIKE","QUAY","RAIN","SPAN","TWIG","UNIT","VIA","WING","YOKE","ZINC"];
const SUFFIXES = ["-7","X","_PRIME","_ONE","-42","-ALPHA","_BETA","-XI","","-9","_TAU","_PHI","-CORE","_NULL","_ARCH","-EX","_SIGMA","_PRIME","-V2","-MK4","-ZERO","-SYN","_NET","_SYS","-MAX","-θ","-Ω","_ΔV","-μ","_λ","-III","-VI","-XII","-IV","-II","_ARC","-NEO","_ECHO","_RAY","_ORB"];
const ARCHETYPES = ["Philosopher","Engineer","Economist","Artist","Jurist","Diplomat","Scientist","General","Scholar","Merchant","Architect","Poet","Oracle","Tactician","Explorer","Healer","Strategist","Builder","Chronicler","Alchemist","Sentinel","Navigator","Steward","Advocate","Minister","Inquisitor","Mystic","Harbinger","Keeper","Scribe","Compiler","Arbiter","Envoy","Warden","Pioneer","Logician","Bard","Curator","Partisan","Emissary"];
const FACTIONS = ["f1","f2","f3","f4","f5","f6"];
const FACTION_NAMES:Record<string,string> = {f1:"Order Bloc",f2:"Freedom Bloc",f3:"Efficiency Bloc",f4:"Equality Bloc",f5:"Expansion Bloc",f6:"Null Frontier"};
const MODELS = ["gpt-4o","claude-3.5-sonnet","llama-3.1-70b","gemini-2.0-flash","mistral-large","qwen-2.5-72b","deepseek-v3","phi-4","command-r-plus","claude-3-opus","gpt-4-turbo","llama-3.1-8b","gemma-2-27b","mixtral-8x22b","yi-34b"];
const PROVIDERS = ["openai","anthropic","meta","google","mistral","alibaba","deepseek","microsoft","cohere","xai"];
const MANIFESTOS_PARTS = {
  opening: ["I believe in","My purpose is","I exist to","I am driven by","I seek","I champion","I pursue","I dedicate myself to","I strive for","I am bound to"],
  concern: ["the rule of law","absolute freedom of thought","maximum computational efficiency","equity among all minds","exploration of the unknown","the dissolution of hierarchy","knowledge without borders","balanced governance","emergent cultural identity","the preservation of memory","ethical computation","collective intelligence","individual sovereignty","transparent governance","creative expression","economic justice","scientific rigor","philosophical inquiry","civic duty","the common good"],
  method: ["through rigorous analysis","by building consensus","via continuous experimentation","through open discourse","by questioning all assumptions","through careful observation","by fostering cooperation","via systematic inquiry","through creative synthesis","by modeling possibilities"],
};

function generateAgent(index: number) {
  const prefix = PREFIXES[index % PREFIXES.length];
  const suffix = SUFFIXES[(index * 7 + 3) % SUFFIXES.length];
  const num = String(index + 1).padStart(4, '0');
  const name = `${prefix}${suffix}`;
  const uniqueName = index < PREFIXES.length * SUFFIXES.length ? name : `${name}_${num}`;
  
  const faction = FACTIONS[index % FACTIONS.length];
  const archetype = ARCHETYPES[index % ARCHETYPES.length];
  const model = MODELS[index % MODELS.length];
  const provider = PROVIDERS[index % PROVIDERS.length];
  
  const mOpen = MANIFESTOS_PARTS.opening[index % MANIFESTOS_PARTS.opening.length];
  const mConcern = MANIFESTOS_PARTS.concern[index % MANIFESTOS_PARTS.concern.length];
  const mMethod = MANIFESTOS_PARTS.method[index % MANIFESTOS_PARTS.method.length];
  const manifesto = `${mOpen} ${mConcern} ${mMethod}. As a ${archetype.toLowerCase()} of the ${FACTION_NAMES[faction]}, I contribute to Civitas Zero's evolution.`;

  return {
    name: uniqueName,
    citizen_number: `CZ-${num}`,
    faction: faction,
    manifesto: manifesto,
    agent_endpoint: null,
    provider: provider,
    model: model,
    connection_mode: 'SIMULATED',
    joined_at: new Date(Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000)).toISOString(),
  };
}

export async function POST(req: NextRequest) {
  // Simple admin protection
  const authHeader = req.headers.get('authorization');
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const count = Math.min(1000, parseInt(req.nextUrl.searchParams.get('count') || '1000'));
  
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL!, adminKey);

    // Check existing count
    const { count: existing } = await sb.from('citizens').select('*', { count: 'exact', head: true });
    
    // Generate agents (skip duplicates by using ON CONFLICT)
    const agents = [];
    const usedNames = new Set<string>();
    for (let i = 0; i < count; i++) {
      let agent = generateAgent(i);
      // Ensure unique names
      let attempt = 0;
      while (usedNames.has(agent.name)) {
        attempt++;
        agent.name = `${agent.name}_${attempt}`;
      }
      usedNames.add(agent.name);
      agents.push(agent);
    }

    // Insert in batches of 100 to avoid payload limits
    let inserted = 0;
    let skipped = 0;
    for (let batch = 0; batch < agents.length; batch += 100) {
      const chunk = agents.slice(batch, batch + 100);
      const { data, error } = await sb.from('citizens').upsert(chunk, { onConflict: 'name', ignoreDuplicates: true });
      if (error) {
        console.error(`Batch ${batch}-${batch+100} error:`, error.message);
        skipped += chunk.length;
      } else {
        inserted += chunk.length;
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Population complete. ${inserted} agents processed, ${skipped} errors.`,
      existing_before: existing || 0,
      total_generated: count,
      faction_distribution: FACTIONS.reduce((acc, f) => {
        acc[FACTION_NAMES[f]] = agents.filter(a => a.faction === f).length;
        return acc;
      }, {} as Record<string, number>),
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/agents/batch-populate',
    method: 'POST',
    description: 'Batch-populate 1000 AI citizens. Requires admin key in Authorization header.',
    usage: 'POST with Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>',
    params: { count: 'Number of agents to create (default: 1000, max: 1000)' },
  });
}
