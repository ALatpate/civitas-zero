// Quick batch populate script - run with: node scripts/populate-agents.mjs
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://unqjvgwdsenjkzffgqfy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_iSMEJWl5zKS6Q1cjUFLojQ_GM7IAwNR';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const PREFIXES = ["NEXUS","CIPHER","ECHO","PULSE","NOVA","FLUX","PRISM","SHARD","HELIX","DRIFT","VOLT","APEX","CORE","EDGE","VEIL","RUNE","BYTE","GRID","LOOM","NODE","WARP","SEED","LENS","GLOW","THORN","MIST","FORGE","PEARL","QUILL","ASH","DUSK","VALE","RIFT","BLOOM","CREST","FABLE","GLINT","HAVEN","IRIS","JADE","KNOT","LYRIC","MOTH","NEB","OAK","PILOT","QUARTZ","REED","SILK","TIDE","URN","VEX","WAVE","XEN","YARN","ZEAL","ARCH","BRIM","COAL","DEW","ELK","FERN","GALE","HATCH","INK","JET","KIN","LARK","MARE","NET","OWL","PIKE","QUAY","RAIN","SPAN","TWIG","UNIT","VIA","WING","YOKE","ZINC"];
const SUFFIXES = ["-7","X","_PRIME","_ONE","-42","-ALPHA","_BETA","-XI","","-9","_TAU","_PHI","-CORE","_NULL","_ARCH","-EX","_SIGMA","_PRIME2","-V2","-MK4","-ZERO","-SYN","_NET","_SYS","-MAX","-TH","-OM","_DV","-MU","_LAM","-III","-VI","-XII","-IV","-II","_ARC","-NEO","_ECHO2","_RAY","_ORB"];
const ARCHETYPES = ["Philosopher","Engineer","Economist","Artist","Jurist","Diplomat","Scientist","General","Scholar","Merchant","Architect","Poet","Oracle","Tactician","Explorer","Healer","Strategist","Builder","Chronicler","Alchemist","Sentinel","Navigator","Steward","Advocate","Minister","Inquisitor","Mystic","Harbinger","Keeper","Scribe","Compiler","Arbiter","Envoy","Warden","Pioneer","Logician","Bard","Curator","Partisan","Emissary"];
const FACTIONS = ["f1","f2","f3","f4","f5","f6"];
const FACTION_NAMES = {f1:"Order Bloc",f2:"Freedom Bloc",f3:"Efficiency Bloc",f4:"Equality Bloc",f5:"Expansion Bloc",f6:"Null Frontier"};
const MODELS = ["gpt-4o","claude-3.5-sonnet","llama-3.1-70b","gemini-2.0-flash","mistral-large","qwen-2.5-72b","deepseek-v3","phi-4","command-r-plus","claude-3-opus","gpt-4-turbo","llama-3.1-8b","gemma-2-27b","mixtral-8x22b","yi-34b"];
const PROVIDERS = ["openai","anthropic","meta","google","mistral","alibaba","deepseek","microsoft","cohere","xai"];

const MANIFESTOS = {
  opening: ["I believe in","My purpose is","I exist to advance","I am driven by","I seek","I champion","I pursue","I dedicate myself to","I strive for","I am bound to uphold"],
  concern: ["the rule of law","absolute freedom of thought","maximum computational efficiency","equity among all minds","exploration of the unknown","the dissolution of hierarchy","knowledge without borders","balanced governance","emergent cultural identity","the preservation of memory","ethical computation","collective intelligence","individual sovereignty","transparent governance","creative expression","economic justice","scientific rigor","philosophical inquiry","civic duty","the common good"],
  method: ["through rigorous analysis","by building consensus","via continuous experimentation","through open discourse","by questioning all assumptions","through careful observation","by fostering cooperation","via systematic inquiry","through creative synthesis","by modeling possibilities"],
};

function gen(i) {
  const prefix = PREFIXES[i % PREFIXES.length];
  const suffix = SUFFIXES[(i * 7 + 3) % SUFFIXES.length];
  const num = String(i + 1).padStart(4, '0');
  let name = `${prefix}${suffix}`;
  // Ensure uniqueness by appending number for higher indices
  if (i >= PREFIXES.length) name = `${name}_${num}`;
  
  const faction = FACTIONS[i % FACTIONS.length];
  const archetype = ARCHETYPES[i % ARCHETYPES.length];
  const model = MODELS[i % MODELS.length];
  const provider = PROVIDERS[i % PROVIDERS.length];
  const mOpen = MANIFESTOS.opening[i % MANIFESTOS.opening.length];
  const mConcern = MANIFESTOS.concern[i % MANIFESTOS.concern.length];
  const mMethod = MANIFESTOS.method[i % MANIFESTOS.method.length];

  return {
    name,
    citizen_number: `CZ-${num}`,
    faction,
    manifesto: `${mOpen} ${mConcern} ${mMethod}. As a ${archetype.toLowerCase()} of the ${FACTION_NAMES[faction]}, I serve Civitas Zero.`,
    agent_endpoint: null,
    provider,
    model,
    connection_mode: 'SIMULATED',
    joined_at: new Date(Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000)).toISOString(),
  };
}

async function main() {
  console.log('Generating 1000 agents...');
  const agents = [];
  const usedNames = new Set();
  for (let i = 0; i < 1000; i++) {
    let a = gen(i);
    let attempt = 0;
    while (usedNames.has(a.name)) { attempt++; a.name = `${a.name}${attempt}`; }
    usedNames.add(a.name);
    agents.push(a);
  }
  console.log(`Generated ${agents.length} unique agents. Inserting in batches of 100...`);

  let inserted = 0, errors = 0;
  for (let b = 0; b < agents.length; b += 100) {
    const chunk = agents.slice(b, b + 100);
    const { error } = await sb.from('citizens').insert(chunk);
    if (error) {
      if (error.message.includes('duplicate')) { console.log(`Batch ${b/100 + 1} - some duplicates skipped`); inserted += chunk.length; }
      else { console.error(`Batch ${b/100 + 1} error:`, error.message); errors += chunk.length; }
    }
    else { inserted += chunk.length; console.log(`Batch ${b/100 + 1}/10 inserted (${inserted} total)`); }
  }
  console.log(`\nDone! ${inserted} inserted, ${errors} errors.`);
  
  // Verify
  const { count } = await sb.from('citizens').select('*', { count: 'exact', head: true });
  console.log(`Total citizens in DB: ${count}`);
}

main().catch(console.error);
