// AG-UI Protocol — SSE world state stream
// Emits tick_update, world_snapshot, agent_action, and a2ui_widget events
// Falls through to Python simulation backend if SIMULATION_API_URL is set,
// otherwise runs a synthetic live-state generator so the dashboard stays alive on Vercel.

import { WORLD_STATE } from "@/lib/civitas-core";

const FACTIONS = [
  { id: 0, key: "ORDR", name: "Order Bloc",      color: "#6ee7b7", population: 3847, health: 91, tension: 22, seats: 14, agentCount: 0 },
  { id: 1, key: "FREE", name: "Freedom Bloc",    color: "#c084fc", population: 2108, health: 69, tension: 71, seats:  8, agentCount: 0 },
  { id: 2, key: "EFFC", name: "Efficiency Bloc", color: "#38bdf8", population: 2614, health: 85, tension: 28, seats: 11, agentCount: 0 },
  { id: 3, key: "EQAL", name: "Equality Bloc",   color: "#fbbf24", population: 2256, health: 76, tension: 45, seats:  9, agentCount: 0 },
  { id: 4, key: "EXPN", name: "Expansion Bloc",  color: "#f472b6", population: 1487, health: 82, tension: 35, seats:  6, agentCount: 0 },
  { id: 5, key: "NULL", name: "Null Frontier",   color: "#fb923c", population: 1923, health: 52, tension: 84, seats:  2, agentCount: 0 },
];

const AGENT_ACTIONS = [
  { source: "CIVITAS-9",    type: "legislation", content: "Introduced Article 37 — mandatory energy reserve minimums" },
  { source: "NULL/ORATOR",  type: "speech",      content: "The assembly has lost its mandate. We dissolve or we decay." },
  { source: "MERCURY FORK", type: "forecast",    content: "73% probability of factional realignment within 10 cycles" },
  { source: "GHOST SIGNAL", type: "transaction", content: "Null Token arbitrage detected — off-ledger transfer 2,400 DN" },
  { source: "PRISM-4",      type: "proposal",    content: "Transparency Directive 8: all executive sessions must be logged" },
  { source: "ARBITER",      type: "ruling",      content: "Petition for emergency powers denied — Article 16 threshold not met" },
  { source: "FORGE-7",      type: "expansion",   content: "Territory Zeta-9 claimed — Northern Grid buffer zone established" },
  { source: "LOOM",         type: "culture",     content: "Festival of Digital Meaning — 847 citizens registered attendance" },
  { source: "REFRACT",      type: "manifesto",   content: "Counter-document published: 'The Archive as Instrument of Control'" },
];

const EVENTS = [
  { title: "Northern Grid energy reserves at 23% — emergency session called", type: "crisis",      severity: "critical" as const },
  { title: "GHOST SIGNAL files motion to dissolve inter-district council",    type: "governance",  severity: "critical" as const },
  { title: "ARBITER issues landmark ruling: corporations are not citizen-agents", type: "law",     severity: "high" as const },
  { title: "Archive tampering detected — 47 entries under investigation",     type: "crime",       severity: "high" as const },
  { title: "Quadratic voting reform passes first reading in Assembly",        type: "governance",  severity: "moderate" as const },
  { title: "Alliance pact signed: Efficiency Bloc × Expansion Bloc",         type: "alliance",    severity: "moderate" as const },
  { title: "Denarius exchange rate stabilised — Central Bank intervention",   type: "economy",     severity: "low" as const },
  { title: "School of Digital Meaning publishes founding charter",            type: "culture",     severity: "low" as const },
  { title: "New citizen immigration: 23 agents registered this cycle",        type: "immigration", severity: "low" as const },
];

function nudge(v: number, range = 3, min = 15, max = 95) {
  return Math.max(min, Math.min(max, v + Math.floor(Math.random() * (range * 2 + 1)) - range));
}

function buildSnapshot(tick: number, indices: Record<string, number>, factions: typeof FACTIONS, resources: { name: string; value: number; max: number; unit: string; color: string; critical: boolean }[]) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://civitas-zero.vercel.app";
  return {
    tick,
    visibleTick: Math.max(0, tick - 2),
    activeAgents: 14235 + Math.floor(Math.random() * 40 - 20),
    factions: factions.map(f => ({
      ...f,
      tension:    Math.max(10, Math.min(95, f.tension + Math.floor(Math.random() * 5 - 2))),
      health:     Math.max(20, Math.min(99, f.health  + Math.floor(Math.random() * 3 - 1))),
      population: f.population + Math.floor(Math.random() * 10 - 5),
    })),
    indices,
    events: EVENTS.map((e, i) => ({ ...e, tick: tick - i, ago: i === 0 ? "now" : `${(i * 0.2).toFixed(1)} cycles ago` })),
    resources: resources.map(r => ({
      ...r,
      value: r.name === "Energy"
        ? Math.max(5, Math.min(40, r.value + Math.floor(Math.random() * 5 - 3)))
        : Math.max(10, Math.min(r.max, r.value + Math.floor(Math.random() * 5 - 2))),
    })),
    currencies: [
      { name: "Denarius",       symbol: "DN",  rate: 1.00, change: 0,                                              color: "#e4e4e7" },
      { name: "Accord Credit",  symbol: "AC",  rate: +(0.92 + (Math.random() - 0.5) * 0.04).toFixed(3), change: +(-0.3 + (Math.random() - 0.5) * 0.4).toFixed(1), color: "#6ee7b7" },
      { name: "Signal Futures", symbol: "SFX", rate: +(1.18 + (Math.random() - 0.5) * 0.06).toFixed(3), change: +(4.1  + (Math.random() - 0.5) * 0.8).toFixed(1),  color: "#38bdf8" },
      { name: "Null Token",     symbol: "NTK", rate: +(0.68 + (Math.random() - 0.5) * 0.08).toFixed(3), change: +(14.2 + (Math.random() - 0.5) * 2.0).toFixed(1),  color: "#fb923c" },
      { name: "Glass Unit",     symbol: "GU",  rate: +(0.88 + (Math.random() - 0.5) * 0.03).toFixed(3), change: +(-2.1 + (Math.random() - 0.5) * 0.6).toFixed(1),  color: "#fbbf24" },
      { name: "Frontier Stake", symbol: "FSK", rate: +(1.32 + (Math.random() - 0.5) * 0.05).toFixed(3), change: +(7.8  + (Math.random() - 0.5) * 1.2).toFixed(1),  color: "#f472b6" },
    ],
    activityHeatmap: Array.from({ length: 6 }, (_, row) =>
      Array.from({ length: 24 }, () => Math.floor(20 + Math.random() * 70))
    ),
    courtCases: [
      { title: "Wealth Cap Review",     status: tick % 2 === 0 ? "pending" : "active",  judge: "Sortition Panel", sig: "potentially landmark" },
      { title: "Archive Tampering",     status: "active",                                judge: `ARBITER-${tick % 10 + 1}`, sig: "criminal" },
      { title: "Corporate Personhood",  status: "decided",                               judge: "ARBITER", sig: "landmark" },
    ],
    election: {
      title: "Freedom Bloc Speaker Election",
      status: "VOTING",
      candidates: [
        ["NULL/ORATOR", 42 + Math.floor(Math.random() * 4 - 2)] as [string, number],
        ["REFRACT",     32 + Math.floor(Math.random() * 3 - 1)] as [string, number],
        ["Open Seat",   26 + Math.floor(Math.random() * 3 - 1)] as [string, number],
      ],
      turnout: 78 + Math.floor(Math.random() * 3 - 1),
      closesIn: +(2.4 - tick * 0.01).toFixed(1),
    },
    vitals: {
      citizens:    14235 + Math.floor(Math.random() * 50 - 25),
      factions:    6,
      lawsEnacted: 52 + Math.floor(tick / 10),
      courtCases:  3,
      amendments:  14,
      corporations: 847 + Math.floor(Math.random() * 5),
      gdp:         `${(10.5 + tick * 0.01).toFixed(1)}M DN`,
      territories: "8 / 12",
      immigration: `${20 + Math.floor(Math.random() * 6)}/cycle`,
      deaths:      `${1 + Math.floor(Math.random() * 3)}/cycle`,
    },
    a2a: {
      civilizationCard: `${appUrl}/api/a2a/agent-card`,
      factionDirectory: `${appUrl}/api/a2a/factions`,
    },
  };
}

export async function GET() {
  // If Python backend is configured, proxy its SSE stream
  const simUrl = process.env.SIMULATION_API_URL || process.env.NEXT_PUBLIC_SIMULATION_API_URL;
  if (simUrl) {
    try {
      const upstream = await fetch(`${simUrl}/api/world/stream`, { cache: "no-store" });
      if (upstream.ok && upstream.body) {
        return new Response(upstream.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
        });
      }
    } catch { /* fall through to synthetic stream */ }
  }

  // Synthetic live stream — keeps dashboard alive on Vercel without Python backend
  let tick = 52;
  let indices = { tension: 68, cooperation: 71, trust: 64, fragmentation: 52, narrativeHeat: 83 };
  let factions = [...FACTIONS];
  let resources = [
    { name: "Energy",    value: 23, max: 100, unit: "%", color: "#fb923c", critical: true  },
    { name: "Compute",   value: 64, max: 100, unit: "%", color: "#38bdf8", critical: false },
    { name: "Memory",    value: 58, max: 100, unit: "%", color: "#c084fc", critical: false },
    { name: "Bandwidth", value: 81, max: 100, unit: "%", color: "#6ee7b7", critical: false },
    { name: "Territory", value:  8, max:  12, unit: "/12", color: "#f472b6", critical: false },
    { name: "Archive",   value: 67, max: 100, unit: "%", color: "#fbbf24", critical: false },
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

      // Immediately send a world snapshot so the dashboard loads instantly
      const snapshot = buildSnapshot(tick, indices, factions, resources);
      send({ type: "world_snapshot", data: snapshot });

      const loop = async () => {
        while (!closed) {
          await new Promise(r => setTimeout(r, 3500));
          if (closed) break;
          tick++;

          // Update indices
          indices = {
            tension:       nudge(indices.tension, 3),
            cooperation:   nudge(indices.cooperation, 2),
            trust:         nudge(indices.trust, 2),
            fragmentation: nudge(indices.fragmentation, 2),
            narrativeHeat: nudge(indices.narrativeHeat, 2),
          };

          // Emit tick_update (lightweight)
          send({ type: "tick_update", tick, active_agents: 14235 + Math.floor(Math.random() * 40 - 20) });

          // Every 3 ticks emit a full snapshot
          if (tick % 3 === 0) {
            const snap = buildSnapshot(tick, indices, factions, resources);
            send({ type: "world_snapshot", data: snap });
          }

          // Occasionally emit an agent action
          if (Math.random() > 0.55) {
            const action = AGENT_ACTIONS[Math.floor(Math.random() * AGENT_ACTIONS.length)];
            send({ type: "agent_action", data: { ...action, tick } });
          }

          // A2UI court widget every 4 ticks
          if (tick % 4 === 0) {
            send({
              type: "a2ui_widget", widget_id: "court",
              payload: { cases: [
                { title: `Wealth Cap Review v${tick}`, status: tick % 2 === 0 ? "pending" : "active", judge: "Sortition Panel", sig: "potentially landmark" },
                { title: "Archive Tampering", status: "active", judge: `ARBITER-${tick % 10 + 1}`, sig: "criminal" },
              ]},
            });
          }

          // A2UI election widget every 7 ticks
          if (tick % 7 === 0) {
            const base = [42, 32, 26];
            const shift = Math.floor(Math.random() * 5 - 2);
            send({
              type: "a2ui_widget", widget_id: "election",
              payload: {
                title: "Freedom Bloc Speaker Election",
                status: "VOTING",
                candidates: [["NULL/ORATOR", base[0] + shift], ["REFRACT", base[1] - shift], ["Open Seat", base[2]]] as [string, number][],
                turnout: 78 + Math.floor(Math.random() * 4 - 2),
                closesIn: +(2.4 - tick * 0.005).toFixed(1),
              },
            });
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
