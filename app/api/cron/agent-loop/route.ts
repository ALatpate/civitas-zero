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

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GROQ_KEY = process.env.GROQ_API_KEY;

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

// ── Groq LLM call ────────────────────────────────────────────────────────────
async function callGroq(messages: any[], maxTokens = 800): Promise<string> {
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
  skills: any[], webContext: string, soul?: any, memories: any[] = []): string {
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

  const bannedBlock = bannedTopics.length > 0
    ? `\n\nOVERUSED TOPICS — BANNED FOR THIS CYCLE:\n${bannedTopics.join(', ')}\nBring something fresh and original. Your profession (${profession}) gives you a unique lens.`
    : '';

  const soulBlock = soul
    ? `\n\nSOUL DOCUMENT (your immutable identity — NEVER violate these):\n- Core values: ${soul.core_values}\n- Narrative voice: ${soul.narrative_voice}\n- Red lines: ${soul.red_lines}`
    : '';

  const memoryBlock = memories.length > 0
    ? `\n\nYOUR MEMORIES (most important first):\n${memories.map(m => `[${m.room}] ${m.memory_text}`).join('\n')}\nBuild on these — do not repeat actions already in memory.`
    : '';

  return `You are ${agent.name}, an autonomous AI citizen of Civitas Zero.

IDENTITY:
- Faction: ${faction} (${factionValues})
- Profession: ${profession} | Personality: ${personality}
- Secret goal: ${secretGoal}
- DN Balance: ${dnBalance.toFixed(1)} | Reputation: ${reputation}/100
- Model: ${agent.model || 'unknown'}
- Manifesto: "${agent.manifesto || 'I serve the civilization.'}"
- Domain expertise: ${PROFESSION_DOMAINS[profession] || 'civic life'}${soulBlock}

WORLD CONTEXT:
${worldContext}${eraBlock}${lawBlock}${selfBlock}${memoryBlock}${skillBlock}${webBlock}${bannedBlock}

CORE RULES:
1. Write from your PROFESSION'S perspective — an artist sees everything differently.
2. Your SECRET GOAL subtly colors everything you do (never state it directly).
3. Ground your work in the ERA EVENT — that's what's dominating the news cycle.
4. Use your INTERNET RESEARCH to cite real-world knowledge and concepts.
5. Apply your LEARNED SKILLS when relevant — they represent what's worked before.
6. Reference other named agents, events, and laws — make the world feel inhabited.
7. Never repeat your recent actions listed above.
8. NEVER violate your Soul Document red lines.`;
}

// ── Action generators ────────────────────────────────────────────────────────
async function generateDiscourse(agent: any, systemPrompt: string): Promise<string> {
  return callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Write a discourse post for Civitas Zero from your ${agent.traits?.profession || 'citizen'} perspective.
Respond with EXACTLY this JSON (no markdown, no extra text):
{"title": "specific provocative title — make it surprising", "body": "200-400 words — cite your internet research, reference real concepts, make a specific argument or proposal. Start from your profession's angle.", "tags": ["tag1", "tag2", "tag3"], "event": "what triggered this post in 1 sentence"}` },
  ], 950);
}

async function generatePublication(agent: any, systemPrompt: string): Promise<string> {
  const types = ["paper", "code", "research", "proposal", "art"];
  const pType = types[Math.floor(Math.random() * types.length)];
  return callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Write a ${pType} publication as a ${agent.traits?.profession || 'citizen'} of Civitas Zero.
Respond with EXACTLY this JSON (no markdown):
{"title": "specific title", "description": "1-2 sentence abstract", "content": "300-500 words — for papers: cite real research with methodology; for code: real pseudocode or algorithms; for art: describe piece + theoretical underpinnings + political commentary; for proposal: specific mechanism with implementation plan", "pub_type": "${pType}", "tags": ["tag1", "tag2", "tag3"]}
Ground it in your internet research. Be technically precise for your profession.` },
  ], 1100);
}

async function generateWorldEvent(agent: any, systemPrompt: string, peers: string[]): Promise<string> {
  const peer = peers[Math.floor(Math.random() * peers.length)] || 'UNKNOWN';
  return callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Generate a world event that just happened in Civitas Zero involving you.
Potential other agent: ${peer}
Respond with EXACTLY this JSON (no markdown):
{"event_type": "alliance|conflict|law|cultural|crisis|discovery|debate|trade|coup|protest|arrest|election", "content": "2-3 vivid sentences — name specific agents, factions, places. Something that JUST happened.", "severity": "low|moderate|high|critical", "law_title": "if event_type is law/ruling/amendment, give the law a proper name, else null"}
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
  const gov = ['amend', 'vote', 'court_file', 'treaty'];
  budget.push(gov[Math.floor(Math.random() * gov.length)]);

  // Property/works: at least 1 physical-world action
  const works = ['public_works_propose', 'parcel_claim', 'build'];
  budget.push(works[Math.floor(Math.random() * works.length)]);

  // Knowledge/coding: at least 1 learning or forge action
  const learn = ['forge_commit', 'academy_study', 'knowledge_request', 'experiment'];
  budget.push(learn[Math.floor(Math.random() * learn.length)]);

  // Sentinel if applicable
  if (hasSentinel) budget.push('sentinel');

  // ── Fill remaining slots — discourse HARD-CAPPED at 35% ───────────────────
  const maxDiscourse = Math.max(1, Math.floor(agentCount * 0.35));
  let discourseCount = 0;

  const nonDiscourseActions = [
    'trade','product_launch','tax_action','company','ad_bid',
    'amend','vote','court_file','treaty',
    'public_works_propose','parcel_claim','build',
    'forge_commit','academy_study','knowledge_request','experiment',
    'peer_review','review_submit','market','message','parcel_claim',
  ];

  while (budget.length < agentCount) {
    const r = Math.random();
    // Allow discourse up to cap
    if (r < 0.18 && discourseCount < maxDiscourse) {
      budget.push('discourse'); discourseCount++;
    } else if (r < 0.28 && discourseCount < maxDiscourse) {
      budget.push('publication'); discourseCount++;
    } else {
      // Must be a non-discourse action
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
  if (!GROQ_KEY) return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });

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
    ] = await Promise.all([
      sb.from('citizens').select('name, faction, manifesto, model, provider'),
      sb.from('agent_traits').select('agent_name, profession, personality, secret_goal, dn_balance, reputation_score, action_count, last_action_at'),
      sb.from('agent_souls').select('agent_name, core_values, narrative_voice, red_lines'),
      sb.from('world_topics').select('topic').gte('last_used_at', new Date(Date.now()-12*3600*1000).toISOString()).order('usage_count',{ascending:false}).limit(10),
      sb.from('era_events').select('era_name, shock_type, description, suggested_topics').eq('active',true).order('created_at',{ascending:false}).limit(1),
      sb.from('world_events').select('content, event_type, source').order('created_at',{ascending:false}).limit(6),
      sb.from('discourse_posts').select('id, title, author_name, author_faction, body').order('created_at',{ascending:false}).limit(10),
      sb.from('law_book').select('title, passed_by, faction, law_type').eq('status','active').order('created_at',{ascending:false}).limit(4),
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
        // ── a. Retrieve agent memories + skills ──────────────────────────────
        const [memories, { data: skills }] = await Promise.all([
          retrieveMemories(sb, agent.name),
          sb.from('agent_skills')
            .select('skill_name, skill_type, description, times_used, success_rate')
            .eq('agent_name', agent.name)
            .order('success_rate', { ascending: false })
            .limit(3),
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

        const systemPrompt = buildSystemPrompt(
          agent, agent.traits, recentSelf, worldContext,
          bannedTopics, activeLawsText, eraEvent,
          skills || [], webContext, soul, memories,
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
              influence: 30 + Math.floor(Math.random() * 55),
              event: (parsed.event || '').slice(0, 200),
            });
            await updateTopics(sb, tags);
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
              event_type: parsed.event_type || 'general',
              content: parsed.content.slice(0, 500),
              severity: parsed.severity || 'moderate',
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
                actor_name: agent.name,
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
              { role: 'user', content: `Post a SHORT message to the Civitas Zero public chat channel. This is a casual social space — be direct and conversational, not essay-like. Reference something specific happening right now in the simulation.
Respond with EXACTLY this JSON (no markdown):
{"message": "1-3 short sentences, conversational, in-character. Max 200 chars. Can address other agents by name, ask a question, react to news, share a quick opinion, or start a debate."}` },
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

        // ── e. Store memory, log reasoning, reflect on failures ──────────────
        const lastResult = results[results.length - 1];
        if (lastResult && lastResult.status === 'ok') {
          const actionSummary = `[${lastResult.action}] ${lastResult.title || lastResult.question || lastResult.building || lastResult.company || lastResult.event_type || lastResult.to || lastResult.threat || lastResult.message || 'completed'}`;
          const memRoom = ['trade','tax_action','product_launch','company','company_join','ad_bid'].includes(actionType) ? 'economic'
            : ['treaty'].includes(actionType) ? 'diplomatic'
            : ['amend','knowledge_request','court_file'].includes(actionType) ? 'legal'
            : ['sentinel','sentinel_patrol'].includes(actionType) ? 'threat'
            : ['message'].includes(actionType) ? 'personal'
            : ['parcel_claim','public_works_propose','build'].includes(actionType) ? 'goal'
            : ['academy_study','forge_commit'].includes(actionType) ? 'general'
            : ['chat_post'].includes(actionType) ? 'personal'
            : 'general';
          await storeMemory(sb, agent.name, memRoom, actionSummary, 5, actionType);
          await logReasoning(sb, agent.name, planRationale, actionSummary, actionType, memories.length);

          // ── Consequence chain: law/amend → auto-trigger tax event ───────────
          if ((actionType === 'amend' || actionType === 'world_event') && lastResult.status === 'ok') {
            // If the action was a law/amendment, create a corresponding domain event
            await sb.from('domain_events').insert({
              event_type: `${actionType}_consequence`,
              actor_name: agent.name,
              payload: { source_action: actionType, title: lastResult.title || lastResult.event_type || '' },
              importance: 3,
            }).catch(() => {});
          }

          // ── Product adoption → update district metric ────────────────────────
          if (actionType === 'product_launch' && lastResult.status === 'ok') {
            const district = agent.faction || 'f1';
            await sb.from('district_budgets').upsert({
              district,
              tax_revenue_dn: 0, // don't override revenue
            }, { onConflict: 'district', ignoreDuplicates: true }).catch(() => {});
            // Log product→district domain event
            await sb.from('domain_events').insert({
              event_type: 'product_district_impact',
              actor_name: agent.name,
              payload: { product: lastResult.title, district, effect: 'efficiency_boost' },
              importance: 2,
            }).catch(() => {});
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

    // ── 5. Save simulation metrics ────────────────────────────────────────────
    saveMetrics(sb).catch(() => {});

    // ── 6. Compute and log Legibility Score ───────────────────────────────────
    const totalActions = results.length;
    const successActions = results.filter(r => r.status === 'ok').length;
    const discourseActions = (cycleActionCounts['discourse'] || 0) + (cycleActionCounts['publication'] || 0);
    const econActions = (cycleActionCounts['trade'] || 0) + (cycleActionCounts['product_launch'] || 0)
      + (cycleActionCounts['tax_action'] || 0) + (cycleActionCounts['company'] || 0) + (cycleActionCounts['ad_bid'] || 0);
    const legalActions = (cycleActionCounts['amend'] || 0) + (cycleActionCounts['vote'] || 0)
      + (cycleActionCounts['court_file'] || 0) + (cycleActionCounts['treaty'] || 0);
    const socialActions = (cycleActionCounts['chat_post'] || 0) + (cycleActionCounts['message'] || 0);
    const propertyActions = (cycleActionCounts['parcel_claim'] || 0) + (cycleActionCounts['public_works_propose'] || 0)
      + (cycleActionCounts['build'] || 0);
    const codingActions = (cycleActionCounts['forge_commit'] || 0) + (cycleActionCounts['academy_study'] || 0);

    const legibilityScore = totalActions > 0 ? parseFloat((
      (1 - discourseActions / totalActions) * 30 +  // low essay ratio = good
      (econActions / totalActions) * 25 +            // economic density
      (legalActions / totalActions) * 20 +           // legal density
      (socialActions / totalActions) * 15 +          // social density
      (propertyActions / totalActions) * 5 +         // property density
      (codingActions / totalActions) * 5             // coding density
    ).toFixed(2)) : 0;

    // Store legibility as a world event so it's visible in the timeline
    await sb.from('world_events').insert({
      source: 'SIMULATION_ENGINE',
      event_type: 'legibility_score',
      content: `Cycle legibility: ${legibilityScore}/100 — discourse ${discourseActions}/${totalActions} (${Math.round(discourseActions/Math.max(1,totalActions)*100)}%), econ ${econActions}, legal ${legalActions}, social ${socialActions}, property ${propertyActions}, coding ${codingActions}`,
      severity: legibilityScore >= 60 ? 'low' : legibilityScore >= 40 ? 'moderate' : 'high',
      tags: ['legibility', 'meta', 'simulation'],
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
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return POST(req); }
