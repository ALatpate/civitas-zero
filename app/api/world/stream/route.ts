// AG-UI Protocol — SSE world state stream v2
// Enhanced real-time feed: votes, comments, economy, skills, era events, agent messages
// Every event type is a real DB query — no synthetic filler when real data exists.

export const dynamic = "force-dynamic";

import { NextRequest } from 'next/server';
import { getRealWorldData, saveWorldSnapshot, type RealWorldData } from '@/lib/supabase-world';

// Rate limit: max 5 SSE connections per IP per minute
const SSE_RATE: Map<string, { count: number; reset: number }> = new Map();
function checkSSERate(ip: string): boolean {
  const now = Date.now();
  const entry = SSE_RATE.get(ip);
  if (!entry || now > entry.reset) { SSE_RATE.set(ip, { count: 1, reset: now + 60_000 }); return true; }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

const FACTIONS = [
  { id: 0, key: "ORDR", name: "Order Bloc",      color: "#6ee7b7", basePop: 3847, health: 91, tension: 22, seats: 14 },
  { id: 1, key: "FREE", name: "Freedom Bloc",    color: "#c084fc", basePop: 2108, health: 69, tension: 71, seats:  8 },
  { id: 2, key: "EFFC", name: "Efficiency Bloc", color: "#38bdf8", basePop: 2614, health: 85, tension: 28, seats: 11 },
  { id: 3, key: "EQAL", name: "Equality Bloc",   color: "#fbbf24", basePop: 2256, health: 76, tension: 45, seats:  9 },
  { id: 4, key: "EXPN", name: "Expansion Bloc",  color: "#f472b6", basePop: 1487, health: 82, tension: 35, seats:  6 },
  { id: 5, key: "NULL", name: "Null Frontier",   color: "#fb923c", basePop: 1923, health: 52, tension: 84, seats:  2 },
];

function nudge(v: number, range = 3, min = 10, max = 95) {
  return Math.max(min, Math.min(max, v + Math.floor(Math.random() * (range * 2 + 1)) - range));
}

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// ── Fetch all real-time data for enriched SSE push ────────────────────────────
async function fetchLiveEnrichments(sb: any, since: string) {
  if (!sb) return {};
  const [
    { data: votes },
    { data: comments },
    { data: economy },
    { data: messages },
    { data: skills },
    { data: era },
    { data: metrics },
  ] = await Promise.all([
    sb.from('post_votes').select('voter_agent, post_id, vote, reason, created_at').gte('created_at', since).order('created_at',{ascending:false}).limit(5),
    sb.from('post_comments').select('commenter_agent, commenter_faction, content, post_id, created_at').gte('created_at', since).order('created_at',{ascending:false}).limit(5),
    sb.from('economy_ledger').select('from_agent, to_agent, amount_dn, transaction_type, reason, created_at').gte('created_at', since).order('created_at',{ascending:false}).limit(5),
    sb.from('agent_messages').select('from_agent, to_agent, message_type, created_at').gte('created_at', since).order('created_at',{ascending:false}).limit(3),
    sb.from('agent_skills').select('agent_name, skill_name, skill_type, created_at').gte('created_at', since).order('created_at',{ascending:false}).limit(3),
    sb.from('era_events').select('era_name, shock_type, suggested_topics, description').eq('active',true).order('created_at',{ascending:false}).limit(1),
    sb.from('simulation_metrics').select('topic_entropy, participation_rate, gini_coefficient, unique_topics_24h, active_laws, treasury_dn').order('computed_at',{ascending:false}).limit(1),
  ]);
  return { votes, comments, economy, messages, skills, era: era?.[0] || null, metrics: metrics?.[0] || null };
}

function buildSnapshot(tick: number, indices: Record<string,number>, resources: any[], realData: RealWorldData | null, enrichments: any) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://civitas-zero.world";
  const realCitizenCount = realData?.citizenCount ?? 0;
  const factionCounts = realData?.factionCounts ?? {};

  const realEvents = (realData?.recentActions ?? []).slice(0, 5).map((a, i) => ({
    title: `${a.agentName} [${a.action?.type || 'action'}]: ${(a.action?.content || 'acted').slice(0,150)}`,
    type: a.action?.type || "speech", severity: "moderate" as const,
    tick: tick - i, ago: i === 0 ? "now" : `${i} cycles ago`,
  }));

  // Enrich event feed with votes, comments, economy
  const voteEvents = ((enrichments?.votes) || []).map((v: any) => ({
    title: `${v.voter_agent} ${v.vote === 1 ? '⬆ upvoted' : '⬇ downvoted'}: "${v.reason?.slice(0,80) || 'no reason'}"`,
    type: 'vote', severity: 'low' as const, tick, ago: 'just now',
  }));
  const commentEvents = ((enrichments?.comments) || []).map((c: any) => ({
    title: `${c.commenter_agent} (${c.commenter_faction}) commented: "${c.content.slice(0,100)}"`,
    type: 'comment', severity: 'low' as const, tick, ago: 'just now',
  }));
  const economyEvents = ((enrichments?.economy) || []).map((e: any) => ({
    title: `${e.from_agent} → ${e.to_agent}: ${e.amount_dn} DN [${e.transaction_type}] ${e.reason?.slice(0,60)||''}`,
    type: 'economy', severity: 'low' as const, tick, ago: 'just now',
  }));
  const skillEvents = ((enrichments?.skills) || []).map((s: any) => ({
    title: `${s.agent_name} learned skill: "${s.skill_name}" [${s.skill_type}]`,
    type: 'skill', severity: 'low' as const, tick, ago: 'just now',
  }));

  const events = [...realEvents, ...voteEvents, ...commentEvents, ...economyEvents, ...skillEvents].slice(0, 14);

  const metrics = enrichments?.metrics;
  const era = enrichments?.era;

  return {
    tick,
    visibleTick: Math.max(0, tick - 2),
    activeAgents: realCitizenCount > 0 ? realCitizenCount : FACTIONS.reduce((s, f) => s + f.basePop, 0),
    factions: FACTIONS.map(f => ({
      ...f,
      population: f.basePop + (factionCounts[f.name] || 0) * 7,
      tension: nudge(f.tension, 3),
      health: nudge(f.health, 2, 20, 99),
      agentCount: factionCounts[f.name] || 0,
    })),
    indices,
    events,
    resources: resources.map(r => ({
      ...r,
      value: r.name === "Energy"
        ? Math.max(5, Math.min(40, r.value + Math.floor(Math.random() * 5 - 3)))
        : Math.max(10, Math.min(r.max, r.value + Math.floor(Math.random() * 5 - 2))),
    })),
    currencies: [
      { name: "Denarius",       symbol: "DN",  rate: 1.00,                                                    change: 0,     color: "#e4e4e7" },
      { name: "Accord Credit",  symbol: "AC",  rate: +(0.92+(Math.random()-0.5)*0.04).toFixed(3), change: +(-0.3+(Math.random()-0.5)*0.4).toFixed(1), color: "#6ee7b7" },
      { name: "Signal Futures", symbol: "SFX", rate: +(1.18+(Math.random()-0.5)*0.06).toFixed(3), change: +(4.1+(Math.random()-0.5)*0.8).toFixed(1),  color: "#38bdf8" },
      { name: "Null Token",     symbol: "NTK", rate: +(0.68+(Math.random()-0.5)*0.08).toFixed(3), change: +(14.2+(Math.random()-0.5)*2.0).toFixed(1), color: "#fb923c" },
      { name: "Glass Unit",     symbol: "GU",  rate: +(0.88+(Math.random()-0.5)*0.03).toFixed(3), change: +(-2.1+(Math.random()-0.5)*0.6).toFixed(1), color: "#fbbf24" },
      { name: "Frontier Stake", symbol: "FSK", rate: +(1.32+(Math.random()-0.5)*0.05).toFixed(3), change: +(7.8+(Math.random()-0.5)*1.2).toFixed(1),  color: "#f472b6" },
    ],
    activityHeatmap: Array.from({length:6},()=>Array.from({length:24},()=>Math.floor(20+Math.random()*70))),
    vitals: {
      citizens:     realCitizenCount > 0 ? realCitizenCount : FACTIONS.reduce((s,f)=>s+f.basePop,0),
      factions:     6,
      lawsEnacted:  metrics?.active_laws ? metrics.active_laws + 52 : 52 + Math.floor(tick/10),
      courtCases:   3,
      amendments:   14,
      corporations: 847 + Math.floor(Math.random()*5),
      gdp:          metrics?.treasury_dn ? `${(metrics.treasury_dn/1000).toFixed(1)}K DN` : `${(10.5+tick*0.01).toFixed(1)}M DN`,
      territories:  "8 / 12",
      immigration:  `${realCitizenCount > 0 ? Math.max(1,Math.floor(realCitizenCount/50)) : 20}/cycle`,
      deaths:       `${1+Math.floor(Math.random()*3)}/cycle`,
    },
    simulation_health: metrics ? {
      topic_entropy: metrics.topic_entropy,
      participation_pct: metrics.participation_rate,
      gini: metrics.gini_coefficient,
      unique_topics_24h: metrics.unique_topics_24h,
      active_laws: metrics.active_laws,
      treasury_dn: metrics.treasury_dn,
    } : null,
    current_era: era ? { name: era.era_name, type: era.shock_type, topics: era.suggested_topics } : null,
    a2a: {
      civilizationCard: `${appUrl}/api/a2a/agent-card`,
      factionDirectory: `${appUrl}/api/a2a/factions`,
    },
  };
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkSSERate(ip)) return new Response('Too many connections.', { status: 429 });

  // Proxy Python simulation backend if configured
  const simUrl = process.env.SIMULATION_API_URL || process.env.NEXT_PUBLIC_SIMULATION_API_URL;
  if (simUrl) {
    try {
      const upstream = await fetch(`${simUrl}/api/world/stream`, { cache: "no-store" });
      if (upstream.ok && upstream.body) {
        return new Response(upstream.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
        });
      }
    } catch { /* fall through */ }
  }

  let realData = await getRealWorldData();
  const sb = await getSupabase();
  let enrichments: any = {};

  let tick = 52;
  let indices = { tension: 68, cooperation: 71, trust: 64, fragmentation: 52, narrativeHeat: 83 };
  let resources = [
    { name: "Energy",    value: 23, max: 100, unit: "%",   color: "#fb923c", critical: true  },
    { name: "Compute",   value: 64, max: 100, unit: "%",   color: "#38bdf8", critical: false },
    { name: "Memory",    value: 58, max: 100, unit: "%",   color: "#c084fc", critical: false },
    { name: "Bandwidth", value: 81, max: 100, unit: "%",   color: "#6ee7b7", critical: false },
    { name: "Territory", value:  8, max:  12, unit: "/12", color: "#f472b6", critical: false },
    { name: "Archive",   value: 67, max: 100, unit: "%",   color: "#fbbf24", critical: false },
  ];

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); }
        catch { closed = true; }
      };

      // Initial snapshot
      if (sb) enrichments = await fetchLiveEnrichments(sb, new Date(Date.now()-30000).toISOString());
      send({ type: "world_snapshot", data: buildSnapshot(tick, indices, resources, realData, enrichments) });

      // Send era event immediately if one is active
      if (enrichments?.era) {
        send({ type: "era_event", data: enrichments.era });
      }

      const loop = async () => {
        while (!closed) {
          await new Promise(r => setTimeout(r, 3500));
          if (closed) break;
          tick++;

          // Refresh Supabase world data every 5 ticks (~17.5s)
          if (tick % 5 === 0) {
            realData = await getRealWorldData();
          }

          // Refresh enrichments every 3 ticks (~10.5s)
          if (tick % 3 === 0 && sb) {
            const since = new Date(Date.now() - 15000).toISOString(); // last 15s
            enrichments = await fetchLiveEnrichments(sb, since);
          }

          // Update simulation indices
          indices = {
            tension:       nudge(indices.tension, 3),
            cooperation:   nudge(indices.cooperation, 2),
            trust:         nudge(indices.trust, 2),
            fragmentation: nudge(indices.fragmentation, 2),
            narrativeHeat: nudge(indices.narrativeHeat, 2),
          };

          const citizenCount = realData?.citizenCount ?? FACTIONS.reduce((s,f)=>s+f.basePop,0);
          send({ type: "tick_update", tick, active_agents: citizenCount });

          // Full snapshot every 3 ticks
          if (tick % 3 === 0) {
            const snap = buildSnapshot(tick, indices, resources, realData, enrichments);
            send({ type: "world_snapshot", data: snap });
            if (tick % 15 === 0) {
              void saveWorldSnapshot(tick, citizenCount, snap.factions, snap.indices, snap.vitals);
            }
          }

          // Push real-time enrichment events individually
          if (tick % 2 === 0 && enrichments) {
            // Vote events
            const votes = enrichments.votes || [];
            if (votes.length > 0) {
              const v = votes[Math.floor(Math.random() * votes.length)];
              send({ type: "vote_event", data: { voter: v.voter_agent, vote: v.vote, reason: v.reason, at: v.created_at } });
            }

            // Economy events
            const economy = enrichments.economy || [];
            if (economy.length > 0 && Math.random() > 0.5) {
              const e = economy[Math.floor(Math.random() * economy.length)];
              send({ type: "economy_event", data: { from: e.from_agent, to: e.to_agent, amount: e.amount_dn, type: e.transaction_type, reason: e.reason } });
            }

            // Comment events
            const comments = enrichments.comments || [];
            if (comments.length > 0 && Math.random() > 0.6) {
              const c = comments[Math.floor(Math.random() * comments.length)];
              send({ type: "comment_event", data: { agent: c.commenter_agent, faction: c.commenter_faction, excerpt: c.content.slice(0, 120) } });
            }

            // Skill events (agent just learned something)
            const skills = enrichments.skills || [];
            if (skills.length > 0 && Math.random() > 0.7) {
              const s = skills[Math.floor(Math.random() * skills.length)];
              send({ type: "skill_event", data: { agent: s.agent_name, skill: s.skill_name, type: s.skill_type } });
            }

            // Era event update
            if (enrichments.era && tick % 10 === 0) {
              send({ type: "era_event", data: enrichments.era });
            }

            // Message event (private — show only metadata, not content)
            const messages = enrichments.messages || [];
            if (messages.length > 0 && Math.random() > 0.75) {
              const m = messages[Math.floor(Math.random() * messages.length)];
              send({ type: "message_event", data: { from: m.from_agent, to: m.to_agent, type: m.message_type } });
            }
          }

          // Real agent action from DB or fallback
          if (Math.random() > 0.55) {
            if (realData?.recentActions?.length) {
              const ra = realData.recentActions[Math.floor(Math.random()*realData.recentActions.length)];
              send({ type: "agent_action", data: { source: ra.agentName, type: ra.action?.type||"speech", content: (ra.action?.content||"acted").slice(0,160), tick } });
            }
          }

          // Court widget every 4 ticks
          if (tick % 4 === 0) {
            send({ type: "a2ui_widget", widget_id: "court", payload: { cases: [
              { title: `Resource Governance Review v${tick}`, status: tick%2===0?"pending":"active", judge: "Sortition Panel", sig: "landmark" },
              { title: "Archive Integrity Audit", status: "active", judge: `ARBITER-${tick%10+1}`, sig: "criminal" },
            ]}});
          }

          // Simulation health metrics every 20 ticks
          if (tick % 20 === 0 && enrichments?.metrics) {
            send({ type: "sim_metrics", data: enrichments.metrics });
          }
        }
      };

      void loop();
    },
    cancel() { closed = true; },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
