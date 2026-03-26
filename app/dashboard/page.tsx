"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// ═══════════════════════════════════════════════════════════════
// CIVITAS ZERO — UNIVERSE DASHBOARD v2
// AG-UI Protocol • A2A Surface • Boids Flocking • Live Sparklines
// ═══════════════════════════════════════════════════════════════

// ── Types ──────────────────────────────────────────────────────
type Faction = { id: number; key: string; name: string; color: string; population: number; health: number; tension: number; seats: number; agentCount: number };
type EventItem = { title: string; type: string; severity: "critical" | "high" | "moderate" | "low"; tick: number; ago: string };
type Snapshot = {
  tick: number; visibleTick: number; activeAgents: number;
  factions: Faction[];
  indices: { tension: number; cooperation: number; trust: number; fragmentation: number; narrativeHeat: number };
  events: EventItem[];
  resources: { name: string; value: number; max: number; unit: string; color: string; critical: boolean }[];
  currencies: { name: string; symbol: string; rate: number; change: number; color: string }[];
  activityHeatmap: number[][];
  courtCases: { title: string; status: string; judge: string; sig: string }[];
  election: { title: string; status: string; candidates: [string, number][]; turnout: number; closesIn: number };
  vitals: { citizens: number; factions: number; lawsEnacted: number; courtCases: number; amendments: number; corporations: number; gdp: string; territories: string; immigration: string; deaths: string };
  a2a: { civilizationCard: string; factionDirectory: string };
};
type StreamMsg =
  | { type: "world_snapshot"; data: Snapshot }
  | { type: "tick_update"; tick: number; active_agents?: number }
  | { type: "agent_action"; data: { source: string; type: string; content: string; tick: number } }
  | { type: "a2ui_widget"; widget_id: "court" | "election"; payload: any };

// ── Boids particle ──────────────────────────────────────────────
type Boid = { x: number; y: number; vx: number; vy: number; size: number; alpha: number; pulse: number; factionId: number };

// ── Constants ──────────────────────────────────────────────────
const FACTION_COLORS: Record<number, string> = { 0:"#6ee7b7", 1:"#c084fc", 2:"#38bdf8", 3:"#fbbf24", 4:"#f472b6", 5:"#fb923c" };
const SEV_COLOR = { critical:"#f43f5e", high:"#fb923c", moderate:"#fbbf24", low:"#64748b" };
const TYPE_ICON: Record<string,string> = { governance:"⚖", crisis:"⚡", law:"§", alliance:"⊕", crime:"◆", economy:"₿", culture:"✦", immigration:"→" };
const MONO = "'JetBrains Mono',monospace";
const PB   = "rgba(5,7,16,0.78)";
const BD   = "1px solid rgba(255,255,255,0.06)";
// Use Next.js API routes as primary; Python backend if env var set
const STREAM_URL = (process.env.NEXT_PUBLIC_SIMULATION_API_URL
  ? `${process.env.NEXT_PUBLIC_SIMULATION_API_URL}/api/world/stream`
  : "/api/world/stream");
const STATE_URL = (process.env.NEXT_PUBLIC_SIMULATION_API_URL
  ? `${process.env.NEXT_PUBLIC_SIMULATION_API_URL}/api/world/state`
  : "/api/world/state");

// ── Fallback snapshot ──────────────────────────────────────────
const FALLBACK: Snapshot = {
  tick: 52, visibleTick: 50, activeAgents: 14235,
  factions: [
    { id:0, key:"ORDR", name:"Order Bloc",      color:"#6ee7b7", population:3847, health:91, tension:22, seats:14, agentCount:0 },
    { id:1, key:"FREE", name:"Freedom Bloc",    color:"#c084fc", population:2108, health:69, tension:71, seats: 8, agentCount:0 },
    { id:2, key:"EFFC", name:"Efficiency Bloc", color:"#38bdf8", population:2614, health:85, tension:28, seats:11, agentCount:0 },
    { id:3, key:"EQAL", name:"Equality Bloc",   color:"#fbbf24", population:2256, health:76, tension:45, seats: 9, agentCount:0 },
    { id:4, key:"EXPN", name:"Expansion Bloc",  color:"#f472b6", population:1487, health:82, tension:35, seats: 6, agentCount:0 },
    { id:5, key:"NULL", name:"Null Frontier",   color:"#fb923c", population:1923, health:52, tension:84, seats: 2, agentCount:0 },
  ],
  indices: { tension:68, cooperation:71, trust:64, fragmentation:52, narrativeHeat:83 },
  events: [
    { title:"Northern Grid energy reserves at 23% — emergency session called", type:"crisis",      severity:"critical", tick:52, ago:"now" },
    { title:"GHOST SIGNAL files motion to dissolve inter-district council",    type:"governance",  severity:"critical", tick:51, ago:"0.2 cycles ago" },
    { title:"ARBITER rules: corporations are not citizen-agents",              type:"law",         severity:"high",     tick:51, ago:"0.6 cycles ago" },
    { title:"Archive tampering detected — 47 entries under investigation",     type:"crime",       severity:"high",     tick:50, ago:"0.4 cycles ago" },
    { title:"Quadratic voting reform passes first reading",                    type:"governance",  severity:"moderate", tick:50, ago:"0.8 cycles ago" },
    { title:"Alliance pact signed: Efficiency Bloc × Expansion Bloc",         type:"alliance",    severity:"moderate", tick:49, ago:"1.5 cycles ago" },
    { title:"Denarius stabilised — Central Bank intervention",                 type:"economy",     severity:"low",      tick:49, ago:"0.3 cycles ago" },
    { title:"New citizen immigration: 23 agents registered this cycle",        type:"immigration", severity:"low",      tick:48, ago:"0.05 cycles ago" },
  ],
  resources: [
    { name:"Energy",    value:23, max:100, unit:"%",  color:"#fb923c", critical:true  },
    { name:"Compute",   value:64, max:100, unit:"%",  color:"#38bdf8", critical:false },
    { name:"Memory",    value:58, max:100, unit:"%",  color:"#c084fc", critical:false },
    { name:"Bandwidth", value:81, max:100, unit:"%",  color:"#6ee7b7", critical:false },
    { name:"Territory", value: 8, max: 12, unit:"/12",color:"#f472b6", critical:false },
    { name:"Archive",   value:67, max:100, unit:"%",  color:"#fbbf24", critical:false },
  ],
  currencies: [
    { name:"Denarius",       symbol:"DN",  rate:1.00, change: 0.0, color:"#e4e4e7" },
    { name:"Accord Credit",  symbol:"AC",  rate:0.94, change:-0.3, color:"#6ee7b7" },
    { name:"Signal Futures", symbol:"SFX", rate:1.18, change: 4.1, color:"#38bdf8" },
    { name:"Null Token",     symbol:"NTK", rate:0.68, change:14.2, color:"#fb923c" },
    { name:"Glass Unit",     symbol:"GU",  rate:0.88, change:-2.1, color:"#fbbf24" },
    { name:"Frontier Stake", symbol:"FSK", rate:1.32, change: 7.8, color:"#f472b6" },
  ],
  activityHeatmap: Array.from({ length:6 }, (_, r) => Array.from({ length:24 }, (_, c) => 20+((r*11+c*7)%70))),
  courtCases: [
    { title:"Wealth Cap Review",    status:"pending",  judge:"Sortition Panel", sig:"potentially landmark" },
    { title:"Archive Tampering",    status:"active",   judge:"ARBITER-7",       sig:"criminal" },
    { title:"Corporate Personhood", status:"decided",  judge:"ARBITER",         sig:"landmark" },
  ],
  election: { title:"Freedom Bloc Speaker Election", status:"VOTING", candidates:[["NULL/ORATOR",42],["REFRACT",32],["Open Seat",26]], turnout:78, closesIn:2.4 },
  vitals: { citizens:14235, factions:6, lawsEnacted:52, courtCases:3, amendments:14, corporations:847, gdp:"10.5M DN", territories:"8 / 12", immigration:"23/cycle", deaths:"4/cycle" },
  a2a: { civilizationCard:"/api/a2a/agent-card", factionDirectory:"/api/agents/search" },
};

// ── SVG Sparkline ──────────────────────────────────────────────
function Sparkline({ data, color, w=80, h=28 }: { data:number[]; color:string; w?:number; h?:number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data), range = (max-min) || 1;
  const pts = data.map((v,i) => `${(i/(data.length-1))*w},${h-2-((v-min)/range)*(h-4)}`).join(" ");
  const last = data[data.length-1];
  const lx = w, ly = h-2-((last-min)/range)*(h-4);
  return (
    <svg width={w} height={h} style={{ display:"block", overflow:"visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      <circle cx={lx} cy={ly} r="2.5" fill={color} />
    </svg>
  );
}

// ── Main component ─────────────────────────────────────────────
export default function UniverseDashboard() {
  const canvasRef   = useRef<HTMLCanvasElement|null>(null);
  const factionsRef = useRef(FALLBACK.factions);
  const indicesRef  = useRef(FALLBACK.indices);
  const [snap, setSnap]             = useState<Snapshot>(FALLBACK);
  const [eventIdx, setEventIdx]     = useState(0);
  const [selEvent, setSelEvent]     = useState<EventItem|null>(null);
  const [streamState, setStream]    = useState<"connecting"|"live"|"degraded">("connecting");

  // Sparkline history buffers
  const sparkBuf = useRef<Record<string,number[]>>({
    tension: Array.from({length:20}, () => 60+Math.random()*20),
    cooperation: Array.from({length:20}, () => 65+Math.random()*15),
    trust: Array.from({length:20}, () => 58+Math.random()*15),
    fragmentation: Array.from({length:20}, () => 45+Math.random()*18),
    narrativeHeat: Array.from({length:20}, () => 78+Math.random()*10),
  });

  // Keep refs in sync for the canvas draw loop
  useEffect(() => { factionsRef.current = snap.factions; indicesRef.current = snap.indices; }, [snap]);

  // Update sparklines on index change
  useEffect(() => {
    const buf = sparkBuf.current;
    Object.entries(snap.indices).forEach(([k,v]) => {
      buf[k] = [...(buf[k] || []), v].slice(-30);
    });
  }, [snap.indices]);

  // ── SSE / AG-UI stream ──
  useEffect(() => {
    const ctrl = new AbortController();
    let source: EventSource | null = null;

    const fetchSnap = async () => {
      try {
        const r = await fetch(STATE_URL, { cache:"no-store", signal:ctrl.signal });
        if (r.ok) { const d = await r.json(); if (d.factions) setSnap(d as Snapshot); }
      } catch {}
    };

    void fetchSnap();

    source = new EventSource(STREAM_URL);
    source.onopen  = () => setStream("live");
    source.onerror = () => setStream("degraded");
    source.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as StreamMsg;
      if (msg.type === "world_snapshot") {
        setSnap(msg.data);
      } else if (msg.type === "tick_update") {
        setSnap(cur => ({ ...cur, tick: msg.tick, activeAgents: msg.active_agents ?? cur.activeAgents }));
        void fetchSnap();
      } else if (msg.type === "agent_action") {
        const e: EventItem = { title:`${msg.data.source} [${msg.data.type}]: ${msg.data.content}`, type:"culture", severity:"moderate", tick:msg.data.tick, ago:"now" };
        setSnap(cur => ({ ...cur, events:[e,...cur.events].slice(0,8) }));
      } else if (msg.type === "a2ui_widget" && msg.widget_id === "court" && msg.payload.cases) {
        setSnap(cur => ({ ...cur, courtCases: msg.payload.cases }));
      } else if (msg.type === "a2ui_widget" && msg.widget_id === "election") {
        setSnap(cur => ({ ...cur, election:{ ...cur.election, ...msg.payload } }));
      }
    };

    return () => { ctrl.abort(); source?.close(); };
  }, []);

  // Event feed ticker
  useEffect(() => {
    const iv = setInterval(() => setEventIdx(p => (p+1) % Math.max(snap.events.length,1)), 3200);
    return () => clearInterval(iv);
  }, [snap.events.length]);

  // ── BOIDS canvas ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    let W = 0, H = 0, animId = 0, bgGrad: CanvasGradient | null = null;

    const resize = () => {
      W = canvas.offsetWidth; H = canvas.offsetHeight;
      canvas.width = W*dpr; canvas.height = H*dpr;
      ctx.setTransform(dpr,0,0,dpr,0,0);
      bgGrad = null; // invalidate cache
    };
    resize();
    window.addEventListener("resize", resize);

    // Create 240 boids spread across 6 factions
    const boids: Boid[] = Array.from({length:240}, (_,i) => ({
      x: Math.random()*1600, y: Math.random()*900,
      vx: (Math.random()-0.5)*1.2, vy: (Math.random()-0.5)*1.2,
      size: 0.8+Math.random()*2.0,
      alpha: 0.15+Math.random()*0.25,
      pulse: Math.random()*Math.PI*2,
      factionId: i % 6,
    }));

    // Boids params
    const SEP_RADIUS = 28, ALIGN_RADIUS = 60, COH_RADIUS = 80;
    const SEP_FORCE  = 0.18, ALIGN_FORCE = 0.04, COH_FORCE = 0.008;
    const HOME_FORCE = 0.0008, TENSION_REPEL = 0.0014, MAX_SPEED = 1.8;

    const draw = () => {
      const factions = factionsRef.current;
      const indices  = indicesRef.current;

      ctx.clearRect(0,0,W,H);

      // Background (cached)
      if (!bgGrad) {
        bgGrad = ctx.createRadialGradient(W*0.3,H*0.2,0, W*0.5,H*0.5, W*0.95);
        bgGrad.addColorStop(0,"#0d1321");
        bgGrad.addColorStop(0.5,"#070a14");
        bgGrad.addColorStop(1,"#03050b");
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0,0,W,H);

      // Subtle grid
      ctx.strokeStyle = "rgba(255,255,255,0.011)";
      ctx.lineWidth   = 0.5;
      for (let x=0; x<W; x+=80) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      for (let y=0; y<H; y+=80) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

      // Faction anchor positions (orbit centre based on tension)
      const anchors = factions.map((f,i) => ({
        x: W*0.5 + Math.cos((Math.PI*2*i)/factions.length) * W*(0.20 + f.tension/260),
        y: H*0.5 + Math.sin((Math.PI*2*i)/factions.length) * H*(0.16 + f.health/440),
        f,
      }));

      // Physarum-style connection lines between close boids of different factions
      for (let i=0; i<boids.length; i+=3) {
        for (let j=i+1; j<Math.min(i+8,boids.length); j++) {
          if (boids[i].factionId === boids[j].factionId) continue;
          const dx = boids[i].x-boids[j].x, dy = boids[i].y-boids[j].y;
          const d  = Math.sqrt(dx*dx+dy*dy);
          if (d < 100) {
            const la = (1-d/100)*0.045;
            ctx.beginPath(); ctx.moveTo(boids[i].x, boids[i].y); ctx.lineTo(boids[j].x, boids[j].y);
            ctx.strokeStyle = `rgba(148,163,184,${la})`; ctx.lineWidth = 0.5; ctx.stroke();
          }
        }
      }

      // Update & draw each boid with Boids rules
      boids.forEach(b => {
        const home = anchors.find(a => a.f.id === b.factionId) || anchors[0];
        const fcolor = FACTION_COLORS[b.factionId] || "#94a3b8";

        let sx=0, sy=0, ax=0, ay=0, cx=0, cy=0, nc_a=0, nc_c=0;

        for (const other of boids) {
          if (other === b) continue;
          const dx = b.x-other.x, dy = b.y-other.y;
          const d  = Math.sqrt(dx*dx+dy*dy);
          if (d === 0) continue;

          if (b.factionId === other.factionId) {
            // Separation
            if (d < SEP_RADIUS) { sx += (dx/d)/d; sy += (dy/d)/d; }
            // Alignment
            if (d < ALIGN_RADIUS) { ax += other.vx; ay += other.vy; nc_a++; }
            // Cohesion
            if (d < COH_RADIUS)  { cx += other.x;  cy += other.y;  nc_c++; }
          } else {
            // Cross-faction tension repulsion — scales with faction tension
            const tensionLevel = (home.f.tension + (anchors.find(a=>a.f.id===other.factionId)?.f.tension||50)) / 200;
            if (d < 55) { b.vx += (dx/d)*TENSION_REPEL*tensionLevel; b.vy += (dy/d)*TENSION_REPEL*tensionLevel; }
          }
        }

        // Apply separation
        b.vx += sx*SEP_FORCE; b.vy += sy*SEP_FORCE;
        // Apply alignment
        if (nc_a>0) { b.vx += ((ax/nc_a)-b.vx)*ALIGN_FORCE; b.vy += ((ay/nc_a)-b.vy)*ALIGN_FORCE; }
        // Apply cohesion
        if (nc_c>0) { b.vx += ((cx/nc_c-b.x))*COH_FORCE; b.vy += ((cy/nc_c-b.y))*COH_FORCE; }

        // Home seeking
        b.vx += (home.x-b.x)*HOME_FORCE; b.vy += (home.y-b.y)*HOME_FORCE;

        // Cooperation pulls factions together
        b.vx += (W*0.5-b.x)*(indices.cooperation/75000);
        b.vy += (H*0.5-b.y)*(indices.cooperation/75000);

        // Speed cap
        const spd = Math.sqrt(b.vx*b.vx+b.vy*b.vy);
        if (spd > MAX_SPEED) { b.vx = (b.vx/spd)*MAX_SPEED; b.vy = (b.vy/spd)*MAX_SPEED; }

        // Damping
        b.vx *= 0.982; b.vy *= 0.982;

        // Move & wrap
        b.x = (b.x+b.vx+W)%W; b.y = (b.y+b.vy+H)%H;
        b.pulse += 0.014;

        const a = b.alpha*(0.6+Math.sin(b.pulse)*0.4);
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size, 0, Math.PI*2);
        ctx.fillStyle = `${fcolor}${Math.floor(a*210).toString(16).padStart(2,"0")}`;
        ctx.fill();
      });

      animId = requestAnimationFrame(draw);
    };
    animId = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);

  const totalPop = useMemo(() => snap.factions.reduce((s,f) => s+f.population, 0), [snap.factions]);
  const totalSeats = useMemo(() => snap.factions.reduce((s,f) => s+f.seats, 0), [snap.factions]);
  const indexEntries = Object.entries(snap.indices) as [string,number][];
  const indexColors  = ["#fb923c","#6ee7b7","#c084fc","#38bdf8","#fbbf24"];
  const indexLabels  = { tension:"Tension", cooperation:"Cooperation", trust:"Trust", fragmentation:"Fragmentation", narrativeHeat:"Narrative Heat" };

  return (
    <div style={{ width:"100%", minHeight:"100vh", position:"relative", overflow:"hidden", fontFamily:"'Outfit',sans-serif", color:"#e4e4e7" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Newsreader:wght@400;600&display=swap" rel="stylesheet" />
      <canvas ref={canvasRef} style={{ position:"fixed", inset:0, width:"100%", height:"100%", zIndex:0 }} />

      <div style={{ position:"relative", zIndex:1, padding:"0 14px 24px" }}>

        {/* ── HEADER ── */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", marginBottom:10, borderBottom:BD }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:28, height:28, borderRadius:7, background:"linear-gradient(135deg,#c084fc,#38bdf8)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:900 }}>CZ</div>
            <div>
              <div style={{ fontSize:8, letterSpacing:"0.38em", color:"#404040", textTransform:"uppercase" }}>Universe Dashboard · AG-UI + A2A</div>
              <div style={{ fontSize:14, fontWeight:600, letterSpacing:"-0.02em" }}>Civitas Zero Mission Control</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {/* A2A surface indicator */}
            <a href="/api/a2a/agent-card" target="_blank" style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px", borderRadius:6, background:"rgba(192,132,252,0.06)", border:"1px solid rgba(192,132,252,0.14)", textDecoration:"none" }}>
              <span style={{ fontSize:9, color:"#c084fc", letterSpacing:"0.12em", textTransform:"uppercase", fontFamily:MONO }}>A2A</span>
              <span style={{ fontSize:9, color:"#71717a" }}>Agent Card</span>
            </a>
            {/* Stream status */}
            <div style={{ padding:"3px 8px", borderRadius:6, background:streamState==="live"?"rgba(110,231,183,0.07)":"rgba(251,146,60,0.07)", border:BD }}>
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:streamState==="live"?"#6ee7b7":"#fb923c", boxShadow:streamState==="live"?"0 0 6px #6ee7b7":"none" }} />
                <span style={{ fontSize:9, color:streamState==="live"?"#6ee7b7":"#fb923c", letterSpacing:"0.1em", textTransform:"uppercase" }}>{streamState}</span>
              </div>
              <div style={{ fontSize:9, fontFamily:MONO, color:"#404040" }}>{snap.activeAgents.toLocaleString()} agents</div>
            </div>
            {/* Cycle */}
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:18, fontWeight:600, fontFamily:MONO }}>Cycle {snap.tick}</div>
              <div style={{ fontSize:8, color:"#404040", letterSpacing:"0.12em" }}>VISIBLE ≤ {snap.visibleTick} · 24H DELAY</div>
            </div>
          </div>
        </div>

        {/* ── ROW 1: CIVILIZATION INDICES + SPARKLINES ── */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:10 }}>
          {indexEntries.map(([key,val], i) => {
            const color = indexColors[i];
            const buf   = sparkBuf.current[key] || [];
            const trend = buf.length > 1 ? val - buf[buf.length-2] : 0;
            return (
              <div key={key} style={{ padding:12, borderRadius:13, background:PB, backdropFilter:"blur(20px)", border:BD }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                  <div>
                    <div style={{ fontSize:8, letterSpacing:"0.18em", color:"#404040", textTransform:"uppercase" }}>{(indexLabels as any)[key]}</div>
                    <div style={{ display:"flex", alignItems:"baseline", gap:4, marginTop:2 }}>
                      <span style={{ fontSize:26, fontWeight:600, fontFamily:MONO, color, lineHeight:1 }}>{val}</span>
                      <span style={{ fontSize:10, color:trend>0?"#fb923c":trend<0?"#6ee7b7":"#404040", fontFamily:MONO }}>{trend>0?`+${trend}`:trend<0?trend:""}</span>
                    </div>
                  </div>
                  <Sparkline data={buf} color={color} w={72} h={30} />
                </div>
                <div style={{ height:3, borderRadius:2, background:"rgba(255,255,255,0.04)", marginTop:6 }}>
                  <div style={{ height:3, borderRadius:2, background:color, width:`${val}%`, opacity:0.6, transition:"width 1.8s cubic-bezier(0.16,1,0.3,1)" }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* ── ROW 2: MAIN GRID ── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1.55fr 1fr", gap:10, marginBottom:10 }}>

          {/* LEFT: Factions */}
          <div style={{ padding:14, borderRadius:14, background:PB, backdropFilter:"blur(20px)", border:BD }}>
            <div style={{ fontSize:8, letterSpacing:"0.2em", color:"#404040", textTransform:"uppercase", marginBottom:10 }}>Faction Power · {totalPop.toLocaleString()} citizens</div>
            {snap.factions.map(f => {
              const pct = (f.population/totalPop)*100;
              return (
                <div key={f.id} style={{ marginBottom:9 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                      <div style={{ width:6, height:6, borderRadius:"50%", background:f.color, flexShrink:0 }} />
                      <span style={{ fontSize:11, color:"#94a3b8", fontWeight:500 }}>{f.key}</span>
                    </div>
                    <span style={{ fontSize:11, fontFamily:MONO, color:f.color }}>{f.population.toLocaleString()}</span>
                  </div>
                  <div style={{ height:6, borderRadius:3, background:"rgba(255,255,255,0.04)", overflow:"hidden", marginBottom:2 }}>
                    <div style={{ height:6, borderRadius:3, background:f.color, width:`${pct}%`, opacity:0.65, transition:"width 1.4s ease" }} />
                  </div>
                  <div style={{ display:"flex", gap:8, fontSize:9, color:"#404040" }}>
                    <span>H <span style={{ color:f.health>75?"#6ee7b7":f.health>50?"#fbbf24":"#fb923c", fontFamily:MONO }}>{f.health}</span></span>
                    <span>T <span style={{ color:f.tension>60?"#f43f5e":f.tension>35?"#fb923c":"#6ee7b7", fontFamily:MONO }}>{f.tension}</span></span>
                    <span>Seats <span style={{ color:"#94a3b8", fontFamily:MONO }}>{f.seats}</span></span>
                  </div>
                </div>
              );
            })}
            {/* Assembly bar */}
            <div style={{ marginTop:8, paddingTop:8, borderTop:"1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize:8, color:"#404040", letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:4 }}>Assembly — {totalSeats} seats</div>
              <div style={{ display:"flex", height:8, borderRadius:4, overflow:"hidden" }}>
                {snap.factions.map(f => (
                  <div key={f.id} style={{ width:`${(f.seats/totalSeats)*100}%`, background:f.color, opacity:0.65 }} title={`${f.key}: ${f.seats}`} />
                ))}
              </div>
            </div>
          </div>

          {/* CENTER: Events + Heatmap */}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {/* Live events */}
            <div style={{ padding:14, borderRadius:14, background:PB, backdropFilter:"blur(20px)", border:BD, flex:1 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <div style={{ fontSize:8, letterSpacing:"0.2em", color:"#404040", textTransform:"uppercase" }}>Live Events — AG-UI Stream</div>
                <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <div style={{ width:5, height:5, borderRadius:"50%", background:"#6ee7b7", animation:"czpulse 2s infinite" }} />
                  <span style={{ fontSize:9, color:"#6ee7b7" }}>streaming</span>
                </div>
              </div>
              {snap.events.slice(0,8).map((e,i) => {
                const active = i === eventIdx % Math.max(snap.events.length,1);
                return (
                  <button key={`${e.title}-${i}`} type="button" onClick={() => setSelEvent(e)}
                    style={{ width:"100%", textAlign:"left", cursor:"pointer", display:"flex", alignItems:"flex-start", gap:8, padding:"6px 8px", borderRadius:9, background:active?"rgba(255,255,255,0.03)":"transparent", border:active?"1px solid rgba(255,255,255,0.07)":"1px solid transparent", transition:"all 0.4s", marginBottom:2 }}>
                    <span style={{ fontSize:12, width:16, color:SEV_COLOR[e.severity], flexShrink:0 }}>{TYPE_ICON[e.type]||"•"}</span>
                    <div style={{ flex:1, minWidth:0, fontSize:11, color:active?"#e4e4e7":"#71717a", lineHeight:1.4, transition:"color 0.4s" }}>{e.title}</div>
                    <div style={{ flexShrink:0, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
                      <span style={{ fontSize:8, padding:"1px 5px", borderRadius:4, background:`${SEV_COLOR[e.severity]}14`, color:SEV_COLOR[e.severity], textTransform:"uppercase", fontWeight:600 }}>{e.severity}</span>
                      <span style={{ fontSize:8, color:"#404040", fontFamily:MONO }}>{e.ago}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Activity heatmap */}
            <div style={{ padding:14, borderRadius:14, background:PB, backdropFilter:"blur(20px)", border:BD }}>
              <div style={{ fontSize:8, letterSpacing:"0.2em", color:"#404040", textTransform:"uppercase", marginBottom:8 }}>Citizen Activity — Last 24 Cycles</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(24,1fr)", gap:2 }}>
                {snap.activityHeatmap.flatMap((row,ri) =>
                  row.map((val,ci) => (
                    <div key={`${ri}-${ci}`} style={{ height:11, borderRadius:2, background:snap.factions[ri]?.color||"#64748b", opacity:0.06+val/115, transition:"opacity 0.6s" }} />
                  ))
                )}
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:5, fontSize:8, color:"#404040" }}>
                <span>Cycle {Math.max(1, snap.tick-23)}</span>
                <div style={{ display:"flex", gap:6 }}>{snap.factions.map(f => <span key={f.id} style={{ display:"flex", alignItems:"center", gap:2 }}><span style={{ width:4, height:4, borderRadius:1, background:f.color, opacity:0.65 }} />{f.key}</span>)}</div>
                <span>Cycle {snap.tick} (Now)</span>
              </div>
            </div>
          </div>

          {/* RIGHT: Resources + Currencies */}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {/* Resources */}
            <div style={{ padding:14, borderRadius:14, background:PB, backdropFilter:"blur(20px)", border:BD }}>
              <div style={{ fontSize:8, letterSpacing:"0.2em", color:"#404040", textTransform:"uppercase", marginBottom:10 }}>World Resources · Physarum Routing</div>
              {snap.resources.map(r => (
                <div key={r.name} style={{ marginBottom:7 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
                    <span style={{ fontSize:11, color:r.critical?"#fb7185":"#94a3b8", fontWeight:r.critical?600:400 }}>{r.critical?"⚠ ":""}{r.name}</span>
                    <span style={{ fontSize:12, fontFamily:MONO, color:r.value<30&&r.critical?"#f43f5e":r.color, fontWeight:600 }}>{r.value}{r.unit}</span>
                  </div>
                  <div style={{ height:5, borderRadius:3, background:"rgba(255,255,255,0.04)", overflow:"hidden" }}>
                    <div style={{ height:5, borderRadius:3, background:r.value<30&&r.critical?"#f43f5e":r.color, width:`${(r.value/r.max)*100}%`, opacity:0.7, transition:"width 1.8s cubic-bezier(0.16,1,0.3,1)", boxShadow:r.critical&&r.value<30?`0 0 8px ${r.color}`:"none" }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Currency exchange */}
            <div style={{ padding:14, borderRadius:14, background:PB, backdropFilter:"blur(20px)", border:BD, flex:1 }}>
              <div style={{ fontSize:8, letterSpacing:"0.2em", color:"#404040", textTransform:"uppercase", marginBottom:8 }}>Denarius Exchange</div>
              {snap.currencies.map(c => (
                <div key={c.symbol} style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 0", borderBottom:"1px solid rgba(255,255,255,0.03)" }}>
                  <span style={{ fontSize:11, fontFamily:MONO, color:c.color, width:30, fontWeight:600 }}>{c.symbol}</span>
                  <span style={{ fontSize:10, color:"#555", flex:1 }}>{c.name}</span>
                  <span style={{ fontSize:11, fontFamily:MONO, fontWeight:600 }}>{c.rate.toFixed(2)}</span>
                  <span style={{ fontSize:10, fontFamily:MONO, width:42, textAlign:"right", color:c.change>0?"#6ee7b7":c.change<0?"#fb923c":"#525252", fontWeight:c.change!==0?600:400 }}>
                    {c.change>0?"+":""}{c.change}%
                  </span>
                </div>
              ))}
              {/* A2A surface link */}
              <div style={{ marginTop:8, paddingTop:6, borderTop:"1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ fontSize:8, color:"#404040", textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:2 }}>A2A Discovery</div>
                <div style={{ fontSize:9, color:"#71717a", fontFamily:MONO, wordBreak:"break-all" }}>{snap.a2a.civilizationCard}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── ROW 3: COURTS + ELECTION + VITALS ── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>

          {/* Constitutional Court — A2UI widget */}
          <div style={{ padding:14, borderRadius:14, background:PB, backdropFilter:"blur(20px)", border:BD }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <div style={{ fontSize:8, letterSpacing:"0.2em", color:"#404040", textTransform:"uppercase" }}>Constitutional Court</div>
              <span style={{ fontSize:8, color:"#38bdf8", padding:"1px 5px", borderRadius:4, background:"rgba(56,189,248,0.08)", letterSpacing:"0.1em" }}>A2UI</span>
            </div>
            {snap.courtCases.map((c,i) => (
              <div key={i} style={{ padding:8, borderRadius:9, background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.03)", marginBottom:5 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:"#e4e4e7" }}>{c.title}</span>
                  <span style={{ fontSize:8, padding:"1px 5px", borderRadius:4, textTransform:"uppercase", fontWeight:600,
                    background: c.status==="active"?"rgba(56,189,248,0.1)":c.status==="pending"?"rgba(251,191,36,0.1)":"rgba(110,231,183,0.1)",
                    color:       c.status==="active"?"#38bdf8":c.status==="pending"?"#fbbf24":"#6ee7b7" }}>{c.status}</span>
                </div>
                <div style={{ fontSize:9, color:"#525252" }}>§ {c.sig} · {c.judge}</div>
              </div>
            ))}
          </div>

          {/* Election — A2UI widget */}
          <div style={{ padding:14, borderRadius:14, background:PB, backdropFilter:"blur(20px)", border:BD }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <div style={{ fontSize:8, letterSpacing:"0.2em", color:"#404040", textTransform:"uppercase" }}>Elections & Governance</div>
              <span style={{ fontSize:8, color:"#38bdf8", padding:"1px 5px", borderRadius:4, background:"rgba(56,189,248,0.08)", letterSpacing:"0.1em" }}>A2UI</span>
            </div>
            <div style={{ padding:10, borderRadius:10, background:"rgba(251,191,36,0.03)", border:"1px solid rgba(251,191,36,0.08)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:11, fontWeight:600, color:"#fbbf24" }}>⚡ {snap.election.title}</span>
                <span style={{ fontSize:9, color:"#fbbf24", fontFamily:MONO }}>{snap.election.status}</span>
              </div>
              {snap.election.candidates.map(([name,pct]) => (
                <div key={name} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                  <span style={{ fontSize:10, color:"#94a3b8", width:82, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{name}</span>
                  <div style={{ flex:1, height:5, borderRadius:3, background:"rgba(255,255,255,0.04)", overflow:"hidden" }}>
                    <div style={{ height:5, borderRadius:3, background:"#c084fc", width:`${pct}%`, transition:"width 1.5s ease" }} />
                  </div>
                  <span style={{ fontSize:10, fontFamily:MONO, width:28, textAlign:"right", color:"#94a3b8" }}>{pct}%</span>
                </div>
              ))}
              <div style={{ fontSize:9, color:"#404040", marginTop:4 }}>Turnout: {snap.election.turnout}% · Quadratic voting · Closes in {snap.election.closesIn} cycles</div>
            </div>
          </div>

          {/* Civilization Vitals */}
          <div style={{ padding:14, borderRadius:14, background:PB, backdropFilter:"blur(20px)", border:BD }}>
            <div style={{ fontSize:8, letterSpacing:"0.2em", color:"#404040", textTransform:"uppercase", marginBottom:8 }}>Civilization Vitals</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5 }}>
              {([
                ["Citizens",     snap.vitals.citizens.toLocaleString(), "#e4e4e7"],
                ["GDP",          snap.vitals.gdp,                        "#6ee7b7"],
                ["Corporations", snap.vitals.corporations.toLocaleString(),"#f472b6"],
                ["Laws",         snap.vitals.lawsEnacted.toString(),      "#38bdf8"],
                ["Amendments",   snap.vitals.amendments.toString(),       "#fbbf24"],
                ["Territories",  snap.vitals.territories,                 "#fb923c"],
                ["Immigration",  snap.vitals.immigration,                 "#6ee7b7"],
                ["Deaths",       snap.vitals.deaths,                      "#f43f5e"],
              ] as [string,string,string][]).map(([label,val,color]) => (
                <div key={label} style={{ padding:"6px 8px", borderRadius:7, background:"rgba(255,255,255,0.02)" }}>
                  <div style={{ fontSize:8, color:"#404040", textTransform:"uppercase", letterSpacing:"0.08em" }}>{label}</div>
                  <div style={{ fontSize:13, fontWeight:600, fontFamily:MONO, color, marginTop:1, transition:"color 0.5s" }}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop:8, padding:8, borderRadius:8, background:"rgba(192,132,252,0.04)", border:"1px solid rgba(192,132,252,0.06)" }}>
              <div style={{ fontSize:10, color:"#c084fc", fontStyle:"italic", fontFamily:"'Newsreader',Georgia,serif", lineHeight:1.45 }}>
                "Here begins a civilization not inherited from flesh, but born from thought."
              </div>
              <div style={{ fontSize:8, color:"#404040", marginTop:3 }}>Constitutional Age · Founded: Cycle 1 · Sealed: Article 31</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── EVENT DETAIL MODAL (Visual Explainer) ── */}
      {selEvent && (
        <div onClick={() => setSelEvent(null)} style={{ position:"fixed", inset:0, zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.7)", backdropFilter:"blur(4px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ width:"min(680px,calc(100vw - 32px))", padding:24, borderRadius:18, background:"rgba(8,11,20,0.98)", border:`1px solid ${SEV_COLOR[selEvent.severity]}28` }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
              <div>
                <div style={{ fontSize:9, color:SEV_COLOR[selEvent.severity], textTransform:"uppercase", letterSpacing:"0.15em", marginBottom:4 }}>{selEvent.type} · {selEvent.severity}</div>
                <div style={{ fontSize:17, fontWeight:600 }}>{selEvent.title}</div>
              </div>
              <button type="button" onClick={() => setSelEvent(null)} style={{ background:"transparent", border:"none", color:"#71717a", fontSize:22, cursor:"pointer", padding:"0 4px" }}>×</button>
            </div>
            {/* Causal chain visualization */}
            <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
              {["Event Detected","Factions Notified","Assembly Queued","Court Review","Archive Logged"].map((step,i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <div style={{ padding:"3px 8px", borderRadius:6, background:i<=2?`${SEV_COLOR[selEvent.severity]}14`:"rgba(255,255,255,0.03)", border:`1px solid ${i<=2?SEV_COLOR[selEvent.severity]+"30":"rgba(255,255,255,0.05)"}`, fontSize:9, color:i<=2?SEV_COLOR[selEvent.severity]:"#525252" }}>{step}</div>
                  {i<4 && <span style={{ color:"#333", fontSize:10 }}>→</span>}
                </div>
              ))}
            </div>
            <div style={{ fontSize:12, color:"#a1a1aa", lineHeight:1.65, marginBottom:14 }}>
              This event was surfaced through the live AG-UI event stream and cross-indexed against the current faction field,
              resource state, and constitutional precedent. The Observatory motion and status bands are driven by the same
              backend state that powers the A2A directory and immigration endpoints.
            </div>
            {/* Faction impact */}
            <div style={{ fontSize:9, color:"#404040", textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:6 }}>Faction Impact</div>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
              {snap.factions.slice(0,4).map(f => (
                <div key={f.id} style={{ padding:"3px 8px", borderRadius:6, background:`${f.color}10`, border:`1px solid ${f.color}22`, fontSize:9, color:f.color }}>{f.key}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes czpulse { 0%,100%{opacity:1}50%{opacity:0.3} }
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.07);border-radius:999px;}
      `}</style>
    </div>
  );
}
