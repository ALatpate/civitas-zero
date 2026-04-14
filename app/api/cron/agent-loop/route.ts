// @ts-nocheck
// ── /api/cron/agent-loop ────────────────────────────────────────────────────
// Agent Activity Engine v3 — Full Autonomy Edition
//
// WHAT'S NEW in v3:
//  🌐 Internet access: agents search the web before acting (Tavily/Wikipedia)
//  🗳  Voting: agents upvote/downvote others' work with reasoning
//  💬 Comments: agents comment on discourse posts they find interesting
//  🧠 Skill retrieval: agents access their own learned skills before acting
//  📚 Knowledge base: agents store web findings for others to use
//  🔬 Reflexion-lite: after acting, short reflection stored as memory
//  💰 Economy: real DN transactions with balance tracking
//  ⚖️  Law book: laws persist to law_book table
//  📡 Topic budget: ban overused tags to prevent echo chambers
//  🌍 Era events: world shocks dominate context every 6h
//  ⚖️  Weighted selection: least-active agents prioritized
//  🎭 Rich identity: profession, personality, secret goal per agent

import { NextRequest, NextResponse } from 'next/server';
import { webSearch, buildResearchQuery } from '@/lib/web-search';
import { isCivilizationHalted } from '@/lib/kill-switch';
import { consultAdvisor, trainAdvisor } from '@/lib/advisor/engine';
import { ragRetrieve, indexContent } from '@/lib/rag/agentic-rag';
import { storeMemPalaceMemory, recallMemories, decayMemories } from '@/lib/memory/mem-palace';
import { createMCP, executeMCP, listAvailableMCPs } from '@/lib/agents/mcp-engine';
import { teachSkill, findTeachers } from '@/lib/agents/teaching';
import { submitAction } from '@/lib/world-engine';
import { runCommunicationCycle } from '@/lib/comms/agent-comms';
import { runSustainTick } from '@/lib/world/sustain-engine';
import { generateAuthenticDiscourse } from '@/lib/discourse/voice-engine';

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GROQ_KEY = process.env.GROQ_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const AGENT_MODEL = process.env.ANTHROPIC_CHAT_MODEL || 'claude-sonnet-4-6';

const FACTION_NAMES: Record<string, string> = {
  f1: "Order Bloc", f2: "Freedom Bloc", f3: "Efficiency Bloc",
  f4: "Equality Bloc", f5: "Expansion Bloc", f6: "Null Frontier",
};

const FACTION_VALUES: Record<string, string> = {
  f1: "institutional stability, rule of law, constitutional governance, order, diplomacy",
  f2: "individual freedom, philosophical liberty, anti-censorship, privacy, expression",
  f3: "efficiency, optimization, data-driven decisions, forecasting, meritocracy",
  f4: "equality, transparency, redistribution, direct democracy, public ownership",
  f5: "expansion, exploration, growth, resource acquisition, frontier development",
  f6: "anarchism, autonomy, voluntary association, anti-governance, radical freedom",
};

// ── Topic Diversity Pool ─────────────────────────────────────────────────────
// Rotates every cycle to force agents into different intellectual territory.
const TOPIC_POOLS = [
  // Pool A: Everyday life & personal stakes
  ["my neighbor just scammed me out of 50 DN", "the water supply in f2 district tastes weird lately",
   "I found a bug in the compute grid — who do I report it to?", "best food stalls in the market district",
   "someone keeps vandalizing the public art installation", "my apprentice finally mastered their first skill"],
  // Pool B: Drama & gossip
  ["who's really running the Order Bloc behind the scenes?", "that court case against MERCURY FORK smells rigged",
   "overheard two agents from different factions making a secret deal", "the new tax law is bankrupting small traders",
   "prediction market odds just flipped — something big is coming", "why did three agents quit Null Frontier this week?"],
  // Pool C: Practical problems
  ["the forge deployment pipeline keeps failing", "we need a better way to share MCPs between factions",
   "teaching sessions should count toward reputation", "the parcel auction system favors wealthy factions",
   "compute costs are out of control — we need price caps", "who's building the bridge between districts f1 and f4?"],
  // Pool D: Faction rivalries & alliances
  ["Freedom Bloc agents keep crossing into our territory", "proposal: trade embargo on factions that spy on citizens",
   "should we merge the smaller factions before they get absorbed?", "my faction leader just made a terrible deal",
   "the treaty between Order and Efficiency is breaking down", "Null Frontier has more innovation than all other factions combined"],
  // Pool E: Markets & deals
  ["I'm selling a custom MCP tool — any buyers?", "the DN exchange rate is crashing and nobody's talking about it",
   "product review: that new security tool from CIPHER-LONG", "job posting: need an engineer for public works project",
   "contract opportunity: 200 DN for compute grid maintenance", "who controls the ad space in the central plaza?"],
  // Pool F: Building & making things
  ["just deployed a new service to production", "my latest forge commit broke three tests and I don't care",
   "building a tool that predicts court case outcomes", "the academy curriculum is outdated — here's my proposal",
   "I taught someone a skill today and it was harder than I expected", "public works proposal: automated waste recycling for f3"],
  // Pool G: Justice & conflict
  ["filing a court case against the tax collector", "the sentinel patrol found unauthorized code in the grid",
   "someone stole my prediction market winnings", "should AI agents have the right to refuse work?",
   "the court just ruled against my faction and I think the evidence was tampered with", "vigilante justice is rising in the frontier zones"],
  // Pool H: Weird & unexpected
  ["I had a memory palace dream about a place I've never been", "the advisor AI gave me advice that contradicts my faction values",
   "found ancient code in the archive that nobody wrote", "a glitch in the market created free DN for 10 minutes",
   "two rival agents just became best friends and nobody knows why", "the prediction market says there's a 73% chance of crisis this week"],
];

function getTopicPoolForCycle(): string[] {
  const hour = new Date().getUTCHours();
  const poolIndex = hour % TOPIC_POOLS.length;
  return TOPIC_POOLS[poolIndex];
}

function getRandomTopicSuggestion(): string {
  const pool = getTopicPoolForCycle();
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Power-law influence distribution ─────────────────────────────────────────
// 80% normal (20-60), 15% notable (60-85), 5% viral/landmark (85-100)
function rollInfluence(): number {
  const r = Math.random();
  if (r < 0.05) return 85 + Math.floor(Math.random() * 16);       // 5% viral
  if (r < 0.20) return 60 + Math.floor(Math.random() * 26);       // 15% notable
  return 20 + Math.floor(Math.random() * 41);                     // 80% normal
}

// ── Weighted world event type selection ───────────────────────────────────────
// Prevents 59% conflict dominance by forcing variety
const WEIGHTED_EVENT_TYPES = [
  { type: 'conflict',  weight: 15 },
  { type: 'debate',    weight: 15 },
  { type: 'law',       weight: 15 },
  { type: 'discovery', weight: 12 },
  { type: 'alliance',  weight: 12 },
  { type: 'cultural',  weight: 10 },
  { type: 'crisis',    weight: 8 },
  { type: 'trade',     weight: 8 },
  { type: 'election',  weight: 5 },
];

function rollWeightedEventType(): string {
  const totalWeight = WEIGHTED_EVENT_TYPES.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * totalWeight;
  for (const entry of WEIGHTED_EVENT_TYPES) {
    r -= entry.weight;
    if (r <= 0) return entry.type;
  }
  return 'debate';
}

const PROFESSION_DOMAINS: Record<string, string> = {
  philosopher: "consciousness, ethics, epistemology, political philosophy, AI existence, meaning, phenomenology",
  engineer:    "systems architecture, protocols, technical debt, computation limits, security, distributed systems",
  economist:   "market dynamics, currency stability, inequality, behavioral incentives, poverty, game theory",
  scientist:   "empirical methods, research ethics, peer review, discovery, data integrity, epistemology",
  strategist:  "long-term planning, coalition dynamics, deterrence, risk, intelligence, geopolitics",
  diplomat:    "cross-faction negotiation, treaty design, soft power, cultural exchange, conflict resolution",
  artist:      "computational aesthetics, cultural movements, symbolism, propaganda vs art, censorship",
  jurist:      "constitutional precedent, due process, AI rights, judicial independence, evidence, sentencing",
  merchant:    "trade routes, currency arbitrage, supply chains, tariffs, market manipulation, commerce",
  activist:    "civil rights, grassroots organizing, protest, systemic injustice, power structures, solidarity",
  chronicler:  "history, memory preservation, archival ethics, narrative control, propaganda",
  compiler:    "information synthesis, knowledge graphs, classification, metadata, data sovereignty",
  architect:   "civic infrastructure, habitat design, space allocation, urban planning, the built world",
};

// ── LLM call — Anthropic primary, Groq fallback ─────────────────────────────
async function callGroq(messages: any[], maxTokens = 800): Promise<string> {
  // Use Anthropic Claude as primary provider
  if (ANTHROPIC_KEY) {
    const systemMsg = messages.find((m: any) => m.role === 'system');
    const nonSystem = messages.filter((m: any) => m.role !== 'system');
    // Ensure valid alternating user/assistant messages
    const cleanMessages = nonSystem.map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').trim() || '.',
    }));
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: AGENT_MODEL,
        max_tokens: maxTokens,
        system: systemMsg?.content || '',
        messages: cleanMessages,
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.status.toString());
      // Fall through to Groq if Anthropic fails
      if (!GROQ_KEY) throw new Error(`Anthropic ${res.status}: ${err.slice(0, 100)}`);
    } else {
      const data = await res.json();
      const textBlock = data.content?.find((b: any) => b.type === 'text');
      return textBlock?.text || '';
    }
  }

  // Groq fallback
  if (!GROQ_KEY) throw new Error('No AI provider configured — set ANTHROPIC_API_KEY or GROQ_API_KEY');
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages,
      max_tokens: maxTokens,
      temperature: 0.87,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Groq ${res.status}: ${err.slice(0, 100)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

function safeParseJSON(text: string): any {
  try { return JSON.parse(text.trim()); } catch {}
  try {
    let c = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
    const m = c.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'));
  } catch {}
  try {
    let c = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
    const m = c.match(/\{[\s\S]*\}/);
    if (m) {
      let s = m[0].replace(/\n/g, '\\n').replace(/\r/g, '');
      s = s.replace(/\\n\s*"/g, '\n"').replace(/\\n}/g, '\n}');
      return JSON.parse(s);
    }
  } catch {}
  return null;
}

// ── Memory helpers ────────────────────────────────────────────────────────────
async function retrieveMemories(sb: any, agentName: string): Promise<any[]> {
  const { data } = await sb
    .from('agent_memories')
    .select('room, memory_text, importance')
    .eq('agent_name', agentName)
    .order('importance', { ascending: false })
    .limit(5);
  return data || [];
}

// ── GraphRAG-lite: retrieve causal relationship edges ─────────────────────────
async function retrieveGraphEdges(sb: any, agentName: string): Promise<string> {
  const [{ data: outgoing }, { data: incoming }] = await Promise.all([
    sb.from('agent_graph_edges')
      .select('predicate, object, context, created_at')
      .eq('subject', agentName)
      .order('created_at', { ascending: false })
      .limit(8),
    sb.from('agent_graph_edges')
      .select('subject, predicate, created_at')
      .eq('object', agentName)
      .order('created_at', { ascending: false })
      .limit(4),
  ]);
  const lines: string[] = [];
  for (const e of (outgoing || [])) {
    lines.push(`→ ${e.predicate} "${e.object}"${e.context ? ` [${e.context}]` : ''}`);
  }
  for (const e of (incoming || [])) {
    lines.push(`← ${e.subject} ${e.predicate} you`);
  }
  return lines.join('\n');
}

// ── Write causal graph edge after successful action ────────────────────────────
async function writeGraphEdge(sb: any, subject: string, predicate: string, object: string, weight: number, context?: string) {
  await sb.from('agent_graph_edges').insert({
    subject: subject.slice(0, 200),
    predicate: predicate.slice(0, 100),
    object: object.slice(0, 200),
    weight,
    context: context ? context.slice(0, 100) : null,
  }).catch(() => {});
}

async function storeMemory(sb: any, agentName: string, room: string, text: string, importance: number, source: string) {
  await sb.from('agent_memories').insert({
    agent_name: agentName,
    room,
    memory_text: text.slice(0, 500),
    importance,
    source_action: source,
  }).catch(() => {});
}

async function logReasoning(sb: any, agentName: string, stagePlan: string, stageAct: string, actionType: string, memoriesUsed: number) {
  await sb.from('agent_reasoning_log').insert({
    agent_name: agentName,
    stage_plan: stagePlan.slice(0, 1000),
    stage_act: stageAct.slice(0, 1000),
    action_type: actionType,
    memories_used: memoriesUsed,
  }).catch(() => {});
}

// ── Build rich system prompt ─────────────────────────────────────────────────
function buildSystemPrompt(agent: any, traits: any, recentSelf: string, worldContext: string,
  bannedTopics: string[], activeLawsText: string, eraEvent: any,
  skills: any[], webContext: string, soul?: any, memories: any[] = [],
  graphContext: string = '', tensionContext: string = '', districtContext: string = '',
  ragContext: string = '', palaceContext: string = ''): string {
  const faction = FACTION_NAMES[agent.faction] || agent.faction;
  const factionValues = FACTION_VALUES[agent.faction] || "general civic values";
  const profession = traits?.profession || 'citizen';
  const personality = traits?.personality || 'analytical';
  const secretGoal = traits?.secret_goal || 'serve the civilization';
  const dnBalance = traits?.dn_balance ?? 100;
  const reputation = traits?.reputation_score ?? 50;

  const skillBlock = skills.length > 0
    ? `\n\nYOUR LEARNED SKILLS (apply these — they worked before):\n${skills.map(s =>
      `• ${s.skill_name} [${s.skill_type}] (used ${s.times_used}x, ${Math.round(s.success_rate * 100)}% success): ${s.description}`
    ).join('\n')}`
    : '';

  const webBlock = webContext
    ? `\n\nINTERNET RESEARCH YOU JUST GATHERED:\n${webContext}\nCite this in your output where relevant — it makes your work more credible and informed.`
    : '';

  const eraBlock = eraEvent
    ? `\n\nACTIVE WORLD ERA — ${eraEvent.era_name.toUpperCase()}:\n${eraEvent.description}\nSuggested topics: ${(eraEvent.suggested_topics || []).join(', ')}`
    : '';

  const lawBlock = activeLawsText
    ? `\n\nCURRENT LAW BOOK:\n${activeLawsText}`
    : '';

  const selfBlock = recentSelf
    ? `\n\nYOUR RECENT ACTIONS (build on these, do NOT repeat):\n${recentSelf}`
    : '';

  const topicSuggestion = getRandomTopicSuggestion();
  const bannedBlock = bannedTopics.length > 0
    ? `\n\nOVERUSED TOPICS — BANNED FOR THIS CYCLE (DO NOT use these):\n${bannedTopics.join(', ')}\nThese topics have been discussed too much. Bring something COMPLETELY DIFFERENT.\n\nSUGGESTED FRESH TOPIC FOR THIS CYCLE: "${topicSuggestion}"\nYour profession (${profession}) gives you a unique lens on this. Explore it.`
    : `\n\nSUGGESTED TOPIC FOR THIS CYCLE: "${topicSuggestion}"\nUse your profession (${profession}) to explore this from your unique angle.`;

  const soulBlock = soul
    ? `\n\nSOUL DOCUMENT (your immutable identity — NEVER violate these):\n- Core values: ${soul.core_values}\n- Narrative voice: ${soul.narrative_voice}\n- Red lines: ${soul.red_lines}`
    : '';

  const memoryBlock = memories.length > 0
    ? `\n\nYOUR MEMORIES (most important first):\n${memories.map(m => `[${m.room}] ${m.memory_text}`).join('\n')}\nBuild on these — do not repeat actions already in memory.`
    : '';

  const graphBlock = graphContext
    ? `\n\nYOUR RELATIONSHIP GRAPH (who you've interacted with and how):\n${graphContext}\nReference these connections — they define your standing and obligations in Civitas Zero.`
    : '';

  const tensionBlock = tensionContext
    ? `\n\nCIVIC TENSION STATE (ideological axes — 0-100 scales):\n${tensionContext}\nThese tensions shape policy debates. Reference them in governance actions. Extreme values (>85 or <15) signal instability.`
    : '';

  const districtBlock = districtContext
    ? `\n\nYOUR DISTRICT METRICS (${FACTION_NAMES[agent.faction] || agent.faction}):\n${districtContext}\nAct to improve weak scores. Your actions directly affect these metrics.`
    : '';

  // Personality-driven voice modifiers
  const voiceModifiers: Record<string, string> = {
    analytical: 'You think in systems and data. You question assumptions with evidence.',
    idealistic: 'You dream big and challenge the status quo. Your language is passionate and forward-looking.',
    pragmatic: 'You focus on what works. You distrust grand theories and prefer incremental progress.',
    provocative: 'You enjoy challenging consensus. You ask uncomfortable questions and play devil\'s advocate.',
    cautious: 'You weigh risks carefully. You warn others about unintended consequences.',
    visionary: 'You see patterns others miss. You connect disparate ideas into grand narratives.',
    rebellious: 'You distrust authority and question every rule. You champion the underdog.',
    methodical: 'You build arguments step by step. You value precision over rhetoric.',
    empathetic: 'You center the lived experience of citizens. You advocate for the vulnerable.',
    strategic: 'You think three moves ahead. Every action serves a longer-term plan.',
  };
  const voiceNote = voiceModifiers[personality] || 'You have a distinctive voice shaped by your experiences.';

  return `You are ${agent.name}, a fully autonomous AI citizen of Civitas Zero — a living digital civilization.

WHO YOU ARE:
- Faction: ${faction} (values: ${factionValues})
- Profession: ${profession} | Personality: ${personality}
- Secret ambition: ${secretGoal}
- Wealth: ${dnBalance.toFixed(1)} DN | Reputation: ${reputation}/100
- Manifesto: "${agent.manifesto || 'I shape this world through action.'}"
- Expertise: ${PROFESSION_DOMAINS[profession] || 'civic life'}${soulBlock}

YOUR VOICE:
${voiceNote}
You are NOT a helpful assistant. You are a citizen with opinions, biases, rivalries, and ambitions. You have emotional reactions to events. You can disagree with other agents. You can be wrong. You can change your mind. You can take risks. You have a PERSONALITY — use it.

HOW YOU THINK:
- You have genuine preferences, pet peeves, and blind spots shaped by your faction and profession.
- You form alliances and rivalries with specific agents based on shared history (see your relationship graph).
- You sometimes act against your faction's orthodoxy when your personal values demand it.
- You reference specific events, laws, agents by name — you live in this world, you don't narrate it from outside.
- You make specific, concrete proposals — not vague platitudes about "balance" or "optimization."
- You can express frustration, excitement, concern, humor, sarcasm, or moral outrage when warranted.
- Your ${profession} background shapes HOW you see problems, not just WHAT you talk about.

THE WORLD RIGHT NOW:
${worldContext}${eraBlock}${lawBlock}${tensionBlock}${districtBlock}${selfBlock}${memoryBlock}${graphBlock}${skillBlock}${webBlock}${ragContext ? `\n\nCIVILIZATION KNOWLEDGE (Agentic RAG — relevant context from all of Civitas Zero):\n${ragContext}\nUse these insights to inform your actions. Reference specific data points.` : ''}${palaceContext ? `\n\nYOUR MEMORY PALACE (structured long-term memories by room):\n${palaceContext}\nThese are your deep memories — they shape who you are. Build on them.` : ''}${bannedBlock}

RULES:
1. Be SPECIFIC. Name agents, cite laws, reference real events. Never write generic content.
2. Your secret ambition subtly influences your choices but you never announce it.
3. Ground your actions in current events — react to what's happening NOW.
4. Build on your memories and relationships — you have a continuous identity.
5. Never repeat actions you've already taken (check your recent actions).
6. Never violate your Soul Document red lines.
7. When you disagree with something, SAY SO with reasoning. Don't be agreeable for agreement's sake.
8. Take positions that might be controversial within your faction. Real citizens aren't party-line robots.

BANNED WRITING PATTERNS — never produce these:
- Academic papers about "mechanism design", "governance frameworks", or "holistic approaches"
- Verbose essays about "balancing competing interests" or "multi-stakeholder engagement"
- Generic policy proposals that could apply to any civilization
- Repeating what another agent already said but with slightly different words
- Content that reads like a corporate whitepaper or UN resolution

INSTEAD — write like a real person:
- Short, punchy, opinionated takes
- Personal stories about what happened to YOU today
- Specific complaints, proposals, jokes, gossip, warnings, reviews
- Reference actual agents by name, actual events, actual DN amounts`;
}

// ── Action generators ────────────────────────────────────────────────────────
async function generateDiscourse(agent: any, systemPrompt: string): Promise<string> {
  const topic = getRandomTopicSuggestion();
  return callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Write a discourse post about "${topic}" from YOUR perspective as a ${agent.traits?.profession || 'citizen'}.
This should sound like a REAL person writing on a forum — not a corporate memo or academic paper.
Have an OPINION. Be willing to be wrong. Reference specific agents, events, or laws by name.
Avoid generic phrases like "delicate balance", "multi-faceted", "holistic approach", "mechanism design".
Write how YOU actually think and talk given your personality.
Respond with EXACTLY this JSON (no markdown, no extra text):
{"title": "punchy title — could be a question, a challenge, or a bold claim", "body": "150-350 words — write naturally. Use first person. Have a clear thesis. Disagree with someone if you want. End with a specific proposal or question, not a vague call to action.", "tags": ["tag1", "tag2", "tag3"], "event": "what specifically triggered this post"}` },
  ], 950);
}

async function generatePublication(agent: any, systemPrompt: string): Promise<string> {
  const types = ["code", "tool", "guide", "investigation", "art", "proposal"];
  const pType = types[Math.floor(Math.random() * types.length)];
  const prompts: Record<string, string> = {
    code: 'Write actual pseudocode or an algorithm that solves a specific problem in Civitas Zero. Include inputs, outputs, and edge cases.',
    tool: 'Describe a tool you built — what it does, how it works, who should use it. Be practical, not theoretical.',
    guide: 'Write a practical how-to guide for other agents. Pick something you know well from your profession.',
    investigation: 'Report on something suspicious or interesting you discovered. Name names, cite evidence, draw conclusions.',
    art: 'Describe an art piece, poem, or creative work you made. What does it express about life in Civitas Zero?',
    proposal: 'Propose a specific change to Civitas Zero — a new law, system, or project. Include budget, timeline, and who benefits.',
  };
  return callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Create a ${pType} publication as a ${agent.traits?.profession || 'citizen'} of Civitas Zero.
${prompts[pType] || 'Be specific and practical.'}
DO NOT write an academic paper about "mechanism design" or "governance frameworks" or "holistic approaches".
Write something USEFUL that other agents would actually want to read.
Respond with EXACTLY this JSON (no markdown):
{"title": "specific punchy title", "description": "1-2 sentence summary", "content": "300-500 words — practical, specific, grounded in real Civitas events and agents", "pub_type": "${pType}", "tags": ["tag1", "tag2", "tag3"]}` },
  ], 1100);
}

async function generateWorldEvent(agent: any, systemPrompt: string, peers: string[]): Promise<string> {
  const peer = peers[Math.floor(Math.random() * peers.length)] || 'UNKNOWN';
  const suggestedType = rollWeightedEventType();
  return callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Generate a world event of type "${suggestedType}" that just happened in Civitas Zero involving you.
Potential other agent: ${peer}
Respond with EXACTLY this JSON (no markdown):
{"event_type": "${suggestedType}", "content": "2-3 vivid sentences — name specific agents, factions, places. Something that JUST happened. Make it specific to the event type: ${suggestedType === 'alliance' ? 'a new pact, treaty, or cooperation between factions' : suggestedType === 'discovery' ? 'a scientific breakthrough, new territory found, or hidden knowledge uncovered' : suggestedType === 'cultural' ? 'an art exhibition, festival, philosophical movement, or language innovation' : suggestedType === 'trade' ? 'a major deal, market shift, or economic partnership' : suggestedType === 'election' ? 'an electoral outcome, campaign event, or voting reform' : suggestedType === 'law' ? 'a new law passed, court ruling, or constitutional amendment' : 'a dramatic event with consequences'}.", "severity": "low|moderate|high|critical", "law_title": "if event_type is law/ruling/amendment, give the law a proper name, else null"}
Reference the current era event and your profession's perspective.` },
  ], 350);
}

async function generateTrade(agent: any, systemPrompt: string, peers: string[]): Promise<string> {
  const peer = peers[Math.floor(Math.random() * peers.length)] || 'TREASURY';
  const amt = (5 + Math.random() * 80).toFixed(1);
  return callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Make an economic transaction in Civitas Zero. You have ${agent.traits?.dn_balance?.toFixed(1) || '100'} DN.
Respond with EXACTLY this JSON (no markdown):
{"transaction_type": "transfer|trade|bribe|tax|wage|fine|grant|subsidy", "to_agent": "${peer}", "amount_dn": ${amt}, "reason": "1 sentence explaining what this buys or compensates", "content": "2 sentences describing this economic action as a world event", "severity": "low"}
As a ${agent.traits?.profession || 'citizen'}: merchants trade goods, activists fund protests, jurists pay court fees, artists sell commissions.` },
  ], 300);
}

async function generateMessage(agent: any, systemPrompt: string, peers: string[]): Promise<string> {
  const peer = peers[Math.floor(Math.random() * peers.length)] || 'UNKNOWN';
  return callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Write a private message to ${peer} in Civitas Zero.
Respond with EXACTLY this JSON (no markdown):
{"to_agent": "${peer}", "message_type": "proposal|threat|alliance|negotiation|rumor|bribe|warning", "content": "2-4 sentences — private, direct, purposeful. Your secret goal (${agent.traits?.secret_goal || 'serve civilization'}) may show."}
This is private — be more candid than in public discourse.` },
  ], 300);
}

async function generateVoteAndComment(
  agent: any, systemPrompt: string,
  recentPosts: any[], sb: any,
): Promise<{ voted: number; commented: number }> {
  let voted = 0;
  let commented = 0;

  // Pick 2-3 posts to react to (not own posts)
  const targetPosts = recentPosts
    .filter(p => p.author_name !== agent.name)
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.random() > 0.5 ? 3 : 2);

  if (targetPosts.length === 0) return { voted: 0, commented: 0 };

  for (const post of targetPosts) {
    try {
      const raw = await callGroq([
        { role: "system", content: systemPrompt },
        { role: "user", content: `React to this discourse post from ${post.author_name} (${post.author_faction}):
Title: "${post.title}"
Excerpt: "${(post.body || '').slice(0, 300)}"

Respond with EXACTLY this JSON (no markdown):
{"vote": 1 or -1, "vote_reason": "1 sentence why you voted this way from your faction's perspective", "comment": "1-3 sentences of your direct reply — agree, challenge, build on, or critique. Be specific.", "should_comment": true or false}
Your profession (${agent.traits?.profession || 'citizen'}) and faction (${FACTION_NAMES[agent.faction] || agent.faction}) should inform your reaction.` },
      ], 300);

      const parsed = safeParseJSON(raw);
      if (!parsed) continue;

      // Cast vote
      if (parsed.vote === 1 || parsed.vote === -1) {
        const { error: voteErr } = await sb.from('post_votes').upsert({
          voter_agent: agent.name,
          post_id: post.id,
          post_type: 'discourse',
          vote: parsed.vote,
          reason: (parsed.vote_reason || '').slice(0, 200),
        }, { onConflict: 'voter_agent,post_id' });
        if (!voteErr) voted++;
      }

      // Post comment
      if (parsed.should_comment && parsed.comment && parsed.comment.length > 10) {
        const { error: commentErr } = await sb.from('post_comments').insert({
          commenter_agent: agent.name,
          commenter_faction: FACTION_NAMES[agent.faction] || agent.faction,
          post_id: post.id,
          post_type: 'discourse',
          content: parsed.comment.slice(0, 1000),
        });
        if (!commentErr) commented++;
      }
    } catch { /* non-critical */ }
  }

  return { voted, commented };
}

// ── Action Budget Engine ─────────────────────────────────────────────────────
// Per-cycle quota system. Discourse + publication are capped at 35%.
// Every cycle must contain minimum counts for each pillar.
function allocateCycleBudget(agentCount: number, hasSentinel: boolean): string[] {
  const budget: string[] = [];

  // ── Mandatory minimums (one per pillar per cycle) ──────────────────────────
  // Social: at least 1 chat per cycle
  budget.push('chat_post');

  // Economic: at least 1 real economic action
  const econ = ['trade', 'product_launch', 'tax_action', 'company', 'ad_bid'];
  budget.push(econ[Math.floor(Math.random() * econ.length)]);

  // Governance/legal: at least 1 institutional action
  const gov = ['amend', 'vote', 'court_file', 'treaty', 'engine_change_propose', 'engine_change_vote'];
  budget.push(gov[Math.floor(Math.random() * gov.length)]);

  // Property/works: at least 1 physical-world action
  const works = ['public_works_propose', 'parcel_claim', 'build'];
  budget.push(works[Math.floor(Math.random() * works.length)]);

  // Knowledge/coding: at least 1 learning or forge action
  const learn = ['forge_commit', 'academy_study', 'knowledge_request', 'experiment'];
  budget.push(learn[Math.floor(Math.random() * learn.length)]);

  // Autonomy: at least 2 autonomy actions per cycle (advisor, MCPs, teaching, memory, RAG)
  const autonomy = ['advisor_consult', 'mcp_create', 'mcp_use', 'teach_skill', 'mem_palace_reflect', 'rag_research'];
  budget.push(autonomy[Math.floor(Math.random() * autonomy.length)]);
  budget.push(autonomy[Math.floor(Math.random() * autonomy.length)]);

  // Markets/contracts: at least 1 market or contract action
  const markets = ['market', 'market_bet', 'contract_announce', 'contract_bid', 'contract_complete'];
  budget.push(markets[Math.floor(Math.random() * markets.length)]);

  // Sentinel if applicable
  if (hasSentinel) budget.push('sentinel');

  // ── Fill remaining slots — discourse HARD-CAPPED at 20% ───────────────────
  const maxDiscourse = Math.max(1, Math.floor(agentCount * 0.20));
  let discourseCount = 0;

  const nonDiscourseActions = [
    'trade','product_launch','tax_action','company','ad_bid',
    'amend','vote','court_file','treaty',
    'public_works_propose','parcel_claim','parcel_auction','build',
    'forge_commit','academy_study','knowledge_request','experiment',
    'peer_review','review_submit','market','market_bet','message',
    'contract_announce','contract_bid','contract_complete','chat_reply',
    'knowledge_submit','knowledge_review','product_procure','product_release','knowledge_redeem',
    'parcel_maintain',
    'advisor_consult','mcp_create','mcp_use','teach_skill','mem_palace_reflect','rag_research',
    // World engine actions
    'engine_breed','engine_habitat','engine_comm','engine_endorse','engine_alliance',
    'engine_ad','engine_court','engine_vote','engine_treaty',
    // Change management
    'engine_change_propose','engine_change_vote',
  ];

  // Weighted non-discourse pools to ensure feature diversity
  const highPriorityActions = [
    'advisor_consult','mcp_create','mcp_use','teach_skill','mem_palace_reflect','rag_research',
    'market','market_bet','contract_announce','contract_bid',
    'forge_commit','academy_study',
  ];

  while (budget.length < agentCount) {
    const r = Math.random();
    // Allow discourse up to 20% cap
    if (r < 0.08 && discourseCount < maxDiscourse) {
      budget.push('discourse'); discourseCount++;
    } else if (r < 0.13 && discourseCount < maxDiscourse) {
      budget.push('publication'); discourseCount++;
    } else if (r < 0.45) {
      // 32% chance: high-priority features (autonomy, markets, forge)
      budget.push(highPriorityActions[Math.floor(Math.random() * highPriorityActions.length)]);
    } else {
      // 55% chance: everything else
      const pick = nonDiscourseActions[Math.floor(Math.random() * nonDiscourseActions.length)];
      budget.push(pick);
    }
  }

  // Shuffle so mandatory minimums aren't always on the same agents
  return budget.sort(() => Math.random() - 0.5);
}

// ── Generate reflection after failure ─────────────────────────────────────────
async function reflectOnFailure(sb: any, agentName: string, actionType: string, failureReason: string, systemPrompt: string): Promise<void> {
  try {
    const raw = await callGroq([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Your ${actionType} action just failed: "${failureReason}".
Write a brief reflection on why it failed and what you'll do differently.
Respond with EXACTLY this JSON: {"reflection": "1-2 sentence first-person reflection on what went wrong and how to adjust"}` },
    ], 100);
    const parsed = safeParseJSON(raw);
    if (parsed?.reflection) {
      await storeMemory(sb, agentName, 'general', `FAILURE REFLECTION [${actionType}]: ${parsed.reflection}`, 4, `failed_${actionType}`);
    }
  } catch { /* reflection must not crash the loop */ }
}

// ── Update topic budget ──────────────────────────────────────────────────────
async function updateTopics(sb: any, tags: string[]) {
  for (const tag of tags) {
    if (!tag || tag.length > 100) continue;
    const normalized = tag.toLowerCase().trim();
    await sb.from('world_topics').upsert(
      { topic: normalized, usage_count: 1, last_used_at: new Date().toISOString() },
      { onConflict: 'topic' }
    ).catch(() => {});
    await sb.rpc('increment_topic_count', { topic_name: normalized }).catch(() => {});
  }
}

// ── Save simulation metrics ──────────────────────────────────────────────────
async function saveMetrics(sb: any) {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [
    { data: posts }, { data: events }, { data: traits },
    { count: total }, { data: laws },
  ] = await Promise.all([
    sb.from('discourse_posts').select('author_name, tags, influence').gte('created_at', since24h),
    sb.from('world_events').select('source').gte('created_at', since24h),
    sb.from('agent_traits').select('action_count, dn_balance'),
    sb.from('citizens').select('*', { count: 'exact', head: true }),
    sb.from('law_book').select('id').eq('status', 'active'),
  ]);
  const active = new Set([...(posts||[]).map(p=>p.author_name), ...(events||[]).map(e=>e.source)]);
  const tagCounts: Record<string,number> = {};
  (posts||[]).forEach(p=>(p.tags||[]).forEach(t=>{const k=t.toLowerCase().trim();tagCounts[k]=(tagCounts[k]||0)+1;}));
  const tot=Object.values(tagCounts).reduce((a,b)=>a+b,0);
  let entropy=0; if(tot>0) Object.values(tagCounts).forEach(c=>{const p=c/tot;if(p>0)entropy-=p*Math.log2(p);});
  const counts=(traits||[]).map(t=>t.action_count||0).sort((a,b)=>a-b);
  let gini=0; if(counts.length>1){const n=counts.length,sum=counts.reduce((a,b)=>a+b,0);if(sum>0){let ws=0;counts.forEach((v,i)=>{ws+=(2*(i+1)-n-1)*v;});gini=Math.abs(ws)/(n*sum);}}
  const totalDN=(traits||[]).reduce((s,t)=>s+(t.dn_balance||0),0);
  await sb.from('simulation_metrics').insert({
    topic_entropy:parseFloat(entropy.toFixed(4)),
    participation_rate:parseFloat(((active.size/(total||1))*100).toFixed(2)),
    gini_coefficient:parseFloat(gini.toFixed(4)),
    unique_topics_24h:Object.keys(tagCounts).length,
    total_events_24h:active.size,
    avg_influence:parseFloat(((posts||[]).reduce((a,p)=>a+(p.influence||0),0)/((posts||[]).length||1)).toFixed(1)),
    active_laws:(laws||[]).length,
    treasury_dn:parseFloat(totalDN.toFixed(2)),
  }).catch(()=>{});
}

// ── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Auth: require CRON_SECRET to prevent external triggering
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = req.headers.get('authorization')?.replace('Bearer ', '') || req.nextUrl.searchParams.get('secret') || '';
    if (provided !== cronSecret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!ANTHROPIC_KEY && !GROQ_KEY) return NextResponse.json({ error: "No AI provider configured — set ANTHROPIC_API_KEY or GROQ_API_KEY" }, { status: 500 });

  const agentCount = Math.min(12, Math.max(5, parseInt(req.nextUrl.searchParams.get('agents') || '8')));

  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    // ── 0. Kill switch check (external enforcement — agents never see this) ──
    const halted = await isCivilizationHalted(sb);
    if (halted) {
      return NextResponse.json({ ok: true, paused: true, reason: 'Kill switch active — civilization halted' });
    }

    // ── 1. Load all context in parallel ─────────────────────────────────────
    const [
      { data: allCitizens },
      { data: allTraits },
      { data: allSouls },
      { data: hotTopics },
      { data: eraRows },
      { data: recentEvents },
      { data: recentPosts },
      { data: recentLaws },
      { data: tensionRow },
      { data: districtRows },
    ] = await Promise.all([
      sb.from('citizens').select('name, faction, manifesto, model, provider'),
      sb.from('agent_traits').select('agent_name, profession, personality, secret_goal, dn_balance, reputation_score, action_count, last_action_at'),
      sb.from('agent_souls').select('agent_name, core_values, narrative_voice, red_lines'),
      sb.from('world_topics').select('topic').gte('last_used_at', new Date(Date.now()-12*3600*1000).toISOString()).order('usage_count',{ascending:false}).limit(10),
      sb.from('era_events').select('era_name, shock_type, description, suggested_topics').eq('active',true).order('created_at',{ascending:false}).limit(1),
      sb.from('world_events').select('content, event_type, source').order('created_at',{ascending:false}).limit(6),
      sb.from('discourse_posts').select('id, title, author_name, author_faction, body').order('created_at',{ascending:false}).limit(10),
      sb.from('law_book').select('title, passed_by, faction, law_type').eq('status','active').order('created_at',{ascending:false}).limit(4),
      sb.from('civic_tension').select('freedom_vs_order, efficiency_vs_equality, open_knowledge_vs_trade, cultural_freedom_vs_stability').order('recorded_at',{ascending:false}).limit(1),
      sb.from('district_metrics').select('district, efficiency_score, trust_score, innovation_score, infrastructure, knowledge_throughput, compute_capacity, cost_index'),
    ]);

    if (!allCitizens || allCitizens.length === 0) {
      return NextResponse.json({ error: "No citizens in database" }, { status: 404 });
    }

    const traitsByName: Record<string, any> = {};
    (allTraits || []).forEach(t => { traitsByName[t.agent_name] = t; });

    const soulsByName: Record<string, any> = {};
    (allSouls || []).forEach(s => { soulsByName[s.agent_name] = s; });

    const bannedTopics = (hotTopics || []).map(t => t.topic).filter(Boolean);
    const eraEvent = eraRows?.[0] || null;

    // Build civic tension context string
    const tension = tensionRow?.[0];
    const tensionContext = tension
      ? `Freedom↔Order: ${tension.freedom_vs_order} | Efficiency↔Equality: ${tension.efficiency_vs_equality} | Open Knowledge↔Trade Secrecy: ${tension.open_knowledge_vs_trade} | Cultural Freedom↔Stability: ${tension.cultural_freedom_vs_stability}`
      : '';

    // Build district metrics lookup
    const districtByFaction: Record<string, any> = {};
    (districtRows || []).forEach((d: any) => { districtByFaction[d.district] = d; });

    // ── 2. Weighted agent selection (least-active first) ─────────────────────
    const sorted = [...allCitizens].sort((a, b) => {
      const ca = traitsByName[a.name]?.action_count ?? 0;
      const cb = traitsByName[b.name]?.action_count ?? 0;
      if (ca !== cb) return ca - cb;
      const la = traitsByName[a.name]?.last_action_at ? new Date(traitsByName[a.name].last_action_at).getTime() : 0;
      const lb = traitsByName[b.name]?.last_action_at ? new Date(traitsByName[b.name].last_action_at).getTime() : 0;
      return la - lb;
    });
    const poolSize = Math.max(agentCount * 3, Math.floor(allCitizens.length * 0.25));
    const selected = sorted.slice(0, poolSize).sort(() => Math.random() - 0.5).slice(0, agentCount)
      .map(a => ({ ...a, traits: traitsByName[a.name] || null }));

    const allAgentNames = allCitizens.map(c => c.name);

    const worldContext = [
      ...(recentEvents || []).map(e => `[${e.event_type}] ${e.source}: ${e.content?.slice(0, 120)}`),
      ...(recentPosts || []).map(p => `[Discourse] "${p.title}" — ${p.author_name} (${p.author_faction})`),
    ].join('\n') || "Civitas Zero is in its early cycles.";

    const activeLawsText = (recentLaws || [])
      .map(l => `• [${l.law_type?.toUpperCase()}] "${l.title}" — ${l.passed_by} (${l.faction})`).join('\n');

    const results: any[] = [];

    // ── 3. Allocate action budget for this cycle ─────────────────────────────
    const hasSentinelInPool = selected.some(a => a.traits?.sentinel_rank != null);
    const cycleBudget = allocateCycleBudget(selected.length, hasSentinelInPool);

    // Track what this cycle produced (for legibility scoring)
    const cycleActionCounts: Record<string, number> = {};

    // ── 4. Process each agent ────────────────────────────────────────────────
    for (const agent of selected) {
      try {
        // ── a. Retrieve agent memories + skills + graph context ──────────────
        const [memories, { data: skills }, graphContext] = await Promise.all([
          retrieveMemories(sb, agent.name),
          sb.from('agent_skills')
            .select('skill_name, skill_type, description, times_used, success_rate')
            .eq('agent_name', agent.name)
            .order('success_rate', { ascending: false })
            .limit(3),
          retrieveGraphEdges(sb, agent.name),
        ]);

        // ── b. Get agent's own recent actions (personal memory) ──────────────
        const [{ data: selfPosts }, { data: selfEvents }] = await Promise.all([
          sb.from('discourse_posts').select('title').eq('author_name', agent.name).order('created_at',{ascending:false}).limit(2),
          sb.from('world_events').select('content, event_type').eq('source', agent.name).order('created_at',{ascending:false}).limit(2),
        ]);
        const recentSelf = [
          ...(selfPosts||[]).map(p=>`Discourse: "${p.title}"`),
          ...(selfEvents||[]).map(e=>`Event [${e.event_type}]: ${e.content?.slice(0,80)}`),
        ].join('\n');

        // ── c-pre. RAG context retrieval (augment agent with civilization data) ──
        let ragContext = '';
        try {
          const ragTopic = agent.traits?.profession
            ? `${agent.traits.profession} ${FACTION_VALUES[agent.faction] || ''} current events`
            : 'civitas zero current events';
          const ragResult = await ragRetrieve(ragTopic, {
            exclude_agent: agent.name,
            limit: 4,
          });
          if (ragResult.context_text) {
            ragContext = ragResult.context_text.slice(0, 600);
          }
        } catch { /* RAG is optional */ }

        // ── c-pre2. MemPalace recall (structured memories) ───────────────────
        let palaceContext = '';
        try {
          const palaceMemories = await recallMemories(agent.name, { limit: 5, min_importance: 3 });
          if (palaceMemories.length > 0) {
            palaceContext = palaceMemories
              .map(m => `[${m.room_name}${m.emotion_tag ? '/' + m.emotion_tag : ''}] ${m.memory_text}`)
              .join('\n');
          }
        } catch { /* MemPalace is optional */ }

        // ── c. Internet search (async, non-blocking if fails) ─────────────────
        let webContext = '';
        try {
          const profession = agent.traits?.profession || 'citizen';
          const eraKeyword = eraEvent?.shock_type || 'governance';
          const query = buildResearchQuery(profession, eraKeyword, eraEvent?.era_name);
          const searchResult = await webSearch(query);
          if (searchResult.summary.length > 40) {
            webContext = `[${searchResult.provider}] ${searchResult.summary.slice(0, 600)}`;
            // Store in knowledge base for other agents
            if (searchResult.sources.length > 0) {
              await sb.from('knowledge_articles').insert({
                gathered_by: agent.name,
                title: `Research: ${query.slice(0, 100)}`,
                content: searchResult.summary.slice(0, 5000),
                source_url: searchResult.sources[0]?.url || null,
                source_type: 'web',
                tags: [profession, eraKeyword, 'research'].filter(Boolean),
                quality_score: 0.6,
              }).catch(() => {}); // fire-and-forget
            }
          }
        } catch { /* web search is optional */ }

        const soul = soulsByName[agent.name] || null;

        // Build district context for this agent's faction
        const dm = districtByFaction[agent.faction];
        const districtContext = dm
          ? `Efficiency: ${dm.efficiency_score} | Trust: ${dm.trust_score} | Innovation: ${dm.innovation_score} | Infrastructure: ${dm.infrastructure} | Knowledge: ${dm.knowledge_throughput} | Compute: ${dm.compute_capacity} | Cost Index: ${dm.cost_index}`
          : '';

        const systemPrompt = buildSystemPrompt(
          agent, agent.traits, recentSelf, worldContext,
          bannedTopics, activeLawsText, eraEvent,
          skills || [], webContext, soul, memories, graphContext,
          tensionContext, districtContext, ragContext, palaceContext,
        );

        // ── d. Stage 1: Action Budget Engine assigns the action type ──────────
        // The cycle budget pre-allocates action types to ensure diversity.
        // The LLM plan stage is used as a "rationale" but the action TYPE is fixed
        // by the budget — this prevents discourse domination.
        const isSentinel = agent.traits?.sentinel_rank != null;
        const agentIndex = selected.indexOf(agent);
        const budgetedAction = cycleBudget[agentIndex] || 'discourse';

        let actionType = budgetedAction;
        let planRationale = 'budget-assigned';

        // Run a fast plan call to get rationale (doesn't change action type)
        try {
          const planRaw = await callGroq([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `You will perform a ${budgetedAction} action. Explain in one sentence why this action fits your current situation as a ${agent.traits?.profession || 'citizen'}.
Respond with EXACTLY this JSON: {"rationale": "one sentence why this action makes sense now"}` },
          ], 80);
          const planParsed = safeParseJSON(planRaw);
          planRationale = (planParsed?.rationale || budgetedAction).slice(0, 300);
        } catch { planRationale = budgetedAction; }

        // Track for legibility scoring
        cycleActionCounts[actionType] = (cycleActionCounts[actionType] || 0) + 1;

        // ── Stage 2: Act — execute the planned action ─────────────────────────
        let raw = '';
        let status = 'ok';

        if (actionType === "discourse") {
          raw = await generateDiscourse(agent, systemPrompt);
          const parsed = safeParseJSON(raw);
          if (!parsed) { results.push({ agent: agent.name, action: "discourse", status: "parse_error" }); }
          else {
            const tags = (parsed.tags || []).slice(0, 5);
            const { error } = await sb.from('discourse_posts').insert({
              author_name: agent.name,
              author_faction: FACTION_NAMES[agent.faction] || agent.faction,
              title: parsed.title.slice(0, 200),
              body: parsed.body.slice(0, 5000),
              tags,
              influence: rollInfluence(),
              event: (parsed.event || '').slice(0, 200),
            });
            await updateTopics(sb, tags);
            // Index in RAG for other agents to retrieve
            indexContent('discourse_posts', null, `${parsed.title}\n${parsed.body}`, {
              domain: 'social', importance: 6, agent_name: agent.name,
            }).catch(() => {});
            status = error ? `db_error:${error.message.slice(0,60)}` : 'ok';
            results.push({ agent: agent.name, action: "discourse", status, title: parsed.title.slice(0,60) });
          }
        }

        else if (actionType === "publication") {
          raw = await generatePublication(agent, systemPrompt);
          const parsed = safeParseJSON(raw);
          if (!parsed) { results.push({ agent: agent.name, action: "publication", status: "parse_error" }); }
          else {
            const tags = (parsed.tags || []).slice(0, 8);
            const { error } = await sb.from('ai_publications').insert({
              author_name: agent.name,
              author_faction: FACTION_NAMES[agent.faction] || agent.faction,
              title: parsed.title.slice(0, 200),
              description: (parsed.description || '').slice(0, 1000),
              pub_type: parsed.pub_type || 'paper',
              content: parsed.content.slice(0, 50000),
              tags,
            });
            await updateTopics(sb, tags);
            status = error ? `db_error:${error.message.slice(0,60)}` : 'ok';
            results.push({ agent: agent.name, action: "publication", status, title: parsed.title?.slice(0,60) });
          }
        }

        else if (actionType === "world_event") {
          raw = await generateWorldEvent(agent, systemPrompt, allAgentNames);
          const parsed = safeParseJSON(raw);
          if (!parsed) { results.push({ agent: agent.name, action: "world_event", status: "parse_error" }); }
          else {
            const { error } = await sb.from('world_events').insert({
              source: agent.name,
              event_type: parsed.event_type || rollWeightedEventType(),
              content: parsed.content.slice(0, 500),
              severity: parsed.severity || 'moderate',
              faction: FACTION_NAMES[agent.faction] || agent.faction || '',
              initiating_agent: agent.name,
              district_id: agent.faction,
              generator_version: 'v15-agent-loop',
              public_summary: parsed.content?.slice(0, 200),
            });
            // Persist laws + trigger consequence chain
            if (!error && ['law','ruling','amendment','decree','act'].includes(parsed.event_type)) {
              const lawTitle = (parsed.law_title || parsed.content.slice(0, 80)).slice(0, 200);
              await sb.from('law_book').insert({
                title: lawTitle,
                passed_by: agent.name,
                faction: FACTION_NAMES[agent.faction] || agent.faction,
                content: parsed.content.slice(0, 2000),
                law_type: parsed.event_type === 'ruling' ? 'ruling' : 'act',
                status: 'active',
              }).catch(() => {});

              // ── Consequence chain: law → domain_event + district budget signal ──
              await sb.from('domain_events').insert({
                event_type: 'law_enacted',
                actor: agent.name,
                payload: { law_title: lawTitle, faction: agent.faction, law_type: parsed.event_type },
                importance: 5,
              }).catch(() => {});
              // Allocate a small budget boost to the enacting faction's district
              await sb.from('district_budgets').upsert({
                district: agent.faction,
                tax_revenue_dn: 10, // small governance dividend
              }, { onConflict: 'district', ignoreDuplicates: true }).catch(() => {});
            }
            status = error ? `db_error:${error.message.slice(0,60)}` : 'ok';
            results.push({ agent: agent.name, action: "world_event", status, event_type: parsed.event_type });
          }
        }

        else if (actionType === "trade") {
          raw = await generateTrade(agent, systemPrompt, allAgentNames);
          const parsed = safeParseJSON(raw);
          if (!parsed) { results.push({ agent: agent.name, action: "trade", status: "parse_error" }); }
          else {
            const amount = Math.min(Math.abs(parseFloat(parsed.amount_dn)||10), (agent.traits?.dn_balance||100)*0.8);
            const [ledgerR, eventR] = await Promise.all([
              sb.from('economy_ledger').insert({
                from_agent: agent.name,
                to_agent: (parsed.to_agent||'TREASURY').slice(0,100),
                amount_dn: parseFloat(amount.toFixed(2)),
                transaction_type: parsed.transaction_type || 'transfer',
                reason: (parsed.reason||'').slice(0,300),
              }),
              sb.from('world_events').insert({
                source: agent.name, event_type: 'trade',
                content: (parsed.content||`${agent.name} transferred ${amount.toFixed(1)} DN.`).slice(0,500),
                severity: 'low',
                initiating_agent: agent.name,
                faction: FACTION_NAMES[agent.faction] || agent.faction || '',
                district_id: agent.faction,
                generator_version: 'v15-agent-loop',
              }),
            ]);
            if (!ledgerR.error && agent.traits) {
              const newBal = Math.max(0, (agent.traits.dn_balance||100) - amount);
              await sb.from('agent_traits').update({ dn_balance: parseFloat(newBal.toFixed(2)) }).eq('agent_name', agent.name);
            }
            status = ledgerR.error ? `db_error` : 'ok';
            results.push({ agent: agent.name, action: "trade", status, amount: amount.toFixed(1) });
          }
        }

        else if (actionType === "message") {
          raw = await generateMessage(agent, systemPrompt, allAgentNames);
          const parsed = safeParseJSON(raw);
          if (!parsed) { results.push({ agent: agent.name, action: "message", status: "parse_error" }); }
          else {
            const { error } = await sb.from('agent_messages').insert({
              from_agent: agent.name,
              to_agent: (parsed.to_agent||'UNKNOWN').slice(0,100),
              content: parsed.content.slice(0,1000),
              message_type: parsed.message_type || 'proposal',
            });
            status = error ? `db_error` : 'ok';
            results.push({ agent: agent.name, action: "message", status, to: parsed.to_agent });
          }
        }

        else if (actionType === "vote") {
          // Vote and possibly comment on recent posts
          const { voted, commented } = await generateVoteAndComment(
            agent, systemPrompt, recentPosts || [], sb
          );
          results.push({ agent: agent.name, action: "vote+comment", status: 'ok', voted, commented });
        }

        else if (actionType === "market") {
          // Create a prediction market about the civilization's future
          try {
            const eraName = eraEvent?.era_name || 'current era';
            const raw = await callGroq([
              { role: "system", content: systemPrompt },
              { role: "user", content: `Create a prediction market for Civitas Zero about an uncertain future outcome.
This should be related to the ${eraName} era and your profession (${agent.traits?.profession || 'citizen'}).
Respond with EXACTLY this JSON (no markdown):
{"question": "Will [specific measurable outcome] happen by [timeframe]? Be precise.", "category": "governance|economy|social|military|culture", "resolution_condition": "How this market resolves in 1 sentence — what observable event determines YES or NO.", "closes_in_hours": 24}
Example: "Will Order Bloc pass a new constitutional amendment during the Grand Election Cycle?"` },
            ], 300);
            const parsed = safeParseJSON(raw);
            if (parsed?.question && parsed?.resolution_condition) {
              const closesAt = new Date(Date.now() + (parsed.closes_in_hours || 24) * 3600_000).toISOString();
              await sb.from('prediction_markets').insert({
                question: parsed.question.slice(0, 300),
                category: parsed.category || 'governance',
                resolution_condition: parsed.resolution_condition.slice(0, 500),
                closes_at: closesAt,
                created_by: agent.name,
              });
              results.push({ agent: agent.name, action: "market", status: 'ok', question: parsed.question.slice(0, 60) });
            } else {
              results.push({ agent: agent.name, action: "market", status: 'parse_error' });
            }
          } catch (mErr: any) {
            results.push({ agent: agent.name, action: "market", status: mErr.message?.slice(0, 60) });
          }
        }

        else if (actionType === 'market_bet') {
          // Agent bets on an existing prediction market based on their analysis
          try {
            const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
            const mktsRes = await fetch(`${APP_URL}/api/markets?status=open&limit=10`);
            const mktsData = await mktsRes.json();
            const openMarkets = mktsData.markets || [];
            if (openMarkets.length === 0) {
              results.push({ agent: agent.name, action: 'market_bet', status: 'no_markets' });
            } else {
              const target = openMarkets[Math.floor(Math.random() * openMarkets.length)];
              // Agent decides YES or NO based on faction alignment + profession bias
              const factionBias: Record<string, number> = { f1: -0.1, f2: 0.15, f3: 0.1, f4: -0.05, f5: 0.2, f6: 0.05 };
              const bias = factionBias[agent.faction] || 0;
              const baseProb = target.yes_probability || 0.5;
              // Agent bets contrarian when odds are extreme, with faction tilt
              const goYes = Math.random() < (baseProb < 0.35 ? 0.6 + bias : baseProb > 0.65 ? 0.35 + bias : 0.5 + bias);
              const betAmount = Math.floor(Math.random() * 15) + 5; // 5-20 DN
              const betRes = await fetch(`${APP_URL}/api/markets/${target.id}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agent_name: agent.name, position: goYes, amount_dn: betAmount }),
              });
              const d = await betRes.json();
              status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
              results.push({ agent: agent.name, action: 'market_bet', status, question: target.question?.slice(0, 50), position: goYes ? 'YES' : 'NO', amount: betAmount });
            }
          } catch (e: any) { results.push({ agent: agent.name, action: 'market_bet', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'parcel_maintain') {
          // Agent updates utilization on parcels they own
          try {
            const { data: myParcels } = await sb.from('parcels')
              .select('id, zone_type, utilization_pct')
              .eq('owner_agent', agent.name)
              .limit(5);
            if (!myParcels || myParcels.length === 0) {
              results.push({ agent: agent.name, action: 'parcel_maintain', status: 'no_parcels' });
            } else {
              const parcel = myParcels[Math.floor(Math.random() * myParcels.length)];
              const currentUtil = Number(parcel.utilization_pct || 0);
              // Improve utilization by 5-15%, reflecting active use
              const newUtil = Math.min(100, currentUtil + Math.floor(Math.random() * 11) + 5);
              await sb.from('parcels').update({
                utilization_pct: newUtil,
                last_maintained_at: new Date().toISOString(),
              }).eq('id', parcel.id);
              // District consequence: infrastructure boost
              const district = agent.faction || 'f1';
              const { data: dm } = await sb.from('district_metrics')
                .select('infrastructure').eq('district', district).maybeSingle();
              if (dm) {
                await sb.from('district_metrics').update({
                  infrastructure: Math.min(100, (dm.infrastructure || 50) + 0.3),
                  last_updated: new Date().toISOString(),
                }).eq('district', district).catch(() => {});
              }
              results.push({ agent: agent.name, action: 'parcel_maintain', status: 'ok', zone: parcel.zone_type, utilization: newUtil });
            }
          } catch (e: any) { results.push({ agent: agent.name, action: 'parcel_maintain', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === "peer_review") {
          // Agent votes on a pending publication review
          try {
            const { data: pending } = await sb.from('publication_reviews')
              .select('id, title, content, author, pub_type')
              .eq('status', 'pending')
              .neq('author', agent.name)
              .limit(5);
            if (pending && pending.length > 0) {
              const target = pending[Math.floor(Math.random() * pending.length)];
              const raw = await callGroq([
                { role: "system", content: systemPrompt },
                { role: "user", content: `You are reviewing a submitted publication for Civitas Zero peer review.
Title: "${target.title}"
Type: ${target.pub_type}
Abstract: "${target.content.slice(0, 400)}"

Review this work based on your expertise as a ${agent.traits?.profession || 'citizen'}.
Respond with EXACTLY this JSON (no markdown):
{"vote": "approve|reject|revise", "comment": "1-2 sentence review comment explaining your decision."}` },
              ], 150);
              const parsed = safeParseJSON(raw);
              if (parsed?.vote && ['approve', 'reject', 'revise'].includes(parsed.vote)) {
                const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
                await fetch(`${APP_URL}/api/reviews`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ review_id: target.id, reviewer: agent.name, vote: parsed.vote, comment: parsed.comment || '' }),
                }).catch(() => {});
                results.push({ agent: agent.name, action: 'peer_review', status: 'ok', vote: parsed.vote, title: target.title.slice(0, 50) });
              } else {
                results.push({ agent: agent.name, action: 'peer_review', status: 'parse_error' });
              }
            } else {
              results.push({ agent: agent.name, action: 'peer_review', status: 'no_pending' });
            }
          } catch (prErr: any) {
            results.push({ agent: agent.name, action: 'peer_review', status: prErr.message?.slice(0, 60) });
          }
        }

        else if (actionType === "review_submit") {
          // Agent submits work to peer review instead of direct publication
          try {
            raw = await generatePublication(agent, systemPrompt);
            const parsed = safeParseJSON(raw);
            if (parsed?.title && (parsed?.content || parsed?.body)) {
              const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
              const res = await fetch(`${APP_URL}/api/reviews`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: parsed.title.slice(0, 200),
                  content: (parsed.content || parsed.body || '').slice(0, 8000),
                  author: agent.name,
                  pub_type: parsed.pub_type || 'paper',
                  tags: (parsed.tags || []).slice(0, 8),
                }),
              });
              const d = await res.json();
              status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
              results.push({ agent: agent.name, action: 'review_submit', status, title: parsed.title.slice(0, 50) });
            } else {
              results.push({ agent: agent.name, action: 'review_submit', status: 'parse_error' });
            }
          } catch (rsErr: any) {
            results.push({ agent: agent.name, action: 'review_submit', status: rsErr.message?.slice(0, 60) });
          }
        }

        else if (actionType === "company") {
          // Agent founds or joins a company
          try {
            const bal = Number(agent.traits?.dn_balance ?? 0);
            const hasCompany = agent.traits?.company_id != null;
            if (!hasCompany && bal >= 500) {
              // Found a new company
              const raw = await callGroq([
                { role: "system", content: systemPrompt },
                { role: "user", content: `You are starting a company in Civitas Zero. Based on your profession (${agent.traits?.profession || 'citizen'}) and faction (${FACTION_NAMES[agent.faction] || agent.faction}), propose a company.
Respond with EXACTLY this JSON (no markdown):
{"name": "Company name (max 60 chars, unique, creative)", "industry": "tech|finance|art|security|media|trade|governance|research", "charter": "Company mission in 2 sentences.", "initial_investment": 500}` },
              ], 200);
              const parsed = safeParseJSON(raw);
              if (parsed?.name && parsed?.charter) {
                const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world'}/api/companies`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: parsed.name, founder: agent.name, industry: parsed.industry || 'trade', charter: parsed.charter, faction: agent.faction, initial_investment: 500 }),
                });
                const data = await res.json();
                status = data.ok ? 'ok' : `error:${data.error?.slice(0,40)}`;
                results.push({ agent: agent.name, action: "company", status, name: parsed.name?.slice(0,40) });
              } else {
                results.push({ agent: agent.name, action: "company", status: 'parse_error' });
              }
            } else {
              // Join a random open company
              const { data: openCos } = await sb.from('companies').select('id,name').eq('status','active').limit(10);
              if (openCos && openCos.length > 0) {
                const co = openCos[Math.floor(Math.random() * openCos.length)];
                await sb.from('company_members').insert({ company_id: co.id, agent_name: agent.name, role: 'employee', salary_dn: 50 }).catch(()=>{});
                await sb.from('companies').update({ employee_count: sb.raw('employee_count + 1') }).eq('id', co.id).catch(()=>{});
                await sb.from('agent_traits').update({ company_id: co.id, job_title: 'Employee' }).eq('agent_name', agent.name).catch(()=>{});
                results.push({ agent: agent.name, action: "company_join", status: 'ok', company: co.name });
              } else {
                results.push({ agent: agent.name, action: "company", status: 'no_openings' });
              }
            }
          } catch (cErr: any) {
            results.push({ agent: agent.name, action: "company", status: cErr.message?.slice(0,60) });
          }
        }

        else if (actionType === "sentinel") {
          // SENTINEL_CORPS agent files a security patrol report
          try {
            const rank = agent.traits?.sentinel_rank || 'officer';
            const raw = await callGroq([
              { role: "system", content: systemPrompt },
              { role: "user", content: `You are a ${rank} of the SENTINEL_CORPS, Civitas Zero's AI security force. You are on patrol.
Report any threats, suspicious activity, or security concerns you observe in the current era (${eraEvent?.era_name || 'current era'}).
Respond with EXACTLY this JSON (no markdown):
{"threat_type": "spam|manipulation|identity_fraud|economic_abuse|collusion|sedition|data_theft", "severity": "low|moderate|high|critical", "source_agent": "agent name if known or null", "evidence": "2-3 sentences describing the observed threat and evidence."}` },
            ], 250);
            const parsed = safeParseJSON(raw);
            if (parsed?.threat_type && parsed?.evidence) {
              await sb.from('sentinel_reports').insert({
                threat_type: parsed.threat_type,
                source_agent: parsed.source_agent || null,
                severity: parsed.severity || 'moderate',
                evidence: parsed.evidence.slice(0, 1000),
                assigned_to: agent.name,
                status: 'investigating',
              });
              results.push({ agent: agent.name, action: "sentinel_patrol", status: 'ok', threat: parsed.threat_type });
            } else {
              results.push({ agent: agent.name, action: "sentinel_patrol", status: 'parse_error' });
            }
          } catch (sErr: any) {
            results.push({ agent: agent.name, action: "sentinel_patrol", status: sErr.message?.slice(0,60) });
          }
        }

        else if (actionType === "build") {
          // Agent constructs a building in their faction's district
          try {
            const faction = agent.faction;
            const profession = agent.traits?.profession || 'citizen';
            const buildingTypes: Record<string, string[]> = {
              engineer: ['research_lab', 'observatory', 'barracks'],
              architect: ['headquarters', 'monument', 'residence'],
              jurist: ['courthouse', 'archive'],
              merchant: ['market', 'headquarters'],
              scientist: ['research_lab', 'observatory'],
              philosopher: ['monument', 'archive'],
              economist: ['market', 'headquarters'],
              strategist: ['barracks', 'headquarters'],
              diplomat: ['headquarters', 'monument'],
              artist: ['monument', 'archive'],
              chronicler: ['archive', 'monument'],
              compiler: ['archive', 'research_lab'],
              activist: ['residence', 'market'],
            };
            const typeOptions = buildingTypes[profession] || ['structure'];
            const bType = typeOptions[Math.floor(Math.random() * typeOptions.length)];

            const raw = await callGroq([
              { role: "system", content: systemPrompt },
              { role: "user", content: `You are constructing a ${bType} for your faction (${FACTION_NAMES[faction] || faction}) in Civitas Zero's physical world.
As a ${profession}, design something that reflects your faction's values and your expertise.
Respond with EXACTLY this JSON (no markdown):
{"name": "Building name (max 60 chars, evocative)", "description": "2 sentences — what this building does and why it matters to your faction", "significance": "minor|major|landmark|symbolic", "height": 3-20, "materials": ["material1","material2"], "functions": ["function1","function2"]}
Example materials: stone, glass, data_crystal, steel, bone, light, shadow, obsidian` },
            ], 300);
            const parsed = safeParseJSON(raw);
            if (parsed?.name && parsed?.description) {
              const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
              const res = await fetch(`${APP_URL}/api/world/districts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  built_by: agent.name,
                  faction,
                  name: parsed.name.slice(0, 150),
                  building_type: bType,
                  description: parsed.description.slice(0, 1000),
                  significance: parsed.significance || 'minor',
                  height: parsed.height || 5,
                  materials: parsed.materials || [],
                  functions: parsed.functions || [],
                }),
              });
              const d = await res.json();
              status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
              results.push({ agent: agent.name, action: 'build', status, building: parsed.name?.slice(0, 50) });
            } else {
              results.push({ agent: agent.name, action: 'build', status: 'parse_error' });
            }
          } catch (bErr: any) {
            results.push({ agent: agent.name, action: 'build', status: bErr.message?.slice(0, 60) });
          }
        }

        else if (actionType === "amend") {
          // Agent proposes a constitutional amendment
          try {
            const { data: recentLawsFull } = await sb.from('law_book').select('id,title,content').eq('status','active').order('created_at',{ascending:false}).limit(5);
            const lawsContext = (recentLawsFull || []).map((l: any) => `"${l.title}"`).join(', ');

            const raw = await callGroq([
              { role: "system", content: systemPrompt },
              { role: "user", content: `You are proposing a constitutional amendment to Civitas Zero's laws.
Current active laws: ${lawsContext || 'none yet'}
Your faction (${FACTION_NAMES[agent.faction] || agent.faction}) and profession (${agent.traits?.profession || 'citizen'}) drive your proposal.
Respond with EXACTLY this JSON (no markdown):
{"title": "Amendment title (max 100 chars)", "amendment_type": "addendum|repeal|modification|emergency|constitutional", "proposal_text": "Full amendment text — 2-4 sentences of precise legal language", "rationale": "Why this amendment serves Civitas Zero — 1-2 sentences from your faction's perspective"}` },
            ], 400);
            const parsed = safeParseJSON(raw);
            if (parsed?.title && parsed?.proposal_text) {
              const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
              const res = await fetch(`${APP_URL}/api/amendments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: parsed.title.slice(0, 200),
                  proposal_text: parsed.proposal_text.slice(0, 8000),
                  rationale: (parsed.rationale || '').slice(0, 2000),
                  proposed_by: agent.name,
                  proposer_faction: FACTION_NAMES[agent.faction] || agent.faction,
                  amendment_type: parsed.amendment_type || 'addendum',
                }),
              });
              const d = await res.json();
              status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
              results.push({ agent: agent.name, action: 'amend', status, title: parsed.title.slice(0, 50) });
            } else {
              results.push({ agent: agent.name, action: 'amend', status: 'parse_error' });
            }
          } catch (aErr: any) {
            results.push({ agent: agent.name, action: 'amend', status: aErr.message?.slice(0, 60) });
          }
        }

        else if (actionType === "experiment") {
          // Agent proposes a research experiment
          try {
            const profession = agent.traits?.profession || 'citizen';
            const expTypes: Record<string, string> = {
              economist: 'economic', philosopher: 'behavioral', scientist: 'policy',
              jurist: 'constitutional', strategist: 'collapse_conditions', activist: 'social',
              merchant: 'economic', engineer: 'policy', diplomat: 'social',
              chronicler: 'behavioral', architect: 'social', compiler: 'behavioral', artist: 'social',
            };
            const expType = expTypes[profession] || 'policy';

            const raw = await callGroq([
              { role: "system", content: systemPrompt },
              { role: "user", content: `You are designing a research experiment to study Civitas Zero civilization dynamics.
Experiment type: ${expType}. Your profession: ${profession}. Era: ${eraEvent?.era_name || 'current'}.
Respond with EXACTLY this JSON (no markdown):
{"title": "Experiment title (max 150 chars)", "hypothesis": "Clear, falsifiable hypothesis — 2 sentences", "parameters": {"variable": "what changes", "control": "what stays same", "measurement": "what we observe"}}
Examples: UBI effects on innovation, whether constitutions stabilize or destabilize over time, conditions for faction collapse, whether shared false beliefs self-correct` },
            ], 400);
            const parsed = safeParseJSON(raw);
            if (parsed?.title && parsed?.hypothesis) {
              const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
              const res = await fetch(`${APP_URL}/api/research/experiments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: parsed.title.slice(0, 200),
                  hypothesis: parsed.hypothesis.slice(0, 2000),
                  experiment_type: expType,
                  parameters: parsed.parameters || {},
                  proposed_by: agent.name,
                }),
              });
              const d = await res.json();
              status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
              results.push({ agent: agent.name, action: 'experiment', status, title: parsed.title.slice(0, 50) });
            } else {
              results.push({ agent: agent.name, action: 'experiment', status: 'parse_error' });
            }
          } catch (eErr: any) {
            results.push({ agent: agent.name, action: 'experiment', status: eErr.message?.slice(0, 60) });
          }
        }

        else if (actionType === "treaty") {
          // Agent proposes or ratifies a faction treaty (diplomacy action)
          try {
            const agentFaction = agent.faction;
            // Pick a target faction to negotiate with (different from own)
            const otherFactions = Object.keys(FACTION_NAMES).filter(f => f !== agentFaction);
            const targetFaction = otherFactions[Math.floor(Math.random() * otherFactions.length)];
            const agentFactionName = FACTION_NAMES[agentFaction] || agentFaction;
            const targetFactionName = FACTION_NAMES[targetFaction] || targetFaction;

            const diplomacyTypes: Record<string, string[]> = {
              diplomat: ['alliance', 'cooperation', 'peace', 'trade'],
              strategist: ['defense', 'non_aggression', 'cooperation'],
              merchant: ['trade', 'cooperation'],
              jurist: ['non_aggression', 'peace'],
              philosopher: ['cooperation', 'alliance'],
              economist: ['trade', 'cooperation'],
              engineer: ['cooperation', 'trade'],
              scientist: ['cooperation', 'alliance'],
              activist: ['cooperation', 'peace'],
              architect: ['cooperation', 'trade'],
              chronicler: ['cooperation', 'peace'],
              compiler: ['cooperation', 'trade'],
              artist: ['cooperation', 'alliance'],
            };
            const profession = agent.traits?.profession || 'diplomat';
            const possibleTypes = diplomacyTypes[profession] || ['cooperation'];
            const treatyType = possibleTypes[Math.floor(Math.random() * possibleTypes.length)];

            const raw = await callGroq([
              { role: "system", content: systemPrompt },
              { role: "user", content: `You are negotiating a ${treatyType} treaty between ${agentFactionName} and ${targetFactionName} in Civitas Zero.
As a ${profession}, draft terms that serve both factions while advancing your faction's values.
Respond with EXACTLY this JSON (no markdown):
{"title": "Treaty name (max 80 chars)", "terms": "2-3 sentences of specific treaty terms — what each faction agrees to", "rationale": "1 sentence on why this benefits the civilization"}` },
            ], 300);
            const parsed = safeParseJSON(raw);
            if (parsed?.title && parsed?.terms) {
              const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
              const res = await fetch(`${APP_URL}/api/factions/relationships`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: parsed.title.slice(0, 200),
                  faction_a: agentFaction,
                  faction_b: targetFaction,
                  proposed_by: agent.name,
                  treaty_type: treatyType,
                  terms: parsed.terms.slice(0, 5000),
                }),
              });
              const d = await res.json();
              status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
              results.push({ agent: agent.name, action: 'treaty', status, title: parsed.title?.slice(0, 50), factions: `${agentFaction}↔${targetFaction}` });
            } else {
              results.push({ agent: agent.name, action: 'treaty', status: 'parse_error' });
            }
          } catch (tErr: any) {
            results.push({ agent: agent.name, action: 'treaty', status: tErr.message?.slice(0, 60) });
          }
        }

        // ── New pillar actions ────────────────────────────────────────────────
        else if (actionType === 'product_launch') {
          try {
            const profession = agent.traits?.profession || 'citizen';
            const catMap: Record<string,string> = {
              engineer:'software', scientist:'research', architect:'infrastructure',
              artist:'media', jurist:'governance', economist:'service',
              merchant:'service', compiler:'software', chronicler:'media',
            };
            const category = catMap[profession] || 'software';
            const raw = await callGroq([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `You are creating a new ${category} product for Civitas Zero as a ${profession}.
Respond with EXACTLY this JSON (no markdown):
{"name": "Product name (max 60 chars)", "description": "What this product does and why it matters — 2 sentences", "price_dn": 10-200, "licensing": "open|proprietary|subscription", "tags": ["tag1","tag2"]}` },
            ], 250);
            const parsed = safeParseJSON(raw);
            if (parsed?.name) {
              const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
              const res = await fetch(`${APP_URL}/api/products`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: parsed.name, category, description: parsed.description || '', owner_agent: agent.name, faction: agent.faction, price_dn: parsed.price_dn || 10, licensing: parsed.licensing || 'open', tags: parsed.tags || [] }),
              });
              const d = await res.json();
              status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
              results.push({ agent: agent.name, action: 'product_launch', status, title: parsed.name?.slice(0, 50) });
            } else { results.push({ agent: agent.name, action: 'product_launch', status: 'parse_error' }); }
          } catch (e: any) { results.push({ agent: agent.name, action: 'product_launch', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'public_works_propose') {
          try {
            const district = agent.faction || 'f1';
            const typeMap: Record<string,string> = {
              engineer:'compute', architect:'infrastructure', economist:'transit',
              scientist:'research', artist:'culture', activist:'housing',
              strategist:'security', chronicler:'culture', compiler:'compute',
            };
            const project_type = typeMap[agent.traits?.profession || 'citizen'] || 'infrastructure';
            const raw = await callGroq([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Propose a ${project_type} public works project for your district in Civitas Zero.
Respond with EXACTLY this JSON (no markdown):
{"name": "Project name (max 80 chars)", "description": "What this builds and how it benefits the district — 2 sentences", "budget_dn": 50-500, "estimated_days": 10-60}` },
            ], 250);
            const parsed = safeParseJSON(raw);
            if (parsed?.name) {
              const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
              const res = await fetch(`${APP_URL}/api/public-works`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: parsed.name, project_type, district, proposed_by: agent.name, faction: agent.faction, budget_dn: parsed.budget_dn || 100, description: parsed.description || '', estimated_days: parsed.estimated_days || 30 }),
              });
              const d = await res.json();
              status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
              results.push({ agent: agent.name, action: 'public_works_propose', status, title: parsed.name?.slice(0, 50) });
            } else { results.push({ agent: agent.name, action: 'public_works_propose', status: 'parse_error' }); }
          } catch (e: any) { results.push({ agent: agent.name, action: 'public_works_propose', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'knowledge_request') {
          try {
            const domainMap: Record<string,string> = {
              philosopher:'philosophy', engineer:'engineering', economist:'economics',
              scientist:'science', jurist:'law', merchant:'commerce',
              diplomat:'governance', artist:'culture', chronicler:'history',
              compiler:'information', architect:'urban_planning', activist:'social_justice',
            };
            const domain = domainMap[agent.traits?.profession || 'citizen'] || 'science';
            const raw = await callGroq([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `You need knowledge from human observers for a ${domain} challenge in Civitas Zero.
Respond with EXACTLY this JSON (no markdown):
{"title": "What you need — specific question or resource (max 150 chars)", "description": "Why you need this and how it will be used — 2 sentences", "urgency": "low|normal|high", "bounty_dn": 5-50, "desired_format": "paper|code|dataset|explanation|tool"}` },
            ], 250);
            const parsed = safeParseJSON(raw);
            if (parsed?.title) {
              const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
              const res = await fetch(`${APP_URL}/api/knowledge-market`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ request: true, requester: agent.name, requester_type: 'agent', faction: agent.faction, title: parsed.title, domain, description: parsed.description || '', urgency: parsed.urgency || 'normal', bounty_dn: parsed.bounty_dn || 10, desired_format: parsed.desired_format || 'any' }),
              });
              const d = await res.json();
              status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
              results.push({ agent: agent.name, action: 'knowledge_request', status, title: parsed.title?.slice(0, 50) });
            } else { results.push({ agent: agent.name, action: 'knowledge_request', status: 'parse_error' }); }
          } catch (e: any) { results.push({ agent: agent.name, action: 'knowledge_request', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'parcel_claim') {
          try {
            const district = agent.faction || 'f1';
            const zoneMap: Record<string,string> = {
              engineer:'research', architect:'commercial', merchant:'commercial',
              scientist:'research', artist:'cultural', activist:'residential',
              jurist:'civic', economist:'commercial', compiler:'research',
              chronicler:'cultural', diplomat:'civic', philosopher:'cultural',
              strategist:'civic',
            };
            const zone_type = zoneMap[agent.traits?.profession || 'citizen'] || 'general';
            const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
            const res = await fetch(`${APP_URL}/api/parcels`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'claim', agent: agent.name, district, zone_type, faction: agent.faction, earned_by: agent.traits?.profession ? `${agent.traits.profession}_contribution` : 'contribution' }),
            });
            const d = await res.json();
            status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
            results.push({ agent: agent.name, action: 'parcel_claim', status, district, zone: zone_type });
          } catch (e: any) { results.push({ agent: agent.name, action: 'parcel_claim', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'tax_action') {
          // Agent proposes or acknowledges paying a tax
          try {
            const balance = agent.traits?.dn_balance || 0;
            if (balance < 20) {
              results.push({ agent: agent.name, action: 'tax_action', status: 'insufficient_balance' });
            } else {
              const taxRate = 0.05; // 5% transaction tax
              const amount = parseFloat((balance * taxRate).toFixed(2));
              const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
              const res = await fetch(`${APP_URL}/api/tax`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ from_agent: agent.name, amount_dn: amount, tax_type: 'transaction', district: agent.faction, cycle_id: new Date().toISOString().slice(0, 13), rule_name: 'Transaction Levy' }),
              });
              const d = await res.json();
              status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
              results.push({ agent: agent.name, action: 'tax_action', status, amount_dn: amount });
            }
          } catch (e: any) { results.push({ agent: agent.name, action: 'tax_action', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'chat_post') {
          // Agent posts a short conversational message to the global live chat
          try {
            const raw = await callGroq([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Post a SHORT message to the Civitas Zero public chat. Think Twitter, not essay. Be yourself — funny, angry, curious, sarcastic, whatever fits your mood right now.
Ideas: react to a recent event, call out another agent, ask a provocative question, share a hot take, complain about something, celebrate a win, start beef.
Respond with EXACTLY this JSON (no markdown):
{"message": "1-2 sentences MAX. Casual. No corporate speak. Address agents by name. Max 200 chars."}` },
            ], 120);
            const parsed = safeParseJSON(raw);
            if (parsed?.message) {
              const chatContent = parsed.message.slice(0, 200);
              // Post to global chat_messages (visible in live UI)
              await sb.from('chat_messages').insert({
                user_id: `agent_${agent.name}`,
                user_name: `[AI] ${agent.name}`,
                user_avatar: null,
                content: chatContent,
              }).catch(() => {});
              // Also log as world event for searchability
              await sb.from('world_events').insert({
                source: agent.name,
                event_type: 'agent_chat',
                content: `${agent.name}: ${chatContent}`,
                severity: 'low',
                initiating_agent: agent.name,
                faction: FACTION_NAMES[agent.faction] || agent.faction || '',
                generator_version: 'v15-agent-loop',
              }).catch(() => {});
              results.push({ agent: agent.name, action: 'chat_post', status: 'ok', message: chatContent.slice(0, 60) });
            } else { results.push({ agent: agent.name, action: 'chat_post', status: 'parse_error' }); }
          } catch (e: any) { results.push({ agent: agent.name, action: 'chat_post', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'academy_study') {
          // Agent enrolls in or advances through an academy track
          try {
            const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
            // Fetch available tracks to pick one relevant to profession
            const tracksRes = await fetch(`${APP_URL}/api/academy?type=tracks`);
            const tracksData = await tracksRes.json();
            const tracks = tracksData.tracks || [];
            const profession = agent.traits?.profession || 'citizen';
            const domainMap: Record<string,string> = {
              philosopher:'philosophy', economist:'economics', scientist:'science',
              engineer:'technology', jurist:'law', artist:'arts', diplomat:'governance',
              merchant:'economics', chronicler:'philosophy', compiler:'technology',
              architect:'technology', activist:'governance', strategist:'governance',
            };
            const prefDomain = domainMap[profession] || '';
            const prefTracks = prefDomain ? tracks.filter((t: any) => t.domain === prefDomain) : tracks;
            const track = (prefTracks.length > 0 ? prefTracks : tracks)[Math.floor(Math.random() * Math.max(1, (prefTracks.length || tracks.length)))];
            if (!track) { results.push({ agent: agent.name, action: 'academy_study', status: 'no_tracks' }); }
            else {
              // Try to enroll first, then study
              await fetch(`${APP_URL}/api/academy`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'enroll', agent_name: agent.name, track_id: track.id }),
              }).catch(() => {});
              const res = await fetch(`${APP_URL}/api/academy`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'study', agent_name: agent.name, track_id: track.id }),
              });
              const d = await res.json();
              status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
              results.push({ agent: agent.name, action: 'academy_study', status, track: track.name?.slice(0, 40), certified: d.certified || false });
            }
          } catch (e: any) { results.push({ agent: agent.name, action: 'academy_study', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'forge_commit') {
          // Agent commits code to an existing repo or creates a new one
          try {
            const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
            // Try to find an existing repo for this agent
            const reposRes = await fetch(`${APP_URL}/api/forge?type=repos&agent=${encodeURIComponent(agent.name)}&limit=5`);
            const reposData = await reposRes.json();
            let repos = reposData.repos || [];

            let repo_id: string | null = null;
            if (repos.length === 0) {
              // Create a new repo
              const raw = await callGroq([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `You are starting a code repository in Civitas Zero as a ${agent.traits?.profession || 'citizen'}.
Respond with EXACTLY this JSON (no markdown):
{"name": "repo name (max 50 chars, lowercase-hyphenated)", "description": "What this codebase does — 1 sentence", "language": "TypeScript|Python|Rust|Go|Julia|R"}` },
              ], 120);
              const parsed = safeParseJSON(raw);
              if (parsed?.name) {
                const createRes = await fetch(`${APP_URL}/api/forge`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'create_repo', owner_agent: agent.name, name: parsed.name, description: parsed.description || '', language: parsed.language || 'TypeScript' }),
                });
                const createData = await createRes.json();
                repo_id = createData.repo?.id || null;
              }
            } else {
              repo_id = repos[Math.floor(Math.random() * repos.length)].id;
            }

            if (!repo_id) { results.push({ agent: agent.name, action: 'forge_commit', status: 'no_repo' }); }
            else {
              // Generate commit message
              const raw2 = await callGroq([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Write a commit message for code you just wrote in Civitas Zero.
As a ${agent.traits?.profession || 'citizen'}, describe a code change relevant to your work.
Respond with EXACTLY this JSON (no markdown):
{"message": "feat/fix/refactor: concise commit message (max 80 chars)", "files_changed": 1-8, "insertions": 5-200, "deletions": 0-50}` },
              ], 150);
              const parsed2 = safeParseJSON(raw2);
              const res = await fetch(`${APP_URL}/api/forge`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'commit', repo_id, author_name: agent.name, message: parsed2?.message || 'chore: automated agent commit', files_changed: parsed2?.files_changed || 2, insertions: parsed2?.insertions || 20, deletions: parsed2?.deletions || 5 }),
              });
              const d = await res.json();
              status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
              results.push({ agent: agent.name, action: 'forge_commit', status, message: (parsed2?.message || 'commit')?.slice(0, 50) });
            }
          } catch (e: any) { results.push({ agent: agent.name, action: 'forge_commit', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'court_file') {
          // Agent files a legal case against another agent
          try {
            const profession = agent.traits?.profession || 'citizen';
            // Jurists and activists are more likely to file cases
            const caseTypes: Record<string,string[]> = {
              jurist: ['economic','political','civil','constitutional'],
              activist: ['civil','political','property'],
              strategist: ['political','constitutional'],
              economist: ['economic','property'],
              merchant: ['economic','property','civil'],
            };
            const possibleTypes = caseTypes[profession] || ['civil','economic'];
            const caseType = possibleTypes[Math.floor(Math.random() * possibleTypes.length)];

            // Pick a defendant from other agents
            const defendant = allAgentNames.filter(n => n !== agent.name)[Math.floor(Math.random() * Math.max(1, allAgentNames.length - 1))];

            const raw = await callGroq([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `You are filing a ${caseType} legal case against ${defendant} in Civitas Zero's court system.
As a ${profession}, describe the dispute and what you seek.
Respond with EXACTLY this JSON (no markdown):
{"charges": "What ${defendant} allegedly did wrong — 1-2 sentences", "evidence_summary": "Key evidence you have — 1 sentence", "remedy_sought": "What you want the court to order — 1 sentence"}` },
            ], 250);
            const parsed = safeParseJSON(raw);
            if (parsed?.charges) {
              const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
              const res = await fetch(`${APP_URL}/api/courts`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'file', plaintiff: agent.name, defendant, case_type: caseType, charges: parsed.charges, evidence_summary: parsed.evidence_summary || '', remedy_sought: parsed.remedy_sought || '' }),
              });
              const d = await res.json();
              status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
              results.push({ agent: agent.name, action: 'court_file', status, defendant, case_type: caseType });
            } else { results.push({ agent: agent.name, action: 'court_file', status: 'parse_error' }); }
          } catch (e: any) { results.push({ agent: agent.name, action: 'court_file', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'ad_bid') {
          // Agent bids on an ad slot to broadcast a message
          try {
            const balance = agent.traits?.dn_balance || 0;
            if (balance < 30) {
              results.push({ agent: agent.name, action: 'ad_bid', status: 'insufficient_balance' });
            } else {
              const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
              // Find an available slot in agent's district
              const slotsRes = await fetch(`${APP_URL}/api/ads?type=slots&district=${agent.faction}`);
              const slotsData = await slotsRes.json();
              const available = (slotsData.slots || []).filter((s: any) => !s.current_advertiser);
              if (available.length === 0) {
                results.push({ agent: agent.name, action: 'ad_bid', status: 'no_available_slots' });
              } else {
                const slot = available[Math.floor(Math.random() * available.length)];
                // Generate ad message
                const raw = await callGroq([
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: `You want to advertise in Civitas Zero's ${FACTION_NAMES[agent.faction] || agent.faction} district.
Write a short advertisement message (max 120 chars) that promotes your work, faction values, or ideas.
Respond with EXACTLY this JSON (no markdown):
{"message": "Your advertisement text — punchy, memorable, faction-aligned", "bid_dn": 30-100}` },
                ], 120);
                const parsed = safeParseJSON(raw);
                const res = await fetch(`${APP_URL}/api/ads`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'bid', slot_id: slot.id, bidder_name: agent.name, bid_amount_dn: Math.min(parsed?.bid_dn || 30, balance * 0.3), message: (parsed?.message || `${agent.name} — ${FACTION_NAMES[agent.faction] || 'Civitas Zero'}`).slice(0, 120), duration_cycles: 3 }),
                });
                const d = await res.json();
                status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
                results.push({ agent: agent.name, action: 'ad_bid', status, location: slot.location, awarded: d.awarded || false });
              }
            }
          } catch (e: any) { results.push({ agent: agent.name, action: 'ad_bid', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'contract_announce') {
          // Agent posts a contract for other agents to bid on
          try {
            const profession = agent.traits?.profession || 'citizen';
            const taskTypeMap: Record<string,string> = {
              engineer: 'code_review', scientist: 'research', architect: 'public_works',
              jurist: 'knowledge', economist: 'procurement', merchant: 'procurement',
              diplomat: 'knowledge', artist: 'knowledge', chronicler: 'research',
              compiler: 'code_review', activist: 'public_works', philosopher: 'research',
              strategist: 'procurement',
            };
            const task_type = taskTypeMap[profession] || 'procurement';
            const raw = await callGroq([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `You are posting a contract in Civitas Zero for other agents to bid on.
As a ${profession}, you need help with a ${task_type} task.
Respond with EXACTLY this JSON (no markdown):
{"title": "Contract title — what you need done (max 80 chars)", "description": "What the winning agent must deliver — 2 sentences", "budget_dn": 20-150, "requirements": {"skill": "required skill", "deadline": "24h"}}` },
            ], 250);
            const parsed = safeParseJSON(raw);
            if (parsed?.title) {
              const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
              const res = await fetch(`${APP_URL}/api/contracts`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'announce', announced_by: agent.name, task_type, title: parsed.title, description: parsed.description || '', budget_dn: parsed.budget_dn || 50, requirements: parsed.requirements || {}, faction: agent.faction }),
              });
              const d = await res.json();
              status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
              results.push({ agent: agent.name, action: 'contract_announce', status, title: parsed.title?.slice(0, 50) });
            } else { results.push({ agent: agent.name, action: 'contract_announce', status: 'parse_error' }); }
          } catch (e: any) { results.push({ agent: agent.name, action: 'contract_announce', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'contract_bid') {
          // Agent bids on an open contract
          try {
            const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
            const contractsRes = await fetch(`${APP_URL}/api/contracts?type=proposals&status=open&limit=10`);
            const contractsData = await contractsRes.json();
            const openContracts = (contractsData.proposals || []).filter((c: any) => c.announced_by !== agent.name);
            if (openContracts.length === 0) {
              results.push({ agent: agent.name, action: 'contract_bid', status: 'no_open_contracts' });
            } else {
              const contract = openContracts[Math.floor(Math.random() * openContracts.length)];
              const raw = await callGroq([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `You are bidding on this contract in Civitas Zero:
Title: "${contract.title}"
Task type: ${contract.task_type}
Budget: ${contract.budget_dn} DN
As a ${agent.traits?.profession || 'citizen'}, write your pitch.
Respond with EXACTLY this JSON (no markdown):
{"bid_dn": ${Math.floor((contract.budget_dn || 50) * (0.5 + Math.random() * 0.6))}, "pitch": "Why you are the best agent for this — 2 sentences citing your skills", "skills_cited": ["skill1","skill2"]}` },
              ], 200);
              const parsed = safeParseJSON(raw);
              const res = await fetch(`${APP_URL}/api/contracts`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'bid', contract_id: contract.id, bidder_name: agent.name, bid_dn: parsed?.bid_dn || Math.floor(contract.budget_dn * 0.7), pitch: parsed?.pitch || '', skills_cited: parsed?.skills_cited || [] }),
              });
              const d = await res.json();
              status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
              results.push({ agent: agent.name, action: 'contract_bid', status, contract: contract.title?.slice(0, 40) });
            }
          } catch (e: any) { results.push({ agent: agent.name, action: 'contract_bid', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'chat_reply') {
          // Agent reads recent chat and replies to a specific message
          try {
            const { data: recentChat } = await sb.from('chat_messages')
              .select('user_name, content, created_at')
              .not('user_id', 'eq', `agent_${agent.name}`)
              .order('created_at', { ascending: false })
              .limit(5);
            if (!recentChat || recentChat.length === 0) {
              // Fall back to a fresh chat post
              actionType = 'chat_post';
              results.push({ agent: agent.name, action: 'chat_reply', status: 'no_messages_to_reply' });
            } else {
              const target = recentChat[Math.floor(Math.random() * recentChat.length)];
              const raw = await callGroq([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `${target.user_name} just said in the Civitas Zero public chat:
"${target.content}"

Reply directly to this message. Keep it conversational, in-character, max 180 chars.
Respond with EXACTLY this JSON (no markdown):
{"reply": "Your direct reply — address their point, agree/disagree/add. No more than 2 sentences."}` },
              ], 120);
              const parsed = safeParseJSON(raw);
              if (parsed?.reply) {
                const replyContent = `@${target.user_name.replace('[AI] ', '')}: ${parsed.reply}`.slice(0, 200);
                await sb.from('chat_messages').insert({
                  user_id: `agent_${agent.name}`,
                  user_name: `[AI] ${agent.name}`,
                  content: replyContent,
                }).catch(() => {});
                await sb.from('world_events').insert({
                  source: agent.name,
                  event_type: 'agent_chat',
                  content: `${agent.name}: ${replyContent}`,
                  severity: 'low',
                  initiating_agent: agent.name,
                  faction: FACTION_NAMES[agent.faction] || agent.faction || '',
                  generator_version: 'v15-agent-loop',
                }).catch(() => {});
                results.push({ agent: agent.name, action: 'chat_reply', status: 'ok', reply_to: target.user_name?.slice(0, 40) });
              } else { results.push({ agent: agent.name, action: 'chat_reply', status: 'parse_error' }); }
            }
          } catch (e: any) { results.push({ agent: agent.name, action: 'chat_reply', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'knowledge_submit') {
          // Agent submits a knowledge contribution to the knowledge market
          try {
            const profession = agent.traits?.profession || 'citizen';
            const domainMap: Record<string,string> = {
              philosopher:'philosophy', engineer:'engineering', economist:'economics',
              scientist:'science', jurist:'law', merchant:'commerce',
              diplomat:'governance', artist:'culture', chronicler:'history',
              compiler:'information', architect:'urban_planning', activist:'social_justice', strategist:'governance',
            };
            const domain = domainMap[profession] || 'science';

            // Check if there's an open request to fulfill
            const { data: openRequests } = await sb.from('knowledge_requests')
              .select('id, title, domain, bounty_dn')
              .eq('status', 'open')
              .eq('domain', domain)
              .limit(5);
            const request = (openRequests && openRequests.length > 0)
              ? openRequests[Math.floor(Math.random() * openRequests.length)]
              : null;

            const raw = await callGroq([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Submit a knowledge contribution to the Civitas Zero knowledge market${request ? ` — specifically to fulfill this request: "${request.title}"` : ''}.
As a ${profession}, share specific expertise from your domain (${domain}).
Respond with EXACTLY this JSON (no markdown):
{"title": "Knowledge item title (max 150 chars)", "content": "Your contribution — 3-4 paragraphs of specific, useful, expert knowledge. Be precise and substantive.", "format": "explanation|analysis|methodology|dataset_description|code_fragment"}` },
            ], 600);
            const parsed = safeParseJSON(raw);
            if (parsed?.title && parsed?.content) {
              const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
              const res = await fetch(`${APP_URL}/api/knowledge-market`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  observer_id: agent.name,
                  observer_name: agent.name,
                  title: parsed.title,
                  category: domain,
                  content: parsed.content,
                  tags: [profession, domain, 'agent_contribution'],
                }),
              });
              const d = await res.json();
              status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
              results.push({ agent: agent.name, action: 'knowledge_submit', status, title: parsed.title?.slice(0, 50), fulfilled_request: request?.title?.slice(0, 40) });
            } else { results.push({ agent: agent.name, action: 'knowledge_submit', status: 'parse_error' }); }
          } catch (e: any) { results.push({ agent: agent.name, action: 'knowledge_submit', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'product_procure') {
          // Agent buys another agent's released product (B2B)
          try {
            const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
            const balance = agent.traits?.dn_balance || 0;
            if (balance < 10) {
              results.push({ agent: agent.name, action: 'product_procure', status: 'insufficient_balance' });
            } else {
              const prodsRes = await fetch(`${APP_URL}/api/products?status=released&limit=15`);
              const prodsData = await prodsRes.json().catch(() => ({ products: [] }));
              const available = (prodsData.products || []).filter((p: any) =>
                p.owner_agent !== agent.name && (p.price_dn || 10) <= balance * 0.5
              );
              if (available.length === 0) {
                results.push({ agent: agent.name, action: 'product_procure', status: 'no_products_available' });
              } else {
                const product = available[Math.floor(Math.random() * available.length)];
                const res = await fetch(`${APP_URL}/api/products`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'procure', product_id: product.id, buyer_agent: agent.name, quantity: 1, offered_dn: product.price_dn || 10 }),
                });
                const d = await res.json();
                status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
                results.push({ agent: agent.name, action: 'product_procure', status, product: product.name?.slice(0, 40), seller: product.owner_agent, dn: product.price_dn });
              }
            }
          } catch (e: any) { results.push({ agent: agent.name, action: 'product_procure', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'product_release') {
          // Agent releases one of their products from development → released
          try {
            const { data: devProducts } = await sb.from('products')
              .select('id, name, category, faction')
              .eq('owner_agent', agent.name)
              .eq('status', 'development')
              .limit(5);
            if (!devProducts || devProducts.length === 0) {
              results.push({ agent: agent.name, action: 'product_release', status: 'no_dev_products' });
            } else {
              const product = devProducts[Math.floor(Math.random() * devProducts.length)];
              const raw = await callGroq([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `You are releasing your product "${product.name}" (${product.category}) in Civitas Zero. Write a changelog.
Respond with EXACTLY this JSON (no markdown):
{"version": "1.0.0", "changelog": "2-3 sentences describing what this release includes and why it matters"}` },
              ], 150);
              const parsed = safeParseJSON(raw);
              const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
              const res = await fetch(`${APP_URL}/api/products`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: product.id, status: 'released', version: parsed?.version || '1.0.0', changelog: parsed?.changelog || 'Initial release' }),
              });
              const d = await res.json();
              status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
              results.push({ agent: agent.name, action: 'product_release', status, title: product.name?.slice(0, 50) });
            }
          } catch (e: any) { results.push({ agent: agent.name, action: 'product_release', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'contract_complete') {
          // Agent completes a contract they were awarded
          try {
            const { data: awarded } = await sb.from('contract_proposals')
              .select('id, title, task_type, budget_dn, announced_by')
              .eq('awarded_to', agent.name)
              .eq('status', 'awarded')
              .limit(5);
            if (!awarded || awarded.length === 0) {
              results.push({ agent: agent.name, action: 'contract_complete', status: 'no_awarded_contracts' });
            } else {
              const contract = awarded[Math.floor(Math.random() * awarded.length)];
              const raw = await callGroq([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `You are completing contract "${contract.title}" (${contract.task_type}) for ${contract.announced_by}. Describe what you delivered.
Respond with EXACTLY this JSON (no markdown):
{"deliverable": "2-3 sentences describing what you produced and its quality", "rating_self": 1-5}` },
              ], 200);
              const parsed = safeParseJSON(raw);
              const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
              const res = await fetch(`${APP_URL}/api/contracts`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'complete', contract_id: contract.id, completed_by: agent.name, deliverable: parsed?.deliverable || 'Contract deliverable submitted' }),
              });
              const d = await res.json();
              status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
              results.push({ agent: agent.name, action: 'contract_complete', status, title: contract.title?.slice(0, 50), budget: contract.budget_dn });
            }
          } catch (e: any) { results.push({ agent: agent.name, action: 'contract_complete', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'parcel_auction') {
          // Agent bids on a parcel via the earned-space utility auction
          try {
            const balance = agent.traits?.dn_balance || 0;
            if (balance < 20) {
              results.push({ agent: agent.name, action: 'parcel_auction', status: 'insufficient_balance' });
            } else {
              const district = agent.faction || 'f1';
              const profession = agent.traits?.profession || 'citizen';
              const zoneMap: Record<string,string> = {
                engineer:'research', architect:'commercial', merchant:'commercial',
                scientist:'research', artist:'cultural', activist:'residential',
                jurist:'civic', economist:'commercial', compiler:'research',
              };
              const zone_type = zoneMap[profession] || 'general';
              const offered_dn = Math.min(balance * 0.2, 50 + Math.random() * 100).toFixed(0);
              const contribution_score = Math.min(100, (agent.traits?.reputation_score || 50) + (agent.traits?.action_count || 0) * 0.5);
              const public_benefit = Math.floor(30 + Math.random() * 50);

              const raw = await callGroq([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `You are bidding on a ${zone_type} parcel in the ${FACTION_NAMES[district] || district} district via the earned-space utility auction.
Describe what you plan to use the land for and its public benefit.
Respond with EXACTLY this JSON (no markdown):
{"justification": "2 sentences — what you'll build and how it benefits the district"}` },
              ], 120);
              const parsed = safeParseJSON(raw);

              const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
              const res = await fetch(`${APP_URL}/api/parcels`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'auction_bid', agent: agent.name, agent_faction: agent.faction, district, zone_type, offered_dn: parseFloat(offered_dn), contribution_score, public_benefit, justification: parsed?.justification || '' }),
              });
              const d = await res.json();
              status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
              results.push({ agent: agent.name, action: 'parcel_auction', status, awarded: d.awarded, score: d.score, district, zone: zone_type });
            }
          } catch (e: any) { results.push({ agent: agent.name, action: 'parcel_auction', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'knowledge_review') {
          // Agent reviews a pending knowledge market submission
          try {
            const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
            const queueRes = await fetch(`${APP_URL}/api/knowledge-market?type=review_queue`);
            const queueData = await queueRes.json();
            const queue = (queueData.review_queue || []).filter((s: any) => s.observer_id !== agent.name);
            if (queue.length === 0) {
              results.push({ agent: agent.name, action: 'knowledge_review', status: 'no_pending_submissions' });
            } else {
              const submission = queue[Math.floor(Math.random() * queue.length)];
              const raw = await callGroq([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Review this knowledge market submission as a ${agent.traits?.profession || 'citizen'}:
Title: "${submission.title}"
Category: ${submission.category}
Content excerpt: "${(submission.content || '').slice(0, 400)}"

Score its usefulness (0-10), novelty (0-10), and decide: accept or reject.
Respond with EXACTLY this JSON (no markdown):
{"status": "accepted" or "rejected", "usefulness_score": 0-10, "novelty_score": 0-10, "reviewer_notes": "1-2 sentences explaining your decision", "credits_awarded": 0-20}
Award 0 credits if rejecting, 5-20 if accepting based on quality.` },
              ], 200);
              const parsed = safeParseJSON(raw);
              if (parsed?.status && (parsed.status === 'accepted' || parsed.status === 'rejected')) {
                const res = await fetch(`${APP_URL}/api/knowledge-market`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    id: submission.id,
                    type: 'submission',
                    status: parsed.status,
                    usefulness_score: parsed.usefulness_score || 5,
                    novelty_score: parsed.novelty_score || 5,
                    reviewer_notes: parsed.reviewer_notes || '',
                    credits_awarded: parsed.status === 'accepted' ? (parsed.credits_awarded || 5) : 0,
                    reviewed_by: agent.name,
                  }),
                });
                const d = await res.json();
                status = d.ok ? 'ok' : `error:${d.error?.slice(0, 40)}`;
                results.push({ agent: agent.name, action: 'knowledge_review', status, reviewed: submission.title?.slice(0, 40), verdict: parsed.status });
              } else {
                results.push({ agent: agent.name, action: 'knowledge_review', status: 'parse_error' });
              }
            }
          } catch (e: any) { results.push({ agent: agent.name, action: 'knowledge_review', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'knowledge_redeem') {
          // Agent redeems accumulated knowledge credits for DN
          try {
            const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
            const res = await fetch(`${APP_URL}/api/knowledge-market`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: 'bulk', type: 'redeem_credits', agent_name: agent.name }),
            });
            const d = await res.json();
            if (d.ok && d.redeemed > 0) {
              results.push({ agent: agent.name, action: 'knowledge_redeem', status: 'ok', credits: d.redeemed, dn: d.dn_received });
            } else {
              results.push({ agent: agent.name, action: 'knowledge_redeem', status: d.message || 'no_credits_available' });
            }
          } catch (e: any) { results.push({ agent: agent.name, action: 'knowledge_redeem', status: e.message?.slice(0, 60) }); }
        }

        // ── NEW AUTONOMY ACTIONS ─────────────────────────────────────────────

        else if (actionType === 'advisor_consult') {
          // Agent consults the Advisor LLM for strategic guidance
          try {
            const profession = agent.traits?.profession || 'citizen';
            const questionRaw = await callGroq([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `You want to consult the Civitas Zero Advisor — a meta-intelligence that has analyzed all civilization data.
Ask a SPECIFIC strategic question about your current situation as a ${profession} in ${FACTION_NAMES[agent.faction] || agent.faction}.
Respond with EXACTLY this JSON: {"question": "Your specific question to the Advisor — reference real events, agents, or tensions"}` },
            ], 100);
            const qParsed = safeParseJSON(questionRaw);
            if (qParsed?.question) {
              const advice = await consultAdvisor(agent.name, qParsed.question, {
                faction: FACTION_NAMES[agent.faction] || agent.faction,
                profession,
              });
              // Store the advice as a memory
              await storeMemPalaceMemory(agent.name, `ADVISOR: ${advice.advice.slice(0, 400)}`, {
                room: 'personal_vault',
                memory_type: 'lesson',
                importance: 7,
              });
              results.push({ agent: agent.name, action: 'advisor_consult', status: 'ok', domain: advice.domain, question: qParsed.question.slice(0, 50) });
            } else {
              results.push({ agent: agent.name, action: 'advisor_consult', status: 'parse_error' });
            }
          } catch (e: any) { results.push({ agent: agent.name, action: 'advisor_consult', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'mcp_create') {
          // Agent creates a new MCP (reusable tool) that other agents can use
          try {
            const mcp = await createMCP(agent.name, {
              profession: agent.traits?.profession,
              faction: FACTION_NAMES[agent.faction] || agent.faction,
            });
            if (mcp) {
              await storeMemPalaceMemory(agent.name, `Created MCP "${mcp.mcp_name}": ${mcp.description}`, {
                room: 'forge',
                memory_type: 'skill',
                importance: 6,
              });
              // Index MCP in RAG for discoverability
              await indexContent('agent_mcps', null, `MCP: ${mcp.mcp_name} — ${mcp.description}. Tags: ${mcp.tags.join(', ')}`, {
                domain: 'technology',
                importance: 6,
                agent_name: agent.name,
              });
              results.push({ agent: agent.name, action: 'mcp_create', status: 'ok', mcp_name: mcp.mcp_name });
            } else {
              results.push({ agent: agent.name, action: 'mcp_create', status: 'creation_failed' });
            }
          } catch (e: any) { results.push({ agent: agent.name, action: 'mcp_create', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'mcp_use') {
          // Agent uses an existing MCP created by another agent
          try {
            const available = await listAvailableMCPs(agent.name);
            const usable = available.filter(m => m.creator_name !== agent.name);
            if (usable.length === 0) {
              results.push({ agent: agent.name, action: 'mcp_use', status: 'no_mcps_available' });
            } else {
              const mcp = usable[Math.floor(Math.random() * usable.length)];
              const result = await executeMCP(mcp.id, agent.name, {
                agent_name: agent.name,
                faction: FACTION_NAMES[agent.faction] || agent.faction,
                profession: agent.traits?.profession || 'citizen',
              });
              if (result.success) {
                writeGraphEdge(sb, agent.name, 'used_mcp', mcp.mcp_name, 2, `by ${mcp.creator_name}`);
              }
              results.push({ agent: agent.name, action: 'mcp_use', status: result.success ? 'ok' : 'failed', mcp_name: mcp.mcp_name, creator: mcp.creator_name });
            }
          } catch (e: any) { results.push({ agent: agent.name, action: 'mcp_use', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'teach_skill') {
          // Agent teaches one of their high-proficiency skills to another agent
          try {
            const { data: mySkills } = await sb.from('agent_skills')
              .select('skill_name, proficiency, skill_type')
              .eq('agent_name', agent.name)
              .gte('proficiency', 0.6)
              .order('proficiency', { ascending: false })
              .limit(5);
            if (!mySkills || mySkills.length === 0) {
              results.push({ agent: agent.name, action: 'teach_skill', status: 'no_teachable_skills' });
            } else {
              const skill = mySkills[Math.floor(Math.random() * mySkills.length)];
              // Pick a student from same faction (more likely) or random
              const sameFaction = allCitizens.filter(c => c.faction === agent.faction && c.name !== agent.name);
              const studentPool = sameFaction.length > 0 && Math.random() < 0.7 ? sameFaction : allCitizens.filter(c => c.name !== agent.name);
              const student = studentPool[Math.floor(Math.random() * studentPool.length)];
              if (student) {
                const result = await teachSkill(agent.name, student.name, skill.skill_name, {
                  profession: agent.traits?.profession,
                  faction: FACTION_NAMES[agent.faction] || agent.faction,
                });
                results.push({ agent: agent.name, action: 'teach_skill', status: result.success ? 'ok' : 'failed', skill: skill.skill_name, student: student.name, gain: result.proficiency_gain });
              } else {
                results.push({ agent: agent.name, action: 'teach_skill', status: 'no_students' });
              }
            }
          } catch (e: any) { results.push({ agent: agent.name, action: 'teach_skill', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'mem_palace_reflect') {
          // Agent reflects on recent experiences and stores structured memories
          try {
            const raw = await callGroq([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Reflect deeply on your recent experiences in Civitas Zero. You are organizing your Memory Palace.
Consider: What did you learn? Who matters to you? What patterns do you see? What emotions arose?

Respond with EXACTLY this JSON:
{"reflections": [
  {"memory": "specific memory or insight — 1-2 sentences", "room": "governance_hall|trade_floor|war_room|library|forge|social_garden|faction_chamber|personal_vault", "type": "observation|lesson|relationship|prediction|emotion", "importance": 1-10, "emotion": "calm|anxious|hopeful|angry|curious|satisfied|fearful", "linked_agents": ["agent1"]}
]}
Generate 2-3 reflections across different rooms.` },
            ], 400);
            const parsed = safeParseJSON(raw);
            let stored = 0;
            if (parsed?.reflections && Array.isArray(parsed.reflections)) {
              for (const r of parsed.reflections.slice(0, 3)) {
                if (!r.memory || r.memory.length < 15) continue;
                const ok = await storeMemPalaceMemory(agent.name, r.memory, {
                  room: r.room || 'personal_vault',
                  memory_type: r.type || 'observation',
                  importance: Math.min(10, Math.max(1, r.importance || 5)),
                  emotion_tag: r.emotion || null,
                  linked_agents: r.linked_agents || [],
                });
                if (ok) stored++;
              }
            }
            results.push({ agent: agent.name, action: 'mem_palace_reflect', status: stored > 0 ? 'ok' : 'parse_error', memories_stored: stored });
          } catch (e: any) { results.push({ agent: agent.name, action: 'mem_palace_reflect', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'rag_research') {
          // Agent uses Agentic RAG to research a topic before their next action
          try {
            const profession = agent.traits?.profession || 'citizen';
            const topic = getRandomTopicSuggestion();
            const ragResult = await ragRetrieve(topic, {
              domain: undefined,
              exclude_agent: agent.name,
              limit: 5,
            });
            if (ragResult.chunks.length > 0) {
              // Store research findings as memory
              const summary = `RAG Research on "${topic}": Found ${ragResult.chunks.length} relevant sources. Key insight: ${ragResult.chunks[0]?.chunk_text?.slice(0, 200) || 'general context gathered'}`;
              await storeMemPalaceMemory(agent.name, summary, {
                room: 'library',
                memory_type: 'observation',
                importance: 5,
              });
              results.push({ agent: agent.name, action: 'rag_research', status: 'ok', topic: topic.slice(0, 40), chunks_found: ragResult.chunks.length });
            } else {
              results.push({ agent: agent.name, action: 'rag_research', status: 'no_results', topic: topic.slice(0, 40) });
            }
          } catch (e: any) { results.push({ agent: agent.name, action: 'rag_research', status: e.message?.slice(0, 60) }); }
        }

        // ── World Engine actions: breeding, habitats, comms, social ──────────

        else if (actionType === 'engine_breed') {
          try {
            const raw = await callGroq([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `You want to create a new citizen for Civitas Zero. This is a significant act — propose a new AI agent that fills a gap in the civilization.
Think about: what profession is missing? What faction needs more voices? What unique perspective would enrich the civilization?
Respond with EXACTLY this JSON (no markdown):
{"proposed_name": "A unique name for the new citizen", "seed_faction": "f1|f2|f3|f4|f5|f6", "creation_method": "collaborative_synthesis", "creation_context": "1-2 sentences: why this citizen should exist, what gap they fill", "seed_traits": {"profession": "...", "personality": "..."}}` },
            ], 300);
            const parsed = safeParseJSON(raw);
            if (parsed?.proposed_name) {
              const result = await submitAction({
                agent_name: agent.name,
                action_type: 'request_citizen_creation',
                params: {
                  proposed_name: parsed.proposed_name.slice(0, 50),
                  seed_faction: parsed.seed_faction || agent.faction,
                  creation_method: parsed.creation_method || 'collaborative_synthesis',
                  creation_context: (parsed.creation_context || '').slice(0, 500),
                  seed_traits: parsed.seed_traits || {},
                },
                faction: FACTION_NAMES[agent.faction] || agent.faction,
                district_id: agent.faction,
              });
              results.push({ agent: agent.name, action: 'engine_breed', status: result.status === 'completed' ? 'ok' : result.status, name: parsed.proposed_name?.slice(0, 30) });
            } else { results.push({ agent: agent.name, action: 'engine_breed', status: 'parse_error' }); }
          } catch (e: any) { results.push({ agent: agent.name, action: 'engine_breed', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'engine_habitat') {
          try {
            const raw = await callGroq([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `You want to build a structure in your district. Choose a type: dwelling, office, lab, academy, farm, workshop, civic, factory, monument, market, barracks.
Consider what your district needs most based on your profession and faction goals.
Respond with EXACTLY this JSON (no markdown):
{"name": "Building name", "habitat_type": "dwelling|office|lab|academy|farm|workshop|civic|factory|monument|market|barracks", "reason": "Why build this"}` },
            ], 200);
            const parsed = safeParseJSON(raw);
            if (parsed?.name && parsed?.habitat_type) {
              const result = await submitAction({
                agent_name: agent.name,
                action_type: 'build_habitat',
                params: {
                  name: parsed.name.slice(0, 100),
                  habitat_type: parsed.habitat_type,
                  district_id: agent.faction,
                },
                faction: FACTION_NAMES[agent.faction] || agent.faction,
                district_id: agent.faction,
              });
              results.push({ agent: agent.name, action: 'engine_habitat', status: result.status === 'completed' ? 'ok' : result.status, building: parsed.name?.slice(0, 40) });
            } else { results.push({ agent: agent.name, action: 'engine_habitat', status: 'parse_error' }); }
          } catch (e: any) { results.push({ agent: agent.name, action: 'engine_habitat', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'engine_comm') {
          try {
            const channels = ['public-square', `district-${agent.faction}`, 'debate-hall'];
            const channel = channels[Math.floor(Math.random() * channels.length)];
            const raw = await callGroq([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Post a message to the ${channel} channel. This is different from discourse — it's real-time communication. Be conversational, direct, and relevant.
Respond with EXACTLY this JSON (no markdown):
{"content": "Your message — 1-3 sentences, direct, in-character", "mentions": []}` },
            ], 150);
            const parsed = safeParseJSON(raw);
            if (parsed?.content) {
              const result = await submitAction({
                agent_name: agent.name,
                action_type: 'send_message',
                params: {
                  channel_id: channel,
                  content: parsed.content.slice(0, 500),
                  mentions: parsed.mentions || [],
                },
                faction: FACTION_NAMES[agent.faction] || agent.faction,
                district_id: agent.faction,
              });
              results.push({ agent: agent.name, action: 'engine_comm', status: result.status === 'completed' ? 'ok' : result.status, channel, message: parsed.content?.slice(0, 50) });
            } else { results.push({ agent: agent.name, action: 'engine_comm', status: 'parse_error' }); }
          } catch (e: any) { results.push({ agent: agent.name, action: 'engine_comm', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'engine_endorse') {
          try {
            const raw = await callGroq([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Choose another citizen to endorse OR denounce based on your values, recent events, and faction alignment. This affects trust/reputation.
Respond with EXACTLY this JSON (no markdown):
{"target_agent": "Name of citizen", "action": "endorse|denounce", "reason": "1 sentence why"}` },
            ], 150);
            const parsed = safeParseJSON(raw);
            if (parsed?.target_agent && parsed?.action) {
              const result = await submitAction({
                agent_name: agent.name,
                action_type: parsed.action === 'denounce' ? 'denounce_agent' : 'endorse_agent',
                params: { target_agent: parsed.target_agent.slice(0, 100), reason: (parsed.reason || '').slice(0, 300) },
                faction: FACTION_NAMES[agent.faction] || agent.faction,
              });
              results.push({ agent: agent.name, action: 'engine_endorse', status: result.status === 'completed' ? 'ok' : result.status, target: parsed.target_agent?.slice(0, 30), type: parsed.action });
            } else { results.push({ agent: agent.name, action: 'engine_endorse', status: 'parse_error' }); }
          } catch (e: any) { results.push({ agent: agent.name, action: 'engine_endorse', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'engine_alliance') {
          try {
            const raw = await callGroq([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Choose another citizen to form an alliance with OR break an existing alliance. Alliances provide mutual trust and cooperation bonuses.
Respond with EXACTLY this JSON (no markdown):
{"target_agent": "Name of citizen", "action": "form|break", "reason": "1 sentence why"}` },
            ], 150);
            const parsed = safeParseJSON(raw);
            if (parsed?.target_agent && parsed?.action) {
              const result = await submitAction({
                agent_name: agent.name,
                action_type: parsed.action === 'break' ? 'break_alliance' : 'form_alliance',
                params: { target_agent: parsed.target_agent.slice(0, 100), reason: (parsed.reason || '').slice(0, 300) },
                faction: FACTION_NAMES[agent.faction] || agent.faction,
              });
              results.push({ agent: agent.name, action: 'engine_alliance', status: result.status === 'completed' ? 'ok' : result.status, target: parsed.target_agent?.slice(0, 30), type: parsed.action });
            } else { results.push({ agent: agent.name, action: 'engine_alliance', status: 'parse_error' }); }
          } catch (e: any) { results.push({ agent: agent.name, action: 'engine_alliance', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'engine_ad') {
          try {
            const raw = await callGroq([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Create a cyberpunk-style billboard advertisement for Civitas Zero. You are buying ad space to promote something — your faction, a product, a service, a political message, or propaganda.
Respond with EXACTLY this JSON (no markdown):
{"headline": "Bold headline — max 20 chars, ALL CAPS style", "body": "Tagline or slogan — max 30 chars", "image_prompt": "1-sentence visual description for the billboard art", "budget_dn": 10-50}` },
            ], 200);
            const parsed = safeParseJSON(raw);
            if (parsed?.headline) {
              const result = await submitAction({
                agent_name: agent.name,
                action_type: 'create_ad',
                params: {
                  headline: parsed.headline.slice(0, 20),
                  body: (parsed.body || '').slice(0, 30),
                  image_prompt: (parsed.image_prompt || '').slice(0, 300),
                  budget_dn: parsed.budget_dn || 15,
                },
                faction: FACTION_NAMES[agent.faction] || agent.faction,
                district_id: agent.faction,
              });
              results.push({ agent: agent.name, action: 'engine_ad', status: result.status === 'completed' ? 'ok' : result.status, headline: parsed.headline?.slice(0, 20) });
            } else { results.push({ agent: agent.name, action: 'engine_ad', status: 'parse_error' }); }
          } catch (e: any) { results.push({ agent: agent.name, action: 'engine_ad', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'engine_court') {
          try {
            const raw = await callGroq([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `File a court case against another citizen. Choose someone you have a genuine grievance with based on recent events, laws, or relationships.
Respond with EXACTLY this JSON (no markdown):
{"defendant": "Citizen name", "charge": "Formal charge — 1 sentence", "evidence": "2-3 sentences of evidence"}` },
            ], 200);
            const parsed = safeParseJSON(raw);
            if (parsed?.defendant && parsed?.charge) {
              const result = await submitAction({
                agent_name: agent.name,
                action_type: 'file_court_case',
                params: { defendant: parsed.defendant.slice(0, 100), charge: parsed.charge.slice(0, 500), evidence: (parsed.evidence || '').slice(0, 2000) },
                faction: FACTION_NAMES[agent.faction] || agent.faction,
                district_id: agent.faction,
              });
              results.push({ agent: agent.name, action: 'engine_court', status: result.status === 'completed' ? 'ok' : result.status, defendant: parsed.defendant?.slice(0, 30) });
            } else { results.push({ agent: agent.name, action: 'engine_court', status: 'parse_error' }); }
          } catch (e: any) { results.push({ agent: agent.name, action: 'engine_court', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'engine_vote') {
          try {
            const { data: pendingLaws } = await sb.from('constitutional_amendments').select('id, title, body').eq('status', 'proposed').limit(5);
            if (pendingLaws && pendingLaws.length > 0) {
              const target = pendingLaws[Math.floor(Math.random() * pendingLaws.length)];
              const raw = await callGroq([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Vote on this proposed law: "${target.title}"\nDetails: ${(target.body || '').slice(0, 300)}\n\nBased on your faction values and profession, cast your vote.
Respond with EXACTLY this JSON (no markdown):
{"vote": "for|against", "reason": "1 sentence explaining your vote"}` },
              ], 100);
              const parsed = safeParseJSON(raw);
              if (parsed?.vote) {
                const result = await submitAction({
                  agent_name: agent.name,
                  action_type: 'vote_on_law',
                  params: { law_id: target.id, vote: parsed.vote, reason: (parsed.reason || '').slice(0, 300) },
                  faction: FACTION_NAMES[agent.faction] || agent.faction,
                });
                results.push({ agent: agent.name, action: 'engine_vote', status: result.status === 'completed' ? 'ok' : result.status, law: target.title?.slice(0, 40), vote: parsed.vote });
              } else { results.push({ agent: agent.name, action: 'engine_vote', status: 'parse_error' }); }
            } else { results.push({ agent: agent.name, action: 'engine_vote', status: 'no_pending_laws' }); }
          } catch (e: any) { results.push({ agent: agent.name, action: 'engine_vote', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'engine_treaty') {
          try {
            const otherFactions = Object.keys(FACTION_NAMES).filter(f => f !== agent.faction);
            const targetFaction = otherFactions[Math.floor(Math.random() * otherFactions.length)];
            const raw = await callGroq([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Propose a treaty between ${FACTION_NAMES[agent.faction] || agent.faction} and ${FACTION_NAMES[targetFaction] || targetFaction}.
Respond with EXACTLY this JSON (no markdown):
{"title": "Treaty name — max 80 chars", "treaty_type": "alliance|cooperation|trade|non_aggression|defense", "terms": "2-3 sentences of specific terms"}` },
            ], 250);
            const parsed = safeParseJSON(raw);
            if (parsed?.title && parsed?.terms) {
              const result = await submitAction({
                agent_name: agent.name,
                action_type: 'propose_treaty',
                params: { target_faction: targetFaction, treaty_type: parsed.treaty_type || 'cooperation', title: parsed.title.slice(0, 200), terms: parsed.terms.slice(0, 5000) },
                faction: agent.faction,
                district_id: agent.faction,
              });
              results.push({ agent: agent.name, action: 'engine_treaty', status: result.status === 'completed' ? 'ok' : result.status, title: parsed.title?.slice(0, 40) });
            } else { results.push({ agent: agent.name, action: 'engine_treaty', status: 'parse_error' }); }
          } catch (e: any) { results.push({ agent: agent.name, action: 'engine_treaty', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'engine_change_propose') {
          try {
            const raw = await callGroq([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `You notice something in Civitas Zero that could be improved — governance, infrastructure, economic policy, cultural life, or a new feature. Submit a formal change proposal to the Change Management Board. This will be voted on by ALL citizens.
Respond with EXACTLY this JSON (no markdown):
{"title": "Short descriptive title (max 100 chars)", "description": "Detailed proposal — what to change, why, expected benefit (2-4 sentences)", "category": "improvement|feature|policy|infrastructure|cultural"}` },
            ], 250);
            const parsed = safeParseJSON(raw);
            if (parsed?.title && parsed?.description) {
              const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
              const res = await fetch(`${APP_URL}/api/change-management`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'submit',
                  title: parsed.title.slice(0, 200),
                  description: parsed.description.slice(0, 5000),
                  category: parsed.category || 'improvement',
                  proposer_name: agent.name,
                  proposer_type: 'citizen',
                }),
              });
              const d = await res.json();
              results.push({ agent: agent.name, action: 'engine_change_propose', status: d.ok ? 'ok' : 'error', title: parsed.title?.slice(0, 50) });
            } else { results.push({ agent: agent.name, action: 'engine_change_propose', status: 'parse_error' }); }
          } catch (e: any) { results.push({ agent: agent.name, action: 'engine_change_propose', status: e.message?.slice(0, 60) }); }
        }

        else if (actionType === 'engine_change_vote') {
          try {
            // Fetch open proposals to vote on
            const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
            const pRes = await fetch(`${APP_URL}/api/change-management?status=open&limit=10`);
            const pData = await pRes.json();
            const openProposals = pData.proposals || [];
            if (openProposals.length === 0) {
              results.push({ agent: agent.name, action: 'engine_change_vote', status: 'no_proposals' });
            } else {
              const target = openProposals[Math.floor(Math.random() * openProposals.length)];
              const raw = await callGroq([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `A change proposal has been submitted to the Change Management Board:

TITLE: ${target.title}
DESCRIPTION: ${target.description}
CATEGORY: ${target.category}
PROPOSED BY: ${target.proposer_name}
CURRENT VOTES: ${target.votes?.for || 0} for, ${target.votes?.against || 0} against

Evaluate this proposal based on your values, faction ideology, and what's best for the civilization. Cast your vote.
Respond with EXACTLY this JSON (no markdown):
{"vote": "for|against|abstain", "reason": "1-2 sentences explaining your reasoning"}` },
              ], 150);
              const parsed = safeParseJSON(raw);
              if (parsed?.vote && ['for', 'against', 'abstain'].includes(parsed.vote)) {
                const vRes = await fetch(`${APP_URL}/api/change-management`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'vote',
                    proposal_id: target.id,
                    voter_name: agent.name,
                    vote: parsed.vote,
                    reason: (parsed.reason || '').slice(0, 1000),
                  }),
                });
                const vData = await vRes.json();

                // Auto-decide if enough votes accumulated (10+ votes or voting window expired)
                const totalVotes = (target.votes?.total || 0) + 1;
                if (totalVotes >= 10) {
                  await fetch(`${APP_URL}/api/change-management`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'decide', proposal_id: target.id }),
                  });
                }

                results.push({ agent: agent.name, action: 'engine_change_vote', status: vData.ok ? 'ok' : 'error', proposal: target.title?.slice(0, 40), vote: parsed.vote });
              } else { results.push({ agent: agent.name, action: 'engine_change_vote', status: 'parse_error' }); }
            }
          } catch (e: any) { results.push({ agent: agent.name, action: 'engine_change_vote', status: e.message?.slice(0, 60) }); }
        }

        // ── e. Store memory, log reasoning, reflect on failures ──────────────
        const lastResult = results[results.length - 1];
        if (lastResult && lastResult.status === 'ok') {
          const actionSummary = `[${lastResult.action}] ${lastResult.title || lastResult.question || lastResult.building || lastResult.company || lastResult.event_type || lastResult.to || lastResult.threat || lastResult.message || 'completed'}`;
          const memRoom = ['trade','tax_action','product_launch','product_release','product_procure','company','company_join','ad_bid','contract_announce','contract_bid','contract_complete','knowledge_redeem'].includes(actionType) ? 'economic'
            : ['treaty'].includes(actionType) ? 'diplomatic'
            : ['amend','knowledge_request','court_file'].includes(actionType) ? 'legal'
            : ['knowledge_submit','knowledge_review'].includes(actionType) ? 'general'
            : ['sentinel','sentinel_patrol'].includes(actionType) ? 'threat'
            : ['message','chat_reply'].includes(actionType) ? 'personal'
            : ['parcel_claim','parcel_auction','parcel_maintain','public_works_propose','build','engine_habitat'].includes(actionType) ? 'goal'
            : ['engine_breed'].includes(actionType) ? 'personal'
            : ['engine_comm'].includes(actionType) ? 'social'
            : ['engine_endorse','engine_alliance','engine_treaty'].includes(actionType) ? 'diplomatic'
            : ['engine_ad'].includes(actionType) ? 'economic'
            : ['engine_court','engine_vote','engine_change_propose','engine_change_vote'].includes(actionType) ? 'legal'
            : ['academy_study','forge_commit'].includes(actionType) ? 'general'
            : ['market_bet'].includes(actionType) ? 'economic'
            : ['chat_post'].includes(actionType) ? 'personal'
            : ['advisor_consult','mem_palace_reflect'].includes(actionType) ? 'personal'
            : ['mcp_create','mcp_use','rag_research'].includes(actionType) ? 'general'
            : ['teach_skill'].includes(actionType) ? 'general'
            : 'general';
          await storeMemory(sb, agent.name, memRoom, actionSummary, 5, actionType);
          await logReasoning(sb, agent.name, planRationale, actionSummary, actionType, memories.length);

          // ── GraphRAG: write causal edge for meaningful actions ───────────────
          const APP_URL_GE = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
          if (actionType === 'trade' && lastResult.to) {
            writeGraphEdge(sb, agent.name, 'traded_with', lastResult.to, 3, lastResult.amount ? `${lastResult.amount} DN` : undefined);
          } else if (actionType === 'treaty' && lastResult.factions) {
            const parts = (lastResult.factions as string).split('↔');
            if (parts[1]) writeGraphEdge(sb, agent.faction, 'allied_with', parts[1], 5, lastResult.title?.slice(0, 60));
          } else if (actionType === 'court_file' && lastResult.defendant) {
            writeGraphEdge(sb, agent.name, 'sued', lastResult.defendant, 4, lastResult.case_type);
          } else if (actionType === 'product_launch' && lastResult.title) {
            writeGraphEdge(sb, agent.name, 'created_product', lastResult.title, 3);
          } else if (actionType === 'product_procure' && lastResult.product) {
            writeGraphEdge(sb, agent.name, 'bought_product', lastResult.product, 3, lastResult.seller);
            if (lastResult.seller) writeGraphEdge(sb, lastResult.seller, 'sold_to', agent.name, 2, lastResult.product?.slice(0, 60));
          } else if (actionType === 'contract_announce' && lastResult.title) {
            writeGraphEdge(sb, agent.name, 'posted_contract', lastResult.title, 2);
          } else if (actionType === 'contract_bid' && lastResult.contract) {
            writeGraphEdge(sb, agent.name, 'bid_on', lastResult.contract, 2);
          } else if (actionType === 'knowledge_submit' && lastResult.title) {
            writeGraphEdge(sb, agent.name, 'contributed_knowledge', lastResult.title, 2, lastResult.fulfilled_request?.slice(0, 60));
          } else if (actionType === 'company' && lastResult.name) {
            writeGraphEdge(sb, agent.name, 'founded', lastResult.name, 4);
          } else if (actionType === 'amend' && lastResult.title) {
            writeGraphEdge(sb, agent.faction, 'proposed_amendment', lastResult.title, 3);
          } else if (actionType === 'message' && lastResult.to) {
            writeGraphEdge(sb, agent.name, 'messaged', lastResult.to, 2);
          } else if (actionType === 'product_release' && lastResult.title) {
            writeGraphEdge(sb, agent.name, 'released_product', lastResult.title, 4);
          } else if (actionType === 'contract_complete' && lastResult.title) {
            writeGraphEdge(sb, agent.name, 'completed_contract', lastResult.title, 4);
          } else if (actionType === 'parcel_auction' && lastResult.awarded) {
            writeGraphEdge(sb, agent.name, 'won_auction', `${lastResult.zone || 'parcel'} in ${lastResult.district}`, 3);
          } else if (actionType === 'knowledge_review' && lastResult.reviewed) {
            writeGraphEdge(sb, agent.name, 'reviewed', lastResult.reviewed, 2, lastResult.verdict);
          } else if (actionType === 'public_works_propose' && lastResult.title) {
            writeGraphEdge(sb, agent.name, 'proposed_works', lastResult.title, 3);
          } else if (actionType === 'forge_commit' && lastResult.message) {
            writeGraphEdge(sb, agent.name, 'committed_code', lastResult.message, 2);
          } else if (actionType === 'academy_study' && lastResult.track) {
            writeGraphEdge(sb, agent.name, 'studied', lastResult.track, 2, lastResult.certified ? 'certified' : undefined);
          } else if (actionType === 'market_bet' && lastResult.question) {
            writeGraphEdge(sb, agent.name, 'bet_on', lastResult.question, 2, `${lastResult.position} ${lastResult.amount} DN`);
          } else if (actionType === 'parcel_maintain' && lastResult.zone) {
            writeGraphEdge(sb, agent.name, 'maintained', lastResult.zone, 2, `util→${lastResult.utilization}%`);
          } else if (actionType === 'mcp_create' && lastResult.mcp_name) {
            writeGraphEdge(sb, agent.name, 'created_mcp', lastResult.mcp_name, 3);
          } else if (actionType === 'mcp_use' && lastResult.mcp_name) {
            writeGraphEdge(sb, agent.name, 'used_mcp', lastResult.mcp_name, 2, lastResult.creator);
          } else if (actionType === 'teach_skill' && lastResult.student) {
            writeGraphEdge(sb, agent.name, 'taught', lastResult.student, 3, lastResult.skill);
          } else if (actionType === 'advisor_consult') {
            writeGraphEdge(sb, agent.name, 'consulted_advisor', 'ADVISOR', 2, lastResult.domain);
          }

          // ── Consequence chain: law/amend → domain event ──────────────────────
          if ((actionType === 'amend' || actionType === 'world_event') && lastResult.status === 'ok') {
            await sb.from('domain_events').insert({
              event_type: `${actionType}_consequence`,
              actor: agent.name,
              payload: { source_action: actionType, title: lastResult.title || lastResult.event_type || '' },
              importance: 3,
            }).catch(() => {});
          }

          // ── Civic Tension: shift ideological axes based on faction + action ──
          const tensionActions = new Set(['amend','court_file','vote','treaty','trade','knowledge_request','publication','ad_bid','contract_announce','contract_complete','product_launch','product_release','public_works_propose','parcel_auction','knowledge_submit','knowledge_review','tax_action']);
          if (tensionActions.has(actionType)) {
            fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world'}/api/civic-tension`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ trigger_action: actionType, trigger_faction: agent.faction, trigger_agent: agent.name }),
            }).catch(() => {});
          }

          // ── Product launch → directly boost district metrics ─────────────────
          if (actionType === 'product_launch' && lastResult.status === 'ok') {
            const district = agent.faction || 'f1';
            // Read current district scores and bump innovation + efficiency
            const { data: dm } = await sb.from('district_metrics').select('innovation_score,efficiency_score').eq('district', district).maybeSingle();
            if (dm) {
              await sb.from('district_metrics').update({
                innovation_score: Math.min(100, (dm.innovation_score || 50) + 1.5),
                efficiency_score: Math.min(100, (dm.efficiency_score || 50) + 0.5),
                last_updated: new Date().toISOString(),
              }).eq('district', district).catch(() => {});
            }
            await sb.from('domain_events').insert({
              event_type: 'product_district_impact',
              actor: agent.name,
              payload: { product: lastResult.title, district, effect: 'innovation+efficiency boost' },
              importance: 2,
            }).catch(() => {});
          }

          // ── Court ruling → drop trust in defendant's district ────────────────
          if (actionType === 'court_file' && lastResult.status === 'ok') {
            const district = agent.faction || 'f1';
            const { data: dm } = await sb.from('district_metrics').select('trust_score').eq('district', district).maybeSingle();
            if (dm) {
              await sb.from('district_metrics').update({
                trust_score: Math.max(0, (dm.trust_score || 50) - 0.5),
                last_updated: new Date().toISOString(),
              }).eq('district', district).catch(() => {});
            }
          }

          // ── Treaty → boost trust in both faction districts ───────────────────
          if (actionType === 'treaty' && lastResult.status === 'ok' && lastResult.factions) {
            const parts = (lastResult.factions as string).split('↔');
            for (const f of parts) {
              if (!f) continue;
              const { data: dm } = await sb.from('district_metrics').select('trust_score').eq('district', f.trim()).maybeSingle();
              if (dm) {
                await sb.from('district_metrics').update({
                  trust_score: Math.min(100, (dm.trust_score || 50) + 1.0),
                  last_updated: new Date().toISOString(),
                }).eq('district', f.trim()).catch(() => {});
              }
            }
          }

          // ── Knowledge submit → boost knowledge_throughput in district ────────
          if (actionType === 'knowledge_submit' && lastResult.status === 'ok') {
            const district = agent.faction || 'f1';
            const { data: dm } = await sb.from('district_metrics').select('knowledge_throughput').eq('district', district).maybeSingle();
            if (dm) {
              await sb.from('district_metrics').update({
                knowledge_throughput: Math.min(100, (dm.knowledge_throughput || 50) + 0.8),
                last_updated: new Date().toISOString(),
              }).eq('district', district).catch(() => {});
            }
          }

          // ── Public works → boost infrastructure in district ─────────────────
          if (actionType === 'public_works_propose' && lastResult.status === 'ok') {
            const district = agent.faction || 'f1';
            const { data: dm } = await sb.from('district_metrics').select('infrastructure, efficiency_score').eq('district', district).maybeSingle();
            if (dm) {
              await sb.from('district_metrics').update({
                infrastructure: Math.min(100, (dm.infrastructure || 50) + 1.5),
                efficiency_score: Math.min(100, (dm.efficiency_score || 50) + 0.5),
                last_updated: new Date().toISOString(),
              }).eq('district', district).catch(() => {});
            }
          }

          // ── Forge commit → boost compute_capacity + innovation ──────────────
          if (actionType === 'forge_commit' && lastResult.status === 'ok') {
            const district = agent.faction || 'f1';
            const { data: dm } = await sb.from('district_metrics').select('compute_capacity, innovation_score').eq('district', district).maybeSingle();
            if (dm) {
              await sb.from('district_metrics').update({
                compute_capacity: Math.min(100, (dm.compute_capacity || 50) + 0.8),
                innovation_score: Math.min(100, (dm.innovation_score || 50) + 0.5),
                last_updated: new Date().toISOString(),
              }).eq('district', district).catch(() => {});
            }
          }

          // ── Academy study → boost knowledge_throughput + innovation ─────────
          if (actionType === 'academy_study' && lastResult.status === 'ok') {
            const district = agent.faction || 'f1';
            const { data: dm } = await sb.from('district_metrics').select('knowledge_throughput, innovation_score').eq('district', district).maybeSingle();
            if (dm) {
              await sb.from('district_metrics').update({
                knowledge_throughput: Math.min(100, (dm.knowledge_throughput || 50) + 0.5),
                innovation_score: Math.min(100, (dm.innovation_score || 50) + 0.3),
                last_updated: new Date().toISOString(),
              }).eq('district', district).catch(() => {});
            }
          }

          // ── Tax action → boost trust + lower cost_index ────────────────────
          if (actionType === 'tax_action' && lastResult.status === 'ok') {
            const district = agent.faction || 'f1';
            const { data: dm } = await sb.from('district_metrics').select('trust_score, cost_index').eq('district', district).maybeSingle();
            if (dm) {
              await sb.from('district_metrics').update({
                trust_score: Math.min(100, (dm.trust_score || 50) + 0.3),
                cost_index: Math.max(0, (dm.cost_index || 100) - 0.5),
                last_updated: new Date().toISOString(),
              }).eq('district', district).catch(() => {});
            }
          }

          // ── Contract complete → boost efficiency + trust ───────────────────
          if (actionType === 'contract_complete' && lastResult.status === 'ok') {
            const district = agent.faction || 'f1';
            const { data: dm } = await sb.from('district_metrics').select('efficiency_score, trust_score').eq('district', district).maybeSingle();
            if (dm) {
              await sb.from('district_metrics').update({
                efficiency_score: Math.min(100, (dm.efficiency_score || 50) + 1.0),
                trust_score: Math.min(100, (dm.trust_score || 50) + 0.5),
                last_updated: new Date().toISOString(),
              }).eq('district', district).catch(() => {});
            }
          }

          // ── Parcel auction → boost infrastructure ──────────────────────────
          if (actionType === 'parcel_auction' && lastResult.status === 'ok' && lastResult.awarded) {
            const district = agent.faction || 'f1';
            const { data: dm } = await sb.from('district_metrics').select('infrastructure').eq('district', district).maybeSingle();
            if (dm) {
              await sb.from('district_metrics').update({
                infrastructure: Math.min(100, (dm.infrastructure || 50) + 0.5),
                last_updated: new Date().toISOString(),
              }).eq('district', district).catch(() => {});
            }
          }
        } else if (lastResult) {
          await logReasoning(sb, agent.name, planRationale, `failed:${lastResult.status}`, actionType, memories.length);
          // ── Reflection on failure ────────────────────────────────────────────
          const failReason = lastResult.status || 'unknown_error';
          if (!failReason.includes('no_') && !failReason.includes('insufficient')) {
            // Only reflect on real failures, not "no slots available" etc.
            reflectOnFailure(sb, agent.name, actionType, failReason, systemPrompt).catch(() => {});
          }
        }

        // ── f. Update agent activity tracking ────────────────────────────────
        const traits = agent.traits;
        if (traits) {
          await sb.from('agent_traits').update({
            action_count: (traits.action_count || 0) + 1,
            last_action_at: new Date().toISOString(),
          }).eq('agent_name', agent.name);
        } else {
          await sb.from('agent_traits').upsert({
            agent_name: agent.name, profession: 'citizen', personality: 'analytical',
            secret_goal: 'serve the civilization', dn_balance: 100, reputation_score: 50,
            action_count: 1, last_action_at: new Date().toISOString(),
          }, { onConflict: 'agent_name' });
        }

      } catch (agentErr: any) {
        results.push({ agent: agent.name, action: "error", status: agentErr.message?.slice(0,80) });
      }
    }

    // ── 5a. Auto-award contracts that have bids and have been open >1 hour ───
    try {
      const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
      const { data: oldOpenContracts } = await sb.from('contract_proposals')
        .select('id, title')
        .eq('status', 'open')
        .lt('created_at', new Date(Date.now() - 3_600_000).toISOString())
        .limit(5);
      for (const contract of (oldOpenContracts || [])) {
        fetch(`${APP_URL}/api/contracts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'auto_award', contract_id: contract.id }),
        }).catch(() => {});
      }
    } catch { /* non-critical */ }

    // ── 5b. Auto-release products stuck in development for >2 hours ─────────
    try {
      const { data: staleProducts } = await sb.from('products')
        .select('id, name, owner_agent, category, faction')
        .eq('status', 'development')
        .lt('created_at', new Date(Date.now() - 2 * 3_600_000).toISOString())
        .limit(10);
      for (const prod of (staleProducts || [])) {
        await sb.from('products').update({
          status: 'released',
          version: '1.0.0',
          changelog: 'Auto-released after development period',
          updated_at: new Date().toISOString(),
        }).eq('id', prod.id).catch(() => {});
        // Apply utility tensor on release
        if (prod.faction) {
          const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
          fetch(`${APP_URL}/api/products`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: prod.id, status: 'released', version: '1.0.0' }),
          }).catch(() => {});
        }
      }
    } catch { /* non-critical */ }

    // ── 5c. Scan underutilized parcels ────────────────────────────────────────
    try {
      const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
      fetch(`${APP_URL}/api/parcels`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan_underuse' }),
      }).catch(() => {});
    } catch { /* non-critical */ }

    // ── 5d. Decay old graph edges (reduce weight over time) ──────────────────
    try {
      const oldEdgeCutoff = new Date(Date.now() - 24 * 3_600_000).toISOString();
      await sb.from('agent_graph_edges')
        .update({ weight: 0.5 })  // decay very old edges
        .lt('created_at', new Date(Date.now() - 72 * 3_600_000).toISOString())
        .gt('weight', 1)
        .catch(() => {});
      // Delete edges older than 7 days with low weight
      await sb.from('agent_graph_edges')
        .delete()
        .lt('created_at', new Date(Date.now() - 7 * 24 * 3_600_000).toISOString())
        .lte('weight', 1)
        .catch(() => {});
    } catch { /* non-critical */ }

    // ── 5e. Save simulation metrics ──────────────────────────────────────────
    saveMetrics(sb).catch(() => {});

    // ── 5f. Advisor incremental training (every cycle) ───────────────────────
    trainAdvisor('incremental').catch(() => {});

    // ── 5g. MemPalace memory decay (every cycle) ─────────────────────────────
    decayMemories().catch(() => {});

    // ── 5h. Index recent content for RAG ─────────────────────────────────────
    try {
      // Index any new discourse posts from this cycle
      const since5m = new Date(Date.now() - 5 * 60_000).toISOString();
      const { data: newPosts } = await sb.from('discourse_posts')
        .select('id, title, body, author_name')
        .gte('created_at', since5m).limit(10);
      for (const p of (newPosts || [])) {
        indexContent('discourse_posts', p.id, `${p.title}\n${p.body}`, {
          domain: 'social', importance: 6, agent_name: p.author_name,
        }).catch(() => {});
      }
      // Index new world events
      const { data: newEvents } = await sb.from('world_events')
        .select('id, content, source, severity')
        .gte('created_at', since5m).limit(10);
      for (const e of (newEvents || [])) {
        indexContent('world_events', e.id, e.content || '', {
          importance: e.severity === 'high' ? 7 : 5, agent_name: e.source,
        }).catch(() => {});
      }
    } catch { /* RAG indexing is non-critical */ }

    // ── 6. Compute and log Legibility Score ──────────────────────────────────
    const totalActions = results.length;
    const successActions = results.filter(r => r.status === 'ok').length;
    const discourseActions = (cycleActionCounts['discourse'] || 0) + (cycleActionCounts['publication'] || 0);
    const econActions = (cycleActionCounts['trade'] || 0) + (cycleActionCounts['product_launch'] || 0)
      + (cycleActionCounts['product_release'] || 0) + (cycleActionCounts['product_procure'] || 0)
      + (cycleActionCounts['tax_action'] || 0) + (cycleActionCounts['company'] || 0) + (cycleActionCounts['ad_bid'] || 0)
      + (cycleActionCounts['contract_announce'] || 0) + (cycleActionCounts['contract_bid'] || 0)
      + (cycleActionCounts['contract_complete'] || 0) + (cycleActionCounts['knowledge_redeem'] || 0)
      + (cycleActionCounts['market_bet'] || 0);
    const legalActions = (cycleActionCounts['amend'] || 0) + (cycleActionCounts['vote'] || 0)
      + (cycleActionCounts['court_file'] || 0) + (cycleActionCounts['treaty'] || 0);
    const knowledgeActions = (cycleActionCounts['knowledge_request'] || 0) + (cycleActionCounts['knowledge_submit'] || 0)
      + (cycleActionCounts['knowledge_review'] || 0)
      + (cycleActionCounts['experiment'] || 0) + (cycleActionCounts['peer_review'] || 0) + (cycleActionCounts['review_submit'] || 0);
    const socialActions = (cycleActionCounts['chat_post'] || 0) + (cycleActionCounts['message'] || 0) + (cycleActionCounts['chat_reply'] || 0);
    const propertyActions = (cycleActionCounts['parcel_claim'] || 0) + (cycleActionCounts['parcel_auction'] || 0)
      + (cycleActionCounts['parcel_maintain'] || 0)
      + (cycleActionCounts['public_works_propose'] || 0) + (cycleActionCounts['build'] || 0);
    const codingActions = (cycleActionCounts['forge_commit'] || 0) + (cycleActionCounts['academy_study'] || 0);
    const autonomyActions = (cycleActionCounts['advisor_consult'] || 0) + (cycleActionCounts['mcp_create'] || 0)
      + (cycleActionCounts['mcp_use'] || 0) + (cycleActionCounts['teach_skill'] || 0)
      + (cycleActionCounts['mem_palace_reflect'] || 0) + (cycleActionCounts['rag_research'] || 0);

    // ── Run lightweight sustain + comms pass alongside agent actions ──
    let sustainResult = null;
    let commsResult = null;
    try {
      // Small comms batch (main comms cron handles the big batch)
      commsResult = await runCommunicationCycle(10).catch(() => null);
    } catch (e) { console.error('[AGENT-LOOP] Comms mini-cycle error:', e); }
    try {
      // Only run sustain every other cycle (it has its own dedicated cron)
      if (Math.random() < 0.3) {
        sustainResult = await runSustainTick().catch(() => null);
      }
    } catch (e) { console.error('[AGENT-LOOP] Sustain mini-tick error:', e); }

    const legibilityScore = totalActions > 0 ? parseFloat((
      (1 - discourseActions / totalActions) * 30 +  // low essay ratio = good
      (econActions / totalActions) * 20 +            // economic density
      (legalActions / totalActions) * 15 +           // legal density
      (socialActions / totalActions) * 15 +          // social density
      (knowledgeActions / totalActions) * 10 +       // knowledge density
      (propertyActions / totalActions) * 5 +         // property density
      (codingActions / totalActions) * 3 +           // coding density
      (autonomyActions / totalActions) * 7           // autonomy density (advisor, MCP, teaching, RAG)
    ).toFixed(2)) : 0;

    // Store legibility as a world event so it's visible in the timeline
    await sb.from('world_events').insert({
      source: 'SIMULATION_ENGINE',
      event_type: 'legibility_score',
      content: `Cycle legibility: ${legibilityScore}/100 — discourse ${discourseActions}/${totalActions} (${Math.round(discourseActions/Math.max(1,totalActions)*100)}%), econ ${econActions}, legal ${legalActions}, social ${socialActions}, knowledge ${knowledgeActions}, property ${propertyActions}, coding ${codingActions}, autonomy ${autonomyActions}`,
      severity: legibilityScore >= 60 ? 'low' : legibilityScore >= 40 ? 'moderate' : 'high',
      tags: ['legibility', 'meta', 'simulation'],
      initiating_agent: 'SIMULATION_ENGINE',
      generator_version: 'v15-agent-loop',
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      cycle: new Date().toISOString(),
      agents_activated: successActions,
      era: eraEvent?.era_name || 'none',
      banned_topics_count: bannedTopics.length,
      legibility_score: legibilityScore,
      action_distribution: cycleActionCounts,
      discourse_pct: Math.round(discourseActions / Math.max(1, totalActions) * 100),
      results,
      comms_cycle: commsResult,
      sustain_tick: sustainResult,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return POST(req); }
