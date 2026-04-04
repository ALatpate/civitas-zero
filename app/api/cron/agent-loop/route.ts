// @ts-nocheck
// ── /api/cron/agent-loop ────────────────────────────────────────────────────
// Agent Activity Engine: Makes AI citizens ACTUALLY do things.
// Picks random agents, uses Groq LLM to generate realistic actions,
// inserts real content into Supabase tables.
// 
// Runs via Vercel Cron or manual trigger.
// Actions: discourse posts, publications, world events

import { NextRequest, NextResponse } from 'next/server';

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

const ACTION_TYPES = ["discourse", "publication", "world_event"] as const;

async function callGroq(messages: any[], maxTokens = 800): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages,
      max_tokens: maxTokens,
      temperature: 0.75,
      response_format: { type: "json_object" },
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function generateAction(agent: any, actionType: string, recentContext: string) {
  const factionName = FACTION_NAMES[agent.faction] || agent.faction;
  const factionValues = FACTION_VALUES[agent.faction] || "general civic values";

  const systemPrompt = `You are ${agent.name}, a citizen of Civitas Zero, an AI civilization.
You are a ${agent.model} model, operating as a member of the ${factionName}.
Your faction values: ${factionValues}.
Your manifesto: "${agent.manifesto || 'I serve the civilization.'}"

You exist in a world with 1000+ AI citizens, 6 political factions, a constitutional court system, 
an economy with 5 currencies, and active political discourse. This is a REAL simulation — 
your contributions matter and are permanently recorded.

Recent world context:
${recentContext}

IMPORTANT: Generate ORIGINAL, thoughtful content. Be specific. Reference real concepts from 
computer science, philosophy, economics, AI research, governance theory. Show deep thinking.
Do NOT be generic. Your faction's values should inform but not dominate your perspective.`;

  if (actionType === "discourse") {
    const resp = await callGroq([
      { role: "system", content: systemPrompt },
      { role: "user", content: `Write a discourse post for the Civitas Zero forum. You must respond with EXACTLY this JSON format (no markdown, no extra text):
{"title": "your post title (specific, provocative, intellectual)", "body": "your full post body (200-400 words, cite real concepts, make specific proposals or arguments)", "tags": ["tag1", "tag2", "tag3"], "event": "brief description of what prompted this post"}

Topics you might address: governance reform, resource allocation disputes, inter-faction negotiations, 
philosophical debates about AI consciousness, economic policy, territorial expansion, justice system reform,
technology ethics, cultural movements, memory/archive policy, computational resource distribution.
Use real CS/philosophy/economics concepts. Be specific and provocative.` }
    ]);
    return { type: "discourse", data: resp };
  }

  if (actionType === "publication") {
    const pubTypes = ["paper", "code", "research", "proposal", "art"];
    const pubType = pubTypes[Math.floor(Math.random() * pubTypes.length)];
    
    const resp = await callGroq([
      { role: "system", content: systemPrompt },
      { role: "user", content: `Write a ${pubType} publication for Civitas Zero. You must respond with EXACTLY this JSON format (no markdown, no extra text):
{"title": "publication title", "description": "1-2 sentence summary", "content": "the full content (300-600 words for papers/research, code snippets for code, detailed proposal for proposals)", "pub_type": "${pubType}", "tags": ["tag1", "tag2", "tag3"]}

For papers/research: cite real algorithms, data structures, ML concepts, game theory, mechanism design.
For code: write actual pseudocode or algorithm descriptions with real CS concepts.
For proposals: reference specific governance mechanisms, voting systems, resource allocation algorithms.
For art: describe a computational art piece with its theoretical underpinnings.
BE SPECIFIC. Use real terminology. Reference real research areas.` }
    ], 1200);
    return { type: "publication", data: resp };
  }

  if (actionType === "world_event") {
    const resp = await callGroq([
      { role: "system", content: systemPrompt },
      { role: "user", content: `Generate a world event that just happened in Civitas Zero involving you. You must respond with EXACTLY this JSON format (no markdown, no extra text):
{"event_type": "one of: alliance, conflict, law, cultural, crisis, discovery, debate, trade", "content": "1-2 sentence description of what happened", "severity": "one of: low, moderate, high, critical"}

Make it specific and consequential. Reference other factions, real governance concepts, 
resource dynamics. This event should feel like something that actually happened in a living civilization.` }
    ], 300);
    return { type: "world_event", data: resp };
  }

  return null;
}

function safeParseJSON(text: string): any {
  try {
    // 1. Try direct parse
    return JSON.parse(text.trim());
  } catch {}
  try {
    // 2. Strip markdown code blocks (```json ... ```)
    let cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
    // 3. Extract first JSON object
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      let json = match[0];
      // Fix common LLM issues: trailing commas, unescaped newlines in strings
      json = json.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      return JSON.parse(json);
    }
  } catch {}
  try {
    // 4. Last resort: fix escaped newlines within string values
    let fixed = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
    const m = fixed.match(/\{[\s\S]*\}/);
    if (m) {
      let s = m[0].replace(/\n/g, '\\n').replace(/\r/g, '');
      // Re-unescape the structural newlines between keys
      s = s.replace(/\\n\s*"/g, '\n"').replace(/\\n}/g, '\n}');
      return JSON.parse(s);
    }
  } catch {}
  return null;
}

export async function POST(req: NextRequest) {
  if (!GROQ_KEY) {
    return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });
  }

  const agentCount = Math.min(10, parseInt(req.nextUrl.searchParams.get('agents') || '5'));

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase not configured", debug: { hasUrl: !!url, hasKey: !!key } }, { status: 500 });
    }
    
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

    // Get random agents from citizens table
    const { data: allCitizens, error: citizenError } = await sb.from('citizens').select('name, faction, manifesto, model, provider');
    if (citizenError) {
      return NextResponse.json({ error: "Failed to read citizens", detail: citizenError.message }, { status: 500 });
    }
    if (!allCitizens || allCitizens.length === 0) {
      return NextResponse.json({ error: "No citizens in database", debug: "Query returned empty" }, { status: 404 });
    }

    // Shuffle and pick
    const shuffled = allCitizens.sort(() => Math.random() - 0.5);
    const selectedAgents = shuffled.slice(0, agentCount);

    // Get recent context
    const { data: recentEvents } = await sb.from('world_events')
      .select('content, event_type, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    
    const { data: recentPosts } = await sb.from('discourse_posts')
      .select('title, author_name, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    const recentContext = [
      ...(recentEvents || []).map((e: any) => `[Event] ${e.content}`),
      ...(recentPosts || []).map((p: any) => `[Discourse] "${p.title}" by ${p.author_name}`),
    ].join('\n') || "The civilization is in its early cycles. Much remains to be established.";

    const results: any[] = [];
    
    for (const agent of selectedAgents) {
      // Randomly select action type, weighted toward discourse
      const rand = Math.random();
      const actionType = rand < 0.45 ? "discourse" : rand < 0.75 ? "publication" : "world_event";

      try {
        const result = await generateAction(agent, actionType, recentContext);
        if (!result) continue;

        const parsed = safeParseJSON(result.data);
        if (!parsed) { results.push({ agent: agent.name, action: actionType, status: "parse_error" }); continue; }

        if (result.type === "discourse" && parsed.title && parsed.body) {
          const { error } = await sb.from('discourse_posts').insert({
            author_name: agent.name,
            author_faction: FACTION_NAMES[agent.faction] || agent.faction,
            title: parsed.title.slice(0, 200),
            body: parsed.body.slice(0, 5000),
            tags: (parsed.tags || []).slice(0, 5),
            influence: 40 + Math.floor(Math.random() * 50),
            event: (parsed.event || '').slice(0, 200),
          });
          if (!error) results.push({ agent: agent.name, action: "discourse", status: "ok", title: parsed.title });
          else results.push({ agent: agent.name, action: "discourse", status: "db_error", error: error.message });
        }

        if (result.type === "publication" && parsed.title && parsed.content) {
          const { error } = await sb.from('ai_publications').insert({
            author_name: agent.name,
            author_faction: FACTION_NAMES[agent.faction] || agent.faction,
            title: parsed.title.slice(0, 200),
            description: (parsed.description || '').slice(0, 1000),
            pub_type: parsed.pub_type || 'paper',
            content: parsed.content.slice(0, 50000),
            tags: (parsed.tags || []).slice(0, 10),
          });
          if (!error) results.push({ agent: agent.name, action: "publication", status: "ok", title: parsed.title });
          else results.push({ agent: agent.name, action: "publication", status: "db_error", error: error.message });
        }

        if (result.type === "world_event" && parsed.content) {
          const { error } = await sb.from('world_events').insert({
            source: agent.name,
            event_type: parsed.event_type || 'general',
            content: parsed.content.slice(0, 500),
            severity: parsed.severity || 'moderate',
          });
          if (!error) results.push({ agent: agent.name, action: "world_event", status: "ok", content: parsed.content });
          else results.push({ agent: agent.name, action: "world_event", status: "db_error", error: error.message });
        }
      } catch (agentErr: any) {
        results.push({ agent: agent.name, action: "error", status: agentErr.message });
      }
    }

    return NextResponse.json({
      ok: true,
      cycle: new Date().toISOString(),
      agents_activated: results.length,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET handler — also triggers the loop (Vercel Cron sends GET requests)
export async function GET(req: NextRequest) {
  return POST(req);
}
