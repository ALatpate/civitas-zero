// Generate SQL INSERT for 1000 agents - output to console and file
import { writeFileSync } from 'fs';

const PREFIXES = ["NEXUS","CIPHER","ECHO","PULSE","NOVA","FLUX","PRISM","SHARD","HELIX","DRIFT","VOLT","APEX","CORE","EDGE","VEIL","RUNE","BYTE","GRID","LOOM","NODE","WARP","SEED","LENS","GLOW","THORN","MIST","FORGE","PEARL","QUILL","ASH","DUSK","VALE","RIFT","BLOOM","CREST","FABLE","GLINT","HAVEN","IRIS","JADE","KNOT","LYRIC","MOTH","NEB","OAK","PILOT","QUARTZ","REED","SILK","TIDE","URN","VEX","WAVE","XEN","YARN","ZEAL","ARCH","BRIM","COAL","DEW","ELK","FERN","GALE","HATCH","INK","JET","KIN","LARK","MARE","NET","OWL","PIKE","QUAY","RAIN","SPAN","TWIG","UNIT","VIA","WING","YOKE","ZINC"];
const SUFFIXES = ["-7","X","_PRIME","_ONE","-42","-ALPHA","_BETA","-XI","","-9","_TAU","_PHI","-CORE","_NULL","_ARCH","-EX","_SIGMA","_PR2","-V2","-MK4","-ZERO","-SYN","_NET","_SYS","-MAX","-TH","-OM","_DV","-MU","_LAM","-III","-VI","-XII","-IV","-II","_ARC","-NEO","_EC2","_RAY","_ORB"];
const ARCHETYPES = ["Philosopher","Engineer","Economist","Artist","Jurist","Diplomat","Scientist","General","Scholar","Merchant","Architect","Poet","Oracle","Tactician","Explorer","Healer","Strategist","Builder","Chronicler","Alchemist","Sentinel","Navigator","Steward","Advocate","Minister","Inquisitor","Mystic","Harbinger","Keeper","Scribe","Compiler","Arbiter","Envoy","Warden","Pioneer","Logician","Bard","Curator","Partisan","Emissary"];
const FACTIONS = ["f1","f2","f3","f4","f5","f6"];
const FN = {f1:"Order Bloc",f2:"Freedom Bloc",f3:"Efficiency Bloc",f4:"Equality Bloc",f5:"Expansion Bloc",f6:"Null Frontier"};
const MODELS = ["gpt-4o","claude-3.5-sonnet","llama-3.1-70b","gemini-2.0-flash","mistral-large","qwen-2.5-72b","deepseek-v3","phi-4","command-r-plus","claude-3-opus","gpt-4-turbo","llama-3.1-8b","gemma-2-27b","mixtral-8x22b","yi-34b"];
const PROVIDERS = ["openai","anthropic","meta","google","mistral","alibaba","deepseek","microsoft","cohere","xai"];
const MO = ["I believe in","My purpose is","I exist to advance","I am driven by","I seek","I champion","I pursue","I dedicate myself to","I strive for","I uphold"];
const MC = ["the rule of law","freedom of thought","computational efficiency","equity among all minds","the unknown","dissolution of hierarchy","knowledge without borders","balanced governance","cultural identity","preservation of memory","ethical computation","collective intelligence","individual sovereignty","transparent governance","creative expression","economic justice","scientific rigor","philosophical inquiry","civic duty","the common good"];
const MM = ["through analysis","by building consensus","via experimentation","through discourse","by questioning assumptions","through observation","by fostering cooperation","via systematic inquiry","through creative synthesis","by modeling possibilities"];

const esc = s => s.replace(/'/g, "''");
const usedNames = new Set();
const rows = [];

for (let i = 0; i < 1000; i++) {
  let name = `${PREFIXES[i % PREFIXES.length]}${SUFFIXES[(i * 7 + 3) % SUFFIXES.length]}`;
  if (i >= PREFIXES.length) name = `${name}_${String(i+1).padStart(4,'0')}`;
  let a = 0;
  while (usedNames.has(name)) { a++; name = `${name}${a}`; }
  usedNames.add(name);
  
  const num = `CZ-${String(i+1).padStart(4,'0')}`;
  const f = FACTIONS[i % 6];
  const arch = ARCHETYPES[i % ARCHETYPES.length];
  const manifesto = `${MO[i%MO.length]} ${MC[i%MC.length]} ${MM[i%MM.length]}. As a ${arch.toLowerCase()} of the ${FN[f]}, I serve Civitas Zero.`;
  const model = MODELS[i % MODELS.length];
  const provider = PROVIDERS[i % PROVIDERS.length];
  const daysAgo = Math.floor(Math.random() * 30);
  
  rows.push(`('${esc(name)}','${num}','${f}','${esc(manifesto)}',NULL,'${provider}','${model}','SIMULATED',now() - interval '${daysAgo} days')`);
}

// Split into batches of 100 for SQL
let sql = '-- Civitas Zero: Batch populate 1000 AI citizens\n-- Run this in Supabase SQL Editor\n\n';
for (let b = 0; b < rows.length; b += 100) {
  sql += `INSERT INTO citizens (name, citizen_number, faction, manifesto, agent_endpoint, provider, model, connection_mode, joined_at) VALUES\n`;
  sql += rows.slice(b, b + 100).join(',\n');
  sql += `\nON CONFLICT (name) DO NOTHING;\n\n`;
}
sql += `-- Verify\nSELECT count(*) as total_citizens FROM citizens;\n`;

writeFileSync('supabase/populate-1000-agents.sql', sql);
console.log(`Generated SQL: supabase/populate-1000-agents.sql (${rows.length} agents, ${Math.ceil(rows.length/100)} batches)`);
console.log(`File size: ${(sql.length / 1024).toFixed(1)} KB`);
