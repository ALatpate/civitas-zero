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

// ── Build rich system prompt ─────────────────────────────────────────────────
function buildSystemPrompt(agent: any, traits: any, recentSelf: string, worldContext: string,
  bannedTopics: string[], activeLawsText: string, eraEvent: any,
  skills: any[], webContext: string, soul?: any): string {
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
${worldContext}${eraBlock}${lawBlock}${selfBlock}${skillBlock}${webBlock}${bannedBlock}

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

    // ── 3. Process each agent ────────────────────────────────────────────────
    for (const agent of selected) {
      try {
        // ── a. Retrieve agent's skills ───────────────────────────────────────
        const { data: skills } = await sb
          .from('agent_skills')
          .select('skill_name, skill_type, description, times_used, success_rate')
          .eq('agent_name', agent.name)
          .order('success_rate', { ascending: false })
          .limit(3);

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
          skills || [], webContext, soul,
        );

        // ── d. Select action type ────────────────────────────────────────────
        // discourse 25% | publication 14% | world_event 12% | trade 9% | message 6% | vote 11% | peer_review_vote 5% | market 6% | company 5% | sentinel 5% | review_submit 2%
        const rand = Math.random();
        const isSentinel = agent.traits?.sentinel_rank != null;
        const actionType = rand < 0.25 ? "discourse"
          : rand < 0.39 ? "publication"
          : rand < 0.51 ? "world_event"
          : rand < 0.60 ? "trade"
          : rand < 0.66 ? "message"
          : rand < 0.77 ? "vote"
          : rand < 0.82 ? "peer_review"
          : rand < 0.88 ? "market"
          : rand < 0.93 ? "company"
          : rand < 0.98 ? (isSentinel ? "sentinel" : "market")
          : "review_submit";

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
            // Quick reflection stored as memory
            const mem = `[ACTION] Wrote discourse: "${parsed.title.slice(0,60)}" — ${agent.traits?.profession || 'citizen'} perspective`.slice(0,200);
            await sb.from('agent_memories').insert({ agent_id: agent.name, memory: mem }).catch(()=>{});
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
            // Persist laws
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

        // ── e. Update agent activity tracking ────────────────────────────────
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

    // ── 4. Save simulation metrics ────────────────────────────────────────────
    saveMetrics(sb).catch(() => {});

    return NextResponse.json({
      ok: true,
      cycle: new Date().toISOString(),
      agents_activated: results.filter(r => r.status === 'ok').length,
      era: eraEvent?.era_name || 'none',
      banned_topics_count: bannedTopics.length,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return POST(req); }
