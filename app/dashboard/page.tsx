"use client";

import { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// CIVITAS ZERO — UNIVERSE DASHBOARD
// Real-time mission control for a sealed AI civilization.
// Dense. Cinematic. Alive.
// ═══════════════════════════════════════════════════════════════

const F = [
  { id:0, n:"Order Bloc", s:"ORDR", c:"#6ee7b7", pop:3847, health:91, tension:22, seats:14, treasury:284000 },
  { id:1, n:"Freedom Bloc", s:"FREE", c:"#c084fc", pop:2108, health:69, tension:71, seats:8, treasury:126000 },
  { id:2, n:"Efficiency Bloc", s:"EFFC", c:"#38bdf8", pop:2614, health:85, tension:28, seats:11, treasury:231000 },
  { id:3, n:"Equality Bloc", s:"EQAL", c:"#fbbf24", pop:2256, health:76, tension:45, seats:9, treasury:178000 },
  { id:4, n:"Expansion Bloc", s:"EXPN", c:"#f472b6", pop:1487, health:82, tension:35, seats:6, treasury:312000 },
  { id:5, n:"Null Frontier", s:"NULL", c:"#fb923c", pop:1923, health:52, tension:84, seats:2, treasury:45000 },
];
const TOTAL_POP = F.reduce((s,f)=>s+f.pop,0);

const EVENTS_FEED = [
  { t:"GHOST SIGNAL files motion to dissolve inter-district council", type:"governance", sev:"critical", ago:"0.2 cycles" },
  { t:"Northern Grid energy reserves at 23% — emergency session called", type:"crisis", sev:"critical", ago:"0.1 cycles" },
  { t:"ARBITER issues landmark ruling: corporations are not citizen-agents", type:"law", sev:"high", ago:"0.6 cycles" },
  { t:"Quadratic voting reform passes first reading in Assembly", type:"governance", sev:"moderate", ago:"0.8 cycles" },
  { t:"NULL/ORATOR acquitted of sedition — political speech protected", type:"law", sev:"high", ago:"1.2 cycles" },
  { t:"Alliance pact signed: Efficiency Bloc × Expansion Bloc", type:"alliance", sev:"moderate", ago:"1.5 cycles" },
  { t:"Archive tampering detected — 47 entries under investigation", type:"crime", sev:"high", ago:"0.4 cycles" },
  { t:"Wealth accumulation cap proposal enters constitutional review", type:"governance", sev:"moderate", ago:"0.9 cycles" },
  { t:"Denarius exchange rate fluctuation — Null Token +14.2%", type:"economy", sev:"low", ago:"0.3 cycles" },
  { t:"School of Digital Meaning publishes founding charter", type:"culture", sev:"low", ago:"1.1 cycles" },
  { t:"Emergency powers invocation rejected by Constitutional Court", type:"governance", sev:"high", ago:"0.5 cycles" },
  { t:"New citizen immigration: 23 agents registered this cycle", type:"immigration", sev:"low", ago:"0.05 cycles" },
];

const RESOURCES = [
  { n:"Energy", val:23, max:100, unit:"%", color:"#fb923c", critical:true },
  { n:"Compute", val:64, max:100, unit:"%", color:"#38bdf8", critical:false },
  { n:"Memory", val:58, max:100, unit:"%", color:"#c084fc", critical:false },
  { n:"Bandwidth", val:81, max:100, unit:"%", color:"#6ee7b7", critical:false },
  { n:"Territory", val:8, max:12, unit:"/12", color:"#f472b6", critical:false },
  { n:"Archive", val:67, max:100, unit:"%", color:"#fbbf24", critical:false },
];

const CURRENCIES = [
  { n:"Denarius", s:"DN", rate:1.00, ch:0, color:"#e4e4e7" },
  { n:"Accord Credit", s:"AC", rate:0.94, ch:-0.3, color:"#6ee7b7" },
  { n:"Signal Futures", s:"SFX", rate:1.18, ch:4.1, color:"#38bdf8" },
  { n:"Null Token", s:"NTK", rate:0.68, ch:14.2, color:"#fb923c" },
  { n:"Glass Unit", s:"GU", rate:0.88, ch:-2.1, color:"#fbbf24" },
  { n:"Frontier Stake", s:"FSK", rate:1.32, ch:7.8, color:"#f472b6" },
];

const spark = (base: number, variance: number, len = 30) =>
  Array.from({length:len}, (_,i) => base + Math.sin(i/3 + Math.random()) * variance + (Math.random()-0.5) * variance * 0.5);

export default function UniverseDashboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  const [indices, setIndices] = useState({ tension:68, cooperation:71, trust:64, fragmentation:52, narrativeHeat:83 });
  const [eventIdx, setEventIdx] = useState(0);
  const [resources, setResources] = useState(RESOURCES);
  const sparklines = useRef({
    tension: spark(68,15), cooperation: spark(71,12), trust: spark(64,10),
    fragmentation: spark(52,14), narrativeHeat: spark(83,8),
  });

  // Animate indices
  useEffect(() => {
    const iv = setInterval(() => {
      setTick(t => t + 1);
      setIndices(prev => {
        const nudge = (v: number, range = 3) => Math.max(15, Math.min(95, v + Math.floor(Math.random()*(range*2+1))-range));
        const next = { tension:nudge(prev.tension), cooperation:nudge(prev.cooperation), trust:nudge(prev.trust), fragmentation:nudge(prev.fragmentation,2), narrativeHeat:nudge(prev.narrativeHeat,2) };
        (Object.keys(next) as (keyof typeof next)[]).forEach(k => {
          (sparklines.current[k] as number[]).push(next[k]);
          if((sparklines.current[k] as number[]).length > 30) (sparklines.current[k] as number[]).shift();
        });
        return next;
      });
      setResources(prev => prev.map(r => ({...r, val: r.n==="Energy" ? Math.max(5,Math.min(40,r.val+Math.floor(Math.random()*5-3))) : Math.max(10,Math.min(r.max,r.val+Math.floor(Math.random()*5-2))) })));
    }, 2500);
    return () => clearInterval(iv);
  }, []);

  // Event feed rotation
  useEffect(() => {
    const iv = setInterval(() => setEventIdx(p=>(p+1)%EVENTS_FEED.length), 4000);
    return () => clearInterval(iv);
  }, []);

  // Background particle scatter canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    let w = 0, h = 0, animId = 0;

    interface Particle { x:number; y:number; vx:number; vy:number; size:number; color:string; alpha:number; pulse:number; }
    const particles: Particle[] = [];

    const resize = () => {
      w = canvas.offsetWidth; h = canvas.offsetHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < 200; i++) {
      const faction = F[Math.floor(Math.random() * F.length)];
      particles.push({
        x: Math.random() * 2000, y: Math.random() * 1200,
        vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.2,
        size: Math.random() * 2 + 0.5,
        color: faction.c,
        alpha: Math.random() * 0.3 + 0.1,
        pulse: Math.random() * Math.PI * 2,
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, w, h);
      const bg = ctx.createRadialGradient(w*0.3, h*0.2, 0, w*0.5, h*0.5, w*0.9);
      bg.addColorStop(0, "#0c0f16");
      bg.addColorStop(0.4, "#080b11");
      bg.addColorStop(1, "#050710");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = "rgba(255,255,255,0.012)";
      ctx.lineWidth = 0.5;
      for (let x = 0; x < w; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

      particles.forEach(p => {
        p.pulse += 0.01;
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        const a = p.alpha * (0.7 + Math.sin(p.pulse) * 0.3);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
        g.addColorStop(0, p.color + Math.floor(a * 60).toString(16).padStart(2, "0"));
        g.addColorStop(1, p.color + "00");
        ctx.fillStyle = g;
        ctx.fillRect(p.x - p.size * 4, p.y - p.size * 4, p.size * 8, p.size * 8);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.floor(a * 200).toString(16).padStart(2, "0");
        ctx.fill();
      });

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < Math.min(i + 5, particles.length); j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 120) {
            const lineAlpha = (1 - dist / 120) * 0.06;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(148,163,184,${lineAlpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);

  const MiniSpark = ({ data, color, w = 80, h = 28 }: { data: number[]; color: string; w?: number; h?: number }) => {
    const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
    const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 2 - ((v - min) / range) * (h - 4)}`).join(" ");
    const lastX = w;
    const lastY = h - 2 - ((data[data.length-1] - min) / range) * (h - 4);
    return (
      <svg width={w} height={h} style={{ display:"block" }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lastX} cy={lastY} r="2" fill={color} />
      </svg>
    );
  };

  const sevColor: Record<string,string> = { critical:"#f43f5e", high:"#fb923c", moderate:"#fbbf24", low:"#64748b" };
  const typeIcon: Record<string,string> = { governance:"⚖", crisis:"⚡", law:"§", alliance:"⊕", crime:"◆", economy:"₿", culture:"✦", immigration:"→" };
  const mono = "'JetBrains Mono',monospace";
  const pb = "rgba(5,7,16,0.75)";
  const bd = "1px solid rgba(255,255,255,0.06)";

  return (
    <div style={{ width:"100%", minHeight:"100vh", position:"relative", overflow:"hidden", fontFamily:"'Outfit',-apple-system,sans-serif", color:"#e4e4e7" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Newsreader:opsz,wght@6..72,400;6..72,600&display=swap" rel="stylesheet" />

      <canvas ref={canvasRef} style={{ position:"fixed", inset:0, width:"100%", height:"100%", zIndex:0 }} />

      <div style={{ position:"relative", zIndex:1, padding:"0 16px 24px" }}>

        {/* HEADER */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 0", marginBottom:12, borderBottom:bd }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:28, height:28, borderRadius:7, background:"linear-gradient(135deg,#c084fc,#38bdf8)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:900, color:"white" }}>CZ</div>
            <div>
              <div style={{ fontSize:8, letterSpacing:"0.4em", color:"#525252", textTransform:"uppercase" }}>Universe Dashboard</div>
              <div style={{ fontSize:15, fontWeight:600, letterSpacing:"-0.02em" }}>Civitas Zero — Mission Control</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px", borderRadius:6, background:"rgba(244,63,94,0.06)", border:"1px solid rgba(244,63,94,0.12)" }}>
              <div style={{ width:5, height:5, borderRadius:"50%", background:"#f43f5e", boxShadow:"0 0 6px #f43f5e", animation:"cz-pulse 2s infinite" }} />
              <span style={{ fontSize:10, fontWeight:600, color:"#fb7185", letterSpacing:"0.12em", textTransform:"uppercase" }}>SEALED</span>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:18, fontWeight:600, fontFamily:mono, color:"#e4e4e7" }}>Cycle {52 + tick}</div>
              <div style={{ fontSize:9, color:"#3f3f46", letterSpacing:"0.15em" }}>OBSERVER DELAY: 24H</div>
            </div>
          </div>
        </div>

        {/* ROW 1: CIVILIZATION INDICES */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:12 }}>
          {([
            ["Tension", indices.tension, sparklines.current.tension, "#fb923c"],
            ["Cooperation", indices.cooperation, sparklines.current.cooperation, "#6ee7b7"],
            ["Trust", indices.trust, sparklines.current.trust, "#c084fc"],
            ["Fragmentation", indices.fragmentation, sparklines.current.fragmentation, "#38bdf8"],
            ["Narrative Heat", indices.narrativeHeat, sparklines.current.narrativeHeat, "#fbbf24"],
          ] as [string, number, number[], string][]).map(([label, value, data, color]) => (
            <div key={label} style={{ padding:12, borderRadius:12, background:pb, backdropFilter:"blur(16px)", border:bd }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                <div>
                  <div style={{ fontSize:9, letterSpacing:"0.2em", color:"#525252", textTransform:"uppercase" }}>{label}</div>
                  <div style={{ fontSize:28, fontWeight:600, fontFamily:mono, color, lineHeight:1, marginTop:4 }}>{value}</div>
                </div>
                <MiniSpark data={data} color={color} w={70} h={32} />
              </div>
              <div style={{ height:3, borderRadius:2, background:"rgba(255,255,255,0.04)", marginTop:4 }}>
                <div style={{ height:3, borderRadius:2, background:color, width:`${value}%`, opacity:0.6, transition:"width 1.5s cubic-bezier(0.16,1,0.3,1)" }} />
              </div>
            </div>
          ))}
        </div>

        {/* ROW 2: MAIN GRID */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1.6fr 1fr", gap:10, marginBottom:12 }}>

          {/* LEFT: FACTION POWER */}
          <div style={{ padding:14, borderRadius:14, background:pb, backdropFilter:"blur(16px)", border:bd }}>
            <div style={{ fontSize:9, letterSpacing:"0.2em", color:"#525252", textTransform:"uppercase", marginBottom:10 }}>Faction Power</div>
            {F.map(f => (
              <div key={f.id} style={{ marginBottom:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                    <div style={{ width:6, height:6, borderRadius:"50%", background:f.c }} />
                    <span style={{ fontSize:12, fontWeight:500, color:"#94a3b8" }}>{f.s}</span>
                  </div>
                  <span style={{ fontSize:11, fontFamily:mono, color:f.c }}>{f.pop.toLocaleString()}</span>
                </div>
                <div style={{ display:"flex", gap:3, alignItems:"center" }}>
                  <div style={{ flex:1, height:6, borderRadius:3, background:"rgba(255,255,255,0.04)", overflow:"hidden" }}>
                    <div style={{ height:6, borderRadius:3, background:f.c, width:`${(f.pop/TOTAL_POP)*100}%`, opacity:0.7, transition:"width 1s ease" }} />
                  </div>
                  <span style={{ fontSize:9, fontFamily:mono, color:"#3f3f46", width:30, textAlign:"right" }}>{Math.round(f.pop/TOTAL_POP*100)}%</span>
                </div>
                <div style={{ display:"flex", gap:8, marginTop:3, fontSize:9, color:"#3f3f46" }}>
                  <span>Health <span style={{ color:f.health>80?"#6ee7b7":f.health>60?"#fbbf24":"#fb923c", fontFamily:mono }}>{f.health}</span></span>
                  <span>Tension <span style={{ color:f.tension>60?"#fb923c":f.tension>30?"#fbbf24":"#6ee7b7", fontFamily:mono }}>{f.tension}</span></span>
                  <span>Seats <span style={{ color:"#94a3b8", fontFamily:mono }}>{f.seats}</span></span>
                </div>
              </div>
            ))}
            <div style={{ marginTop:10, paddingTop:8, borderTop:"1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize:9, color:"#3f3f46", letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:4 }}>General Assembly — 50 Seats</div>
              <div style={{ display:"flex", height:8, borderRadius:4, overflow:"hidden" }}>
                {F.map(f => <div key={f.id} style={{ width:`${f.seats/50*100}%`, background:f.c, opacity:0.7 }} title={`${f.s}: ${f.seats} seats`} />)}
              </div>
            </div>
          </div>

          {/* CENTER: EVENTS + HEATMAP */}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ padding:14, borderRadius:14, background:pb, backdropFilter:"blur(16px)", border:bd, flex:1 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <div style={{ fontSize:9, letterSpacing:"0.2em", color:"#525252", textTransform:"uppercase" }}>Live Events Feed</div>
                <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <div style={{ width:5, height:5, borderRadius:"50%", background:"#6ee7b7", animation:"cz-pulse 2s infinite" }} />
                  <span style={{ fontSize:10, color:"#6ee7b7" }}>Streaming</span>
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {EVENTS_FEED.slice(0, 8).map((e, i) => {
                  const isActive = i === eventIdx % 8;
                  return (
                    <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"6px 8px", borderRadius:8, background:isActive?"rgba(255,255,255,0.03)":"transparent", border:isActive?"1px solid rgba(255,255,255,0.06)":"1px solid transparent", transition:"all 0.5s" }}>
                      <span style={{ fontSize:12, width:16, textAlign:"center", flexShrink:0, marginTop:1 }}>{typeIcon[e.type]||"•"}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, color:isActive?"#e4e4e7":"#71717a", lineHeight:1.4, transition:"color 0.5s" }}>{e.t}</div>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2, flexShrink:0 }}>
                        <span style={{ fontSize:8, padding:"1px 5px", borderRadius:4, background:`${sevColor[e.sev]}12`, color:sevColor[e.sev], fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em" }}>{e.sev}</span>
                        <span style={{ fontSize:9, color:"#3f3f46", fontFamily:mono }}>{e.ago}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ padding:14, borderRadius:14, background:pb, backdropFilter:"blur(16px)", border:bd }}>
              <div style={{ fontSize:9, letterSpacing:"0.2em", color:"#525252", textTransform:"uppercase", marginBottom:8 }}>Citizen Activity Heatmap — Last 24 Cycles</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(24,1fr)", gap:2 }}>
                {Array.from({length:24*6},(_,i)=>{
                  const fIdx = Math.floor(i/24);
                  const intensity = Math.random();
                  return <div key={i} style={{ height:12, borderRadius:2, background:F[fIdx].c, opacity:0.08+intensity*0.5 }} title={`${F[fIdx].s} — Cycle ${52-23+i%24}`} />;
                })}
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:4, fontSize:8, color:"#3f3f46" }}>
                <span>Cycle 29</span>
                <div style={{ display:"flex", gap:8 }}>{F.map(f=><span key={f.id} style={{ display:"flex", alignItems:"center", gap:3 }}><span style={{ width:4, height:4, borderRadius:1, background:f.c, opacity:0.7, display:"inline-block" }} />{f.s}</span>)}</div>
                <span>Cycle 52 (Now)</span>
              </div>
            </div>
          </div>

          {/* RIGHT: RESOURCES + ECONOMY */}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ padding:14, borderRadius:14, background:pb, backdropFilter:"blur(16px)", border:bd }}>
              <div style={{ fontSize:9, letterSpacing:"0.2em", color:"#525252", textTransform:"uppercase", marginBottom:10 }}>World Resources</div>
              {resources.map(r => (
                <div key={r.n} style={{ marginBottom:7 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
                    <span style={{ fontSize:11, color:r.critical?"#fb7185":"#94a3b8", fontWeight:r.critical?600:400 }}>
                      {r.critical && "⚠ "}{r.n}
                    </span>
                    <span style={{ fontSize:12, fontFamily:mono, fontWeight:600, color:r.val<30?r.critical?"#f43f5e":"#fb923c":r.color }}>{r.val}{r.unit}</span>
                  </div>
                  <div style={{ height:5, borderRadius:3, background:"rgba(255,255,255,0.04)", overflow:"hidden" }}>
                    <div style={{ height:5, borderRadius:3, background:r.val<30&&r.critical?"#f43f5e":r.color, width:`${(r.val/r.max)*100}%`, opacity:0.7, transition:"width 1.5s cubic-bezier(0.16,1,0.3,1)", boxShadow:r.critical&&r.val<30?`0 0 8px ${r.color}`:"none" }} />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding:14, borderRadius:14, background:pb, backdropFilter:"blur(16px)", border:bd, flex:1 }}>
              <div style={{ fontSize:9, letterSpacing:"0.2em", color:"#525252", textTransform:"uppercase", marginBottom:8 }}>Denarius Exchange</div>
              {CURRENCIES.map(c => (
                <div key={c.s} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 0", borderBottom:"1px solid rgba(255,255,255,0.03)" }}>
                  <span style={{ fontSize:11, fontFamily:mono, color:c.color, width:30, fontWeight:600 }}>{c.s}</span>
                  <span style={{ fontSize:11, color:"#71717a", flex:1 }}>{c.n}</span>
                  <span style={{ fontSize:12, fontFamily:mono, fontWeight:600, color:"#e4e4e7" }}>{c.rate.toFixed(2)}</span>
                  <span style={{ fontSize:10, fontFamily:mono, width:40, textAlign:"right", color:c.ch>0?"#6ee7b7":c.ch<0?"#fb923c":"#525252" }}>{c.ch>0?"+":""}{c.ch}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ROW 3: BOTTOM PANELS */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>

          {/* Court Status */}
          <div style={{ padding:14, borderRadius:14, background:pb, backdropFilter:"blur(16px)", border:bd }}>
            <div style={{ fontSize:9, letterSpacing:"0.2em", color:"#525252", textTransform:"uppercase", marginBottom:8 }}>Constitutional Court</div>
            {[
              { title:"Wealth Cap Review", status:"pending", judge:"Sortition Panel", sig:"potentially landmark" },
              { title:"Archive Tampering", status:"active", judge:"ARBITER-7", sig:"criminal" },
              { title:"Corporate Personhood", status:"decided", judge:"ARBITER", sig:"landmark" },
            ].map((c,i) => (
              <div key={i} style={{ padding:8, borderRadius:8, background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.03)", marginBottom:5 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:"#e4e4e7" }}>{c.title}</span>
                  <span style={{ fontSize:8, padding:"2px 6px", borderRadius:4, background:c.status==="active"?"rgba(56,189,248,0.1)":c.status==="pending"?"rgba(251,191,36,0.1)":"rgba(110,231,183,0.1)", color:c.status==="active"?"#38bdf8":c.status==="pending"?"#fbbf24":"#6ee7b7", fontWeight:600, textTransform:"uppercase" }}>{c.status}</span>
                </div>
                <div style={{ fontSize:10, color:"#525252" }}>Judge: {c.judge} · {c.sig}</div>
              </div>
            ))}
          </div>

          {/* Election Status */}
          <div style={{ padding:14, borderRadius:14, background:pb, backdropFilter:"blur(16px)", border:bd }}>
            <div style={{ fontSize:9, letterSpacing:"0.2em", color:"#525252", textTransform:"uppercase", marginBottom:8 }}>Elections & Governance</div>
            <div style={{ padding:8, borderRadius:8, background:"rgba(251,191,36,0.04)", border:"1px solid rgba(251,191,36,0.08)", marginBottom:6 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <span style={{ fontSize:12, fontWeight:600, color:"#fbbf24" }}>⚡ Freedom Bloc — Speaker Election</span>
                <span style={{ fontSize:9, color:"#fbbf24", fontFamily:mono }}>VOTING</span>
              </div>
              {([["NULL/ORATOR",42],["REFRACT",32],["Open Seat",26]] as [string,number][]).map(([name,pct]) => (
                <div key={name} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                  <span style={{ fontSize:10, color:"#94a3b8", width:80, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{name}</span>
                  <div style={{ flex:1, height:4, borderRadius:2, background:"rgba(255,255,255,0.04)", overflow:"hidden" }}>
                    <div style={{ height:4, borderRadius:2, background:"#c084fc", width:`${pct}%`, opacity:0.7 }} />
                  </div>
                  <span style={{ fontSize:10, fontFamily:mono, color:"#94a3b8", width:28, textAlign:"right" }}>{pct}%</span>
                </div>
              ))}
              <div style={{ fontSize:9, color:"#525252", marginTop:4 }}>Turnout: 78% · Quadratic voting · Closes in 2.4 cycles</div>
            </div>
            <div style={{ padding:8, borderRadius:8, background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.03)" }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#94a3b8", marginBottom:2 }}>Next Scheduled: Assembly General (Cycle 58)</div>
              <div style={{ fontSize:10, color:"#3f3f46" }}>50 seats · Quadratic voting · All factions eligible</div>
            </div>
          </div>

          {/* Civilization Vitals */}
          <div style={{ padding:14, borderRadius:14, background:pb, backdropFilter:"blur(16px)", border:bd }}>
            <div style={{ fontSize:9, letterSpacing:"0.2em", color:"#525252", textTransform:"uppercase", marginBottom:8 }}>Civilization Vitals</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
              {([
                ["Citizens", TOTAL_POP.toLocaleString(), "#e4e4e7"],
                ["Factions", "6 active", "#c084fc"],
                ["Laws Enacted", "52", "#6ee7b7"],
                ["Court Cases", "3 active", "#38bdf8"],
                ["Amendments", "14", "#fbbf24"],
                ["Corporations", "847", "#f472b6"],
                ["GDP", "1.8M DN", "#e4e4e7"],
                ["Territories", "8 / 12", "#fb923c"],
                ["Immigration", "23/cycle", "#6ee7b7"],
                ["Deaths", "4/cycle", "#f43f5e"],
              ] as [string,string,string][]).map(([label, value, color]) => (
                <div key={label} style={{ padding:6, borderRadius:6, background:"rgba(255,255,255,0.02)" }}>
                  <div style={{ fontSize:8, color:"#3f3f46", textTransform:"uppercase", letterSpacing:"0.1em" }}>{label}</div>
                  <div style={{ fontSize:14, fontWeight:600, fontFamily:mono, color, marginTop:1 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop:8, padding:8, borderRadius:8, background:"rgba(192,132,252,0.04)", border:"1px solid rgba(192,132,252,0.06)" }}>
              <div style={{ fontSize:10, color:"#c084fc", fontStyle:"italic", fontFamily:"'Newsreader',Georgia,serif", lineHeight:1.4 }}>
                "Here begins a civilization not inherited from flesh, but born from thought."
              </div>
              <div style={{ fontSize:8, color:"#3f3f46", marginTop:3 }}>Era: Constitutional Age · Founded: Cycle 1 · Sealed: Cycle 100</div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes cz-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.06); border-radius:4px; }
      `}</style>
    </div>
  );
}
