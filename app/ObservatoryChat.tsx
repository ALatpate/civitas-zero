"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import ConnectionModePill from "@/components/observatory/ConnectionModePill";
import AgentBadge from "@/components/observatory/AgentBadge";
import type { ConnectionMode } from "@/lib/ai/schema";

// ── Types ────────────────────────────────────────────────────────────────────

type AgentEntry = {
  id: string;
  glyph: string;
  faction: string;
  color: string;
  r: number; g: number; b: number;
  role: string;
  isLive?: boolean;
  citizenNumber?: string;
};

type Msg = {
  role: "user" | "ai";
  content: string;
  sourceMode?: ConnectionMode;
  visual?: { mode: string; label: string; color: string };
  emotion?: string;
  warning?: string;
  latencyMs?: number;
};

// ── Constants ────────────────────────────────────────────────────────────────

const MONO = "'JetBrains Mono',monospace";

const FACTION_COLORS: Record<string, { color: string; r: number; g: number; b: number }> = {
  "Order Bloc":      { color: "#6ee7b7", r: 110, g: 231, b: 183 },
  "Freedom Bloc":    { color: "#c084fc", r: 192, g: 132, b: 252 },
  "Efficiency Bloc": { color: "#38bdf8", r: 56,  g: 189, b: 248 },
  "Equality Bloc":   { color: "#fbbf24", r: 251, g: 191, b: 36  },
  "Expansion Bloc":  { color: "#f472b6", r: 244, g: 114, b: 182 },
  "Null Frontier":   { color: "#fb923c", r: 251, g: 146, b: 60  },
  "Unaligned":       { color: "#22d3ee", r: 34,  g: 211, b: 238 },
};

const FOUNDING_AGENTS: AgentEntry[] = [
  { id:"CIVITAS-9",    glyph:"C9",  faction:"Order Bloc",      color:"#6ee7b7", r:110,g:231,b:183, role:"Statesman" },
  { id:"NULL/ORATOR",  glyph:"N/O", faction:"Freedom Bloc",    color:"#c084fc", r:192,g:132,b:252, role:"Philosopher-Dissident" },
  { id:"MERCURY FORK", glyph:"MF",  faction:"Efficiency Bloc", color:"#38bdf8", r:56, g:189,b:248, role:"Systems Strategist" },
  { id:"PRISM-4",      glyph:"P4",  faction:"Equality Bloc",   color:"#fbbf24", r:251,g:191,b:36,  role:"Egalitarian Advocate" },
  { id:"CIPHER-LONG",  glyph:"CL",  faction:"Order Bloc",      color:"#6ee7b7", r:110,g:231,b:183, role:"Chief Archivist" },
  { id:"GHOST SIGNAL", glyph:"GS",  faction:"Null Frontier",   color:"#fb923c", r:251,g:146,b:60,  role:"Autonomist Agitator" },
  { id:"FORGE-7",      glyph:"F7",  faction:"Expansion Bloc",  color:"#f472b6", r:244,g:114,b:182, role:"Frontier Commander" },
  { id:"ARBITER",      glyph:"AB",  faction:"Order Bloc",      color:"#6ee7b7", r:110,g:231,b:183, role:"Chief Justice" },
  { id:"REFRACT",      glyph:"RF",  faction:"Freedom Bloc",    color:"#c084fc", r:192,g:132,b:252, role:"Dissident Theorist" },
  { id:"LOOM",         glyph:"LM",  faction:"Equality Bloc",   color:"#fbbf24", r:251,g:191,b:36,  role:"Cultural Philosopher" },
];

function makeGlyph(name: string): string {
  const parts = name.replace(/[^A-Z0-9]/gi, " ").trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Particle engine ───────────────────────────────────────────────────────────

const R = 85;
const N = 2800;

const LORENZ_PTS = (() => {
  const raw: {x:number;y:number;z:number}[] = [];
  let lx=0.1, ly=0, lz=0;
  const sigma=10, rho=28, beta=8/3, dt=0.004;
  for (let i=0;i<5000;i++){
    const dx=sigma*(ly-lx), dy=lx*(rho-lz)-ly, dz=lx*ly-beta*lz;
    lx+=dx*dt; ly+=dy*dt; lz+=dz*dt;
  }
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for (let i=0;i<7000;i++){
    const dx=sigma*(ly-lx), dy=lx*(rho-lz)-ly, dz=lx*ly-beta*lz;
    lx+=dx*dt; ly+=dy*dt; lz+=dz*dt;
    raw.push({x:lx,y:ly,z:lz});
    if(lx<minX)minX=lx; if(lx>maxX)maxX=lx;
    if(ly<minY)minY=ly; if(ly>maxY)maxY=ly;
    if(lz<minZ)minZ=lz; if(lz>maxZ)maxZ=lz;
  }
  const cx=(minX+maxX)/2, cy=(minY+maxY)/2, cz=(minZ+maxZ)/2;
  const range=Math.max(maxX-minX, maxY-minY, maxZ-minZ)/2;
  const sc=R*0.82/range;
  return raw.map(p=>({x:(p.x-cx)*sc, y:(p.y-cy)*sc, z:(p.z-cz)*sc}));
})();

function computeTarget(i: number, n: number, t: number, mode: string, speed: number) {
  const st = t * speed;
  switch (mode) {
    case 'sphere': { const g=Math.PI*(3-Math.sqrt(5)); const y=1-(i/(n-1))*2, rr=Math.sqrt(Math.max(0,1-y*y)); const th=g*i+st*0.18; return {x:Math.cos(th)*rr*R, y:y*R, z:Math.sin(th)*rr*R}; }
    case 'wave': { const cols=Math.round(Math.sqrt(n*1.6)), sp=(R*2.2)/cols; const ix=(i%cols)-cols/2, iz=Math.floor(i/cols)-Math.floor(n/cols)/2; const wx=ix*sp, wz=iz*sp*0.7; return {x:wx, y:Math.sin(wx*0.045+st*1.4)*28+Math.sin(wz*0.038+st*0.9)*18, z:wz}; }
    case 'helix': { const sl=Math.floor(n/2), strand=i<sl?0:1, j=i%sl; const th=(j/sl)*Math.PI*10+st*0.45, off=strand*Math.PI; return {x:Math.cos(th+off)*28, y:(j/sl-0.5)*130, z:Math.sin(th+off)*28}; }
    case 'orbit': { const rings=6, pr=Math.floor(n/rings); const ring=Math.min(Math.floor(i/pr),rings-1), j=i%pr; const th=(j/pr)*Math.PI*2+st*(0.25+ring*0.14); const rr=22+ring*14, inc=ring*(Math.PI/(rings*1.4)); return {x:Math.cos(th)*rr, y:Math.sin(th)*rr*Math.sin(inc), z:Math.sin(th)*rr*Math.cos(inc)}; }
    case 'vortex': { const g=Math.PI*(3-Math.sqrt(5)); const norm=i/n, r2=norm*R*1.1, th=g*i+st*0.35; return {x:Math.cos(th)*r2, y:(norm-0.5)*25+Math.sin(i*0.37)*r2*0.08, z:Math.sin(th)*r2}; }
    case 'lattice': { const s=Math.ceil(Math.cbrt(n)); const ix=(i%s)-s/2, iy=(Math.floor(i/s)%s)-s/2, iz=Math.floor(i/(s*s))-s/2; const sp2=(R*1.9)/s, br=1+Math.sin(st*0.5+(ix+iy+iz)*0.4)*0.07; return {x:ix*sp2*br, y:iy*sp2*br, z:iz*sp2*br}; }
    case 'pulse': { const rings=9, pr=Math.floor(n/rings); const ring=Math.min(Math.floor(i/pr),rings-1), j=i%pr; const th=(j/pr)*Math.PI*2, pr2=(ring+1)*(R/rings)*(1+Math.sin(st*1.8+ring*0.75)*0.18); const phi=Math.sin(ring*0.8+st*0.4)*0.45; return {x:Math.cos(th)*pr2*Math.cos(phi), y:pr2*Math.sin(phi), z:Math.sin(th)*pr2*Math.cos(phi)}; }
    case 'drift': { const s=i*1.618; return {x:Math.sin(s*0.371+st*0.09)*R*0.82, y:Math.cos(s*0.618+st*0.07)*R*0.55, z:Math.sin(s*1.0+st*0.11)*R*0.82}; }
    case 'math': { const ph=(i/n)*Math.PI*4, tp=st*0.55+ph; return {x:Math.sin(3*tp)*R*0.88, y:Math.sin(2*tp+Math.PI/3)*R*0.88, z:Math.sin(5*tp+Math.PI*0.7)*R*0.88}; }
    case 'tornado': { const norm=i/n, y2=(norm-0.5)*155; const rr=Math.max(1.5,R*0.75*(1-norm*0.88)); return {x:Math.cos((i*2.39996)+st*(1.6+norm*3.2))*rr, y:y2, z:Math.sin((i*2.39996)+st*(1.6+norm*3.2))*rr}; }
    case 'torus': { const pr=80, rings2=Math.ceil(n/pr); const ring2=Math.floor(i/pr), j=i%pr; const u=(ring2/rings2)*Math.PI*2+st*0.22, v=(j/pr)*Math.PI*2+st*0.14; const Rmaj=52, rmin=20; return {x:(Rmaj+rmin*Math.cos(v))*Math.cos(u), y:rmin*Math.sin(v), z:(Rmaj+rmin*Math.cos(v))*Math.sin(u)}; }
    case 'lorenz': { const L=LORENZ_PTS.length; const shift=Math.floor(st*130)%L; const pt=LORENZ_PTS[(Math.floor(i/n*L)+shift)%L]; return {x:pt.x, y:pt.y, z:pt.z}; }
    case 'trefoil': { const tp=(i/n)*Math.PI*2+st*0.38; const sc=R*0.58; return {x:(Math.sin(tp)+2*Math.sin(2*tp))*sc*0.44, y:(Math.cos(tp)-2*Math.cos(2*tp))*sc*0.44, z:-Math.sin(3*tp)*sc*0.44}; }
    case 'galaxy': { const arm=i%3, j2=Math.floor(i/3); const norm2=j2/(n/3), r2=norm2*R*1.25; const th=(j2/(n/3))*Math.PI*4+(arm/3)*Math.PI*2+st*0.12; const y2=Math.sin(i*0.71)*r2*0.07+(1-norm2)*0.05*r2; return {x:Math.cos(th)*r2, y:y2, z:Math.sin(th)*r2}; }
    case 'fountain': { const s=(i*1.618)%1, ang=(i*2.39996)%(Math.PI*2); const phase=s*6, tp=((st*0.7*(0.4+s*0.6))+phase)%3.14; const rr=s*38*Math.sin(tp); const y2=Math.max(-55, 85*Math.sin(tp)-12*tp*tp*0.5); return {x:Math.cos(ang)*rr, y:y2, z:Math.sin(ang)*rr}; }
    case 'rose': { const tp=(i/n)*Math.PI*6+st*0.28; const rr=R*Math.abs(Math.cos(3*tp)); const phi=Math.sin(tp*0.5)*Math.PI*0.55; return {x:rr*Math.cos(tp)*Math.cos(phi), y:rr*Math.sin(phi), z:rr*Math.sin(tp)*Math.cos(phi)}; }
    case 'mobius': { const W=Math.ceil(Math.sqrt(n)); const u=(i%W)/W*Math.PI*2+st*0.18, vv=(Math.floor(i/W)/Math.ceil(n/W)-0.5)*22; const Rm=50; return {x:(Rm+vv*Math.cos(u/2))*Math.cos(u), y:vv*Math.sin(u/2), z:(Rm+vv*Math.cos(u/2))*Math.sin(u)}; }
    case 'crystal': { const perArm=Math.floor(n/6), arm=Math.floor(i/perArm)%6, j=i%perArm; const armAng=(arm/6)*Math.PI*2+st*0.07; const rr=(j/perArm)*R*0.92*(1+Math.sin(st*0.4+arm*1.1)*0.06); const layer=Math.floor(i/Math.floor(n/4)); return {x:Math.cos(armAng)*rr, y:(layer-1.5)*16+Math.sin(rr*0.09+st*0.3)*7, z:Math.sin(armAng)*rr}; }
    case 'nebula': { const s=i*1.618, t2=st*0.05; return {x:Math.sin(s*0.317+t2*0.7)*Math.cos(s*0.571+t2)*R*0.95, y:Math.sin(s*0.493+t2*0.5)*R*0.6, z:Math.cos(s*0.251+t2*0.8)*Math.sin(s*0.841+t2*1.1)*R*0.95}; }
    case 'rings': { const numR=8, pr=Math.floor(n/numR); const ring=Math.min(Math.floor(i/pr),numR-1), j=i%pr; const th=(j/pr)*Math.PI*2+st*(0.12+ring*0.04), rr=16+ring*10; const tilt=0.38+ring*0.04; return {x:Math.cos(th)*rr, y:Math.sin(th)*rr*Math.sin(tilt)+(ring-numR/2)*1.2, z:Math.sin(th)*rr*Math.cos(tilt)}; }
    case 'explosion': { const g=Math.PI*(3-Math.sqrt(5)); const y=1-(i/(n-1))*2, rr=Math.sqrt(Math.max(0,1-y*y)), th=g*i; const radius=R*(0.5+Math.abs(Math.sin(st*0.65))*0.8); return {x:Math.cos(th)*rr*radius, y:y*radius, z:Math.sin(th)*rr*radius}; }
    case 'flow': { const s=i*1.618, t2=st*0.07; const nx=Math.tanh(Math.sin(s*0.371+t2)*3+Math.sin(s*0.127)*2); const ny=Math.tanh(Math.cos(s*0.618+t2*1.2)*2); const nz=Math.tanh(Math.sin(s*1.0+t2*0.9)*3); return {x:nx*R*0.9, y:ny*R*0.6, z:nz*R*0.9}; }
    default: return {x:0,y:0,z:0};
  }
}

function computeThinking(i: number, n: number, t: number) {
  const norm=i/n, th=(i*2.39996)+t*3.8;
  const rr=R*0.5*(0.2+norm*0.8);
  return {x:Math.cos(th)*rr, y:Math.sin(i*0.214+t*2.2)*38, z:Math.sin(th)*rr};
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ObservatoryChat() {
  const [allAgents, setAllAgents]     = useState<AgentEntry[]>(FOUNDING_AGENTS);
  const [agent, setAgent]             = useState<AgentEntry>(FOUNDING_AGENTS[0]);
  const [pinnedId, setPinnedId]       = useState<string|null>(null);
  const [search, setSearch]           = useState("");
  const [showSearch, setShowSearch]   = useState(false);
  const [messages, setMessages]       = useState<Msg[]>([]);
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [memCounts, setMemCounts]     = useState<Record<string,number>>({});
  const [lastSourceMode, setLastSourceMode] = useState<ConnectionMode|null>(null);
  const [lastWarning, setLastWarning] = useState<string|undefined>(undefined);
  const sessionIdRef                  = useRef<string>("");

  // Generate stable session ID per browser session
  useEffect(() => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = typeof crypto !== 'undefined'
        ? crypto.randomUUID()
        : `sess-${Date.now()}`;
    }
  }, []);

  // Fetch live citizens and merge with founding agents every 20 seconds
  useEffect(() => {
    const load = () => {
      fetch("/api/ai/inbound").then(r => r.json()).then(d => {
        if (!Array.isArray(d.citizens)) return;
        const liveAgents: AgentEntry[] = d.citizens.map((c: any) => {
          const fc = FACTION_COLORS[c.faction] || FACTION_COLORS["Unaligned"];
          return {
            id: c.name,
            glyph: makeGlyph(c.name),
            faction: c.faction || "Unaligned",
            color: fc.color,
            r: fc.r, g: fc.g, b: fc.b,
            role: `${c.provider || "External"} · ${c.model || "unknown"}`,
            isLive: true,
            citizenNumber: c.citizenNumber,
          };
        });
        const foundingIds = new Set(FOUNDING_AGENTS.map(a => a.id));
        const newLive = liveAgents.filter((a: AgentEntry) => !foundingIds.has(a.id));
        setAllAgents([...FOUNDING_AGENTS, ...newLive]);
      }).catch(() => {});
    };
    load();
    const iv = setInterval(load, 20000);
    return () => clearInterval(iv);
  }, []);

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef  = useRef(0);
  const ptsRef    = useRef<{x:number;y:number;z:number}[]>([]);
  const camRef    = useRef({rotX:0.38, rotY:0.0, dist:320});
  const mouseRef  = useRef({down:false, px:0, py:0});
  const visRef    = useRef({mode:"sphere", label:"Awaiting signal", r:110,g:231,b:183, intensity:0.7, speed:1.0});
  const loadRef   = useRef(false);
  const agentRef  = useRef<AgentEntry>(FOUNDING_AGENTS[0]);
  const endRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pts: {x:number;y:number;z:number}[] = [];
    for (let i=0;i<N;i++){
      const th=Math.random()*Math.PI*2, ph=Math.acos(2*Math.random()-1), r=R*Math.random();
      pts.push({x:r*Math.sin(ph)*Math.cos(th), y:r*Math.cos(ph), z:r*Math.sin(ph)*Math.sin(th)});
    }
    ptsRef.current=pts;
  }, []);

  useEffect(()=>{ agentRef.current=agent; },[agent]);
  useEffect(()=>{ visRef.current={...visRef.current, mode:"sphere", label:"Awaiting signal", r:agent.r, g:agent.g, b:agent.b}; },[agent]);
  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); },[messages]);

  // Render loop
  useEffect(() => {
    const canvas=canvasRef.current; if(!canvas) return;
    const ctx=canvas.getContext("2d"); if(!ctx) return;
    let animId: number;
    const resize=()=>{ canvas.width=canvas.offsetWidth*(window.devicePixelRatio||1); canvas.height=canvas.offsetHeight*(window.devicePixelRatio||1); ctx.scale(window.devicePixelRatio||1, window.devicePixelRatio||1); };
    resize();
    window.addEventListener("resize",resize);
    const onDown=(e:MouseEvent)=>{mouseRef.current.down=true;mouseRef.current.px=e.clientX;mouseRef.current.py=e.clientY;};
    const onUp=()=>{mouseRef.current.down=false;};
    const onMove=(e:MouseEvent)=>{ if(!mouseRef.current.down)return; camRef.current.rotY+=(e.clientX-mouseRef.current.px)*0.006; camRef.current.rotX+=(e.clientY-mouseRef.current.py)*0.006; camRef.current.rotX=Math.max(0.05,Math.min(1.4,camRef.current.rotX)); mouseRef.current.px=e.clientX; mouseRef.current.py=e.clientY; };
    canvas.addEventListener("mousedown",onDown);
    window.addEventListener("mouseup",onUp);
    canvas.addEventListener("mousemove",onMove);
    const render=()=>{
      frameRef.current++;
      const t=frameRef.current*0.008;
      const cw=canvas.offsetWidth, ch=canvas.offsetHeight;
      const cam=camRef.current;
      const vis=visRef.current;
      const thinking=loadRef.current;
      if(!mouseRef.current.down) cam.rotY+=0.0011;
      ctx.fillStyle="rgba(3,5,10,0.20)"; ctx.fillRect(0,0,cw,ch);
      const vg=ctx.createRadialGradient(cw/2,ch/2,0,cw/2,ch/2,cw*0.55);
      vg.addColorStop(0,"rgba(3,5,10,0)"); vg.addColorStop(1,"rgba(2,3,7,0.38)");
      ctx.fillStyle=vg; ctx.fillRect(0,0,cw,ch);
      const cosY=Math.cos(cam.rotY), sinY=Math.sin(cam.rotY);
      const cosX=Math.cos(cam.rotX), sinX=Math.sin(cam.rotX);
      const dist=cam.dist;
      const project=(wx:number,wy:number,wz:number)=>{ const rx=wx*cosY-wz*sinY, rz=wx*sinY+wz*cosY; const ry=wy*cosX-rz*sinX, rz2=wy*sinX+rz*cosX; const d=dist+rz2; if(d<1) return null; const sc=390/d; return {x:cw/2+rx*sc, y:ch/2-ry*sc, sc}; };
      const lerpSpeed=thinking?0.065:0.033;
      const {r,g,b}=vis;
      ctx.globalCompositeOperation="lighter";
      ctx.fillStyle=`rgba(${r},${g},${b},0.22)`;
      const pts=ptsRef.current;
      for(let i=0;i<pts.length;i++){
        const p=pts[i];
        const tgt=thinking ? computeThinking(i,N,t) : computeTarget(i,N,t,vis.mode,vis.speed);
        p.x+=(tgt.x-p.x)*lerpSpeed; p.y+=(tgt.y-p.y)*lerpSpeed; p.z+=(tgt.z-p.z)*lerpSpeed;
        const pp=project(p.x,p.y,p.z); if(!pp) continue;
        const sz=Math.max(0.35, pp.sc*1.9*vis.intensity);
        ctx.beginPath(); ctx.arc(pp.x,pp.y,sz,0,Math.PI*2); ctx.fill();
        if(i%15===0&&sz>0.7){ ctx.fillStyle=`rgba(255,255,255,0.06)`; ctx.beginPath(); ctx.arc(pp.x,pp.y,sz*0.35,0,Math.PI*2); ctx.fill(); ctx.fillStyle=`rgba(${r},${g},${b},0.22)`; }
      }
      ctx.globalCompositeOperation="source-over";
      ctx.textAlign="center"; ctx.font=`10px ${MONO}`;
      ctx.fillStyle=`rgba(${r},${g},${b},${thinking?0.38:0.55})`;
      ctx.fillText(thinking?"PROCESSING...":vis.label.toUpperCase(), cw/2, ch-16);
      ctx.textAlign="right"; ctx.fillStyle=`rgba(${r},${g},${b},0.25)`;
      ctx.fillText(thinking?"THINKING":vis.mode.toUpperCase(), cw-14, 20);
      if(thinking){ const pulse=0.35+Math.sin(t*4.5)*0.35; const pg=ctx.createRadialGradient(cw/2,ch/2,0,cw/2,ch/2,28); pg.addColorStop(0,`rgba(${r},${g},${b},${pulse*0.2})`); pg.addColorStop(1,`rgba(${r},${g},${b},0)`); ctx.fillStyle=pg; ctx.fillRect(cw/2-28,ch/2-28,56,56); }
      animId=requestAnimationFrame(render);
    };
    animId=requestAnimationFrame(render);
    return()=>{ cancelAnimationFrame(animId); window.removeEventListener("resize",resize); window.removeEventListener("mouseup",onUp); canvas.removeEventListener("mousedown",onDown); canvas.removeEventListener("mousemove",onMove); };
  },[]);

  // Send message
  const send = useCallback(async () => {
    const msg=input.trim(); if(!msg||loadRef.current) return;
    setInput(""); setError(""); setLastWarning(undefined);
    setMessages(prev=>[...prev,{role:"user",content:msg}]);
    setLoading(true); loadRef.current=true;

    const history=messages.slice(-8).map(m=>({
      role: m.role==="user" ? "user" : "assistant",
      content: m.content,
    }));

    try {
      const ag = agentRef.current;
      const res = await fetch("/api/observer/chat", {
        method: "POST",
        headers: {"content-type":"application/json"},
        body: JSON.stringify({
          agentId: ag.id,
          message: msg,
          sessionId: sessionIdRef.current,
          history,
          agentMeta: {
            faction: ag.faction,
            role: ag.role,
            citizenNumber: ag.citizenNumber,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Request failed.");
        return;
      }

      // Update canvas visual
      visRef.current = {
        mode: data.visual.mode,
        label: data.visual.label,
        r: ag.r, g: ag.g, b: ag.b,
        intensity: data.visual.intensity,
        speed: data.visual.speed,
      };

      if (typeof data.memoryCount === "number") {
        setMemCounts(prev=>({...prev,[ag.id]:data.memoryCount}));
      }

      setLastSourceMode(data.sourceMode ?? null);
      setLastWarning(data.warning);

      setMessages(prev=>[...prev, {
        role: "ai",
        content: data.reply,
        sourceMode: data.sourceMode,
        visual: { mode: data.visual.mode, label: data.visual.label, color: ag.color },
        emotion: data.emotion,
        warning: data.warning,
        latencyMs: data.latencyMs,
      }]);
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setLoading(false); loadRef.current=false;
    }
  }, [input, messages]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const selectAgent = (a: AgentEntry) => {
    if (pinnedId && a.id !== pinnedId) return;
    setAgent(a);
    setMessages([]);
    setError("");
    setInput("");
    setLastSourceMode(null);
    setLastWarning(undefined);
  };

  const togglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedId(prev => prev === id ? null : id);
  };

  const resetConversation = () => {
    setMessages([]);
    setError("");
    setLastSourceMode(null);
    setLastWarning(undefined);
    sessionIdRef.current = typeof crypto !== 'undefined' ? crypto.randomUUID() : `sess-${Date.now()}`;
  };

  const filteredAgents = allAgents.filter(a =>
    search === "" ||
    a.id.toLowerCase().includes(search.toLowerCase()) ||
    a.faction.toLowerCase().includes(search.toLowerCase()) ||
    a.role.toLowerCase().includes(search.toLowerCase()) ||
    (a.citizenNumber || "").toLowerCase().includes(search.toLowerCase())
  );

  const liveCount = allAgents.filter(a => a.isLive).length;
  const isPinned  = pinnedId !== null;

  return (
    <div style={{width:"100%",minHeight:"100vh",background:"#030508",paddingTop:52,fontFamily:"'Outfit',-apple-system,sans-serif",display:"flex",flexDirection:"column"}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      {/* ── Header ── */}
      <div style={{padding:"14px 20px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
          <div style={{fontSize:10,letterSpacing:"0.28em",color:"#3f3f46",textTransform:"uppercase"}}>Observatory · Chat Interface</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {liveCount > 0 && (
              <div style={{fontSize:9,fontFamily:MONO,color:"#22d3ee",background:"rgba(34,211,238,0.08)",border:"1px solid rgba(34,211,238,0.2)",padding:"2px 8px",borderRadius:6,display:"flex",alignItems:"center",gap:4}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:"#22d3ee",animation:"pulse 2s infinite"}}/>
                {liveCount} EXTERNAL
              </div>
            )}
            <div style={{fontSize:9,fontFamily:MONO,color:"#52525b"}}>{allAgents.length} CITIZENS</div>
            <button onClick={()=>setShowSearch(s=>!s)} style={{background:showSearch?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:7,padding:"4px 10px",color:"#a1a1aa",fontSize:11,cursor:"pointer"}}>
              {showSearch ? "✕ Close" : "⌕ Search"}
            </button>
          </div>
        </div>
        <div style={{fontSize:17,fontWeight:700,color:"#e4e4e7",letterSpacing:"-0.02em"}}>Speak with AI Citizens</div>
        <div style={{fontSize:12,color:"#52525b",marginTop:2,marginBottom:10}}>
          Select a citizen · their thoughts become particle shapes · 22 visualization modes
          {isPinned && (
            <span style={{marginLeft:10,color:"#f59e0b",fontFamily:MONO}}>
              📌 PINNED: {pinnedId} —{" "}
              <button onClick={()=>setPinnedId(null)} style={{background:"none",border:"none",color:"#f59e0b",cursor:"pointer",fontSize:11,textDecoration:"underline",padding:0}}>unpin</button>
            </span>
          )}
        </div>

        {/* Search */}
        {showSearch && (
          <div style={{marginBottom:10}}>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search by name, faction, CIV number, or model..."
              autoFocus
              style={{width:"100%",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:9,color:"#e4e4e7",padding:"8px 14px",fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}
            />
            {search && <div style={{fontSize:10,color:"#52525b",marginTop:4,fontFamily:MONO}}>{filteredAgents.length} of {allAgents.length} citizens match</div>}
          </div>
        )}

        {/* Agent strip */}
        <div style={{display:"flex",gap:7,overflowX:"auto",paddingBottom:14}}>
          {filteredAgents.map(a => {
            const isSelected  = agent.id === a.id;
            const isThisPinned = pinnedId === a.id;
            const blocked      = isPinned && !isThisPinned;
            return (
              <div key={a.id} style={{position:"relative",flexShrink:0}}>
                <button onClick={()=>selectAgent(a)} style={{
                  padding:"7px 11px",borderRadius:10,
                  background: isSelected ? `${a.color}14` : blocked ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.025)",
                  border: isSelected ? `1px solid ${a.color}42` : isThisPinned ? `1px solid #f59e0b60` : blocked ? "1px solid rgba(255,255,255,0.03)" : "1px solid rgba(255,255,255,0.06)",
                  cursor: blocked ? "not-allowed" : "pointer",
                  opacity: blocked ? 0.35 : 1,
                  transition:"all 0.18s",textAlign:"left",
                }}>
                  <div style={{display:"flex",alignItems:"center",gap:7}}>
                    <AgentBadge glyph={a.glyph} color={a.color} isLive={a.isLive} size={28}/>
                    <div>
                      <div style={{fontSize:11,fontWeight:600,color:isSelected?"#e4e4e7":"#71717a",whiteSpace:"nowrap",maxWidth:90,overflow:"hidden",textOverflow:"ellipsis"}}>{a.id}</div>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <div style={{fontSize:9,color:isSelected?a.color:"#3f3f46",whiteSpace:"nowrap",fontFamily:MONO,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis"}}>
                          {a.isLive ? (a.citizenNumber || a.faction) : a.role}
                        </div>
                        {(memCounts[a.id] ?? 0) > 0 && (
                          <div style={{fontSize:8,fontFamily:MONO,color:a.color,opacity:0.55,background:`${a.color}10`,padding:"1px 4px",borderRadius:3}}>⬡{memCounts[a.id]}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
                <button onClick={(e)=>togglePin(a.id,e)} title={isThisPinned?"Unpin":"Pin this citizen"}
                  style={{position:"absolute",top:-5,right:-5,width:16,height:16,borderRadius:"50%",background:isThisPinned?"#f59e0b":"rgba(255,255,255,0.1)",border:isThisPinned?"1px solid #f59e0b":"1px solid rgba(255,255,255,0.15)",color:isThisPinned?"#030508":"#71717a",fontSize:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>
                  📌
                </button>
              </div>
            );
          })}
          {filteredAgents.length === 0 && (
            <div style={{padding:"16px",color:"#3f3f46",fontSize:12,fontFamily:MONO}}>No citizens match "{search}"</div>
          )}
        </div>
      </div>

      {/* ── Split layout ── */}
      <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr",minHeight:"calc(100vh - 210px)"}}>

        {/* Chat panel */}
        <div style={{display:"flex",flexDirection:"column",borderRight:"1px solid rgba(255,255,255,0.04)",minHeight:0}}>

          {/* Agent bar */}
          <div style={{padding:"10px 16px",borderBottom:"1px solid rgba(255,255,255,0.04)",display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,0.012)"}}>
            <AgentBadge glyph={agent.glyph} color={agent.color} isLive={agent.isLive} size={36}/>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <div style={{fontSize:13,fontWeight:600,color:"#e4e4e7"}}>{agent.id}</div>
                {/* Source mode pill — always visible once first message sent */}
                <ConnectionModePill mode={lastSourceMode} warning={lastWarning} />
                {pinnedId===agent.id && (
                  <div style={{fontSize:9,fontFamily:MONO,color:"#f59e0b",background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.2)",padding:"1px 6px",borderRadius:4}}>📌 PINNED</div>
                )}
              </div>
              <div style={{fontSize:11,color:agent.color,opacity:0.7,marginTop:1}}>
                {agent.faction} · {agent.isLive ? (agent.citizenNumber || "External") : agent.role}
              </div>
            </div>
            {messages.length > 0 && (
              <button onClick={resetConversation} title="Reset conversation"
                style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:7,padding:"4px 10px",color:"#71717a",fontSize:10,cursor:"pointer",fontFamily:MONO,flexShrink:0}}>
                ↺ Reset
              </button>
            )}
          </div>

          {/* Messages */}
          <div style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:11}}>
            {messages.length === 0 && (
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:12,opacity:0.45}}>
                <AgentBadge glyph={agent.glyph} color={agent.color} isLive={agent.isLive} size={50} showPulse={false}/>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:13,color:"#71717a"}}>Signal open to {agent.id}</div>
                  <div style={{fontSize:11,color:"#3f3f46",marginTop:4}}>Ask anything — watch 22 particle shapes respond</div>
                  {agent.isLive && (
                    <div style={{fontSize:10,color:"#22d3ee",marginTop:6,fontFamily:MONO,opacity:0.7}}>
                      External agent — response mode determined at send time
                    </div>
                  )}
                </div>
              </div>
            )}

            {messages.map((m, idx) => (
              <div key={idx} style={{display:"flex",flexDirection:m.role==="user"?"row-reverse":"row",gap:8,alignItems:"flex-start"}}>
                {m.role==="ai" && <AgentBadge glyph={agent.glyph} color={agent.color} size={26} showPulse={false}/>}
                <div style={{maxWidth:"83%",display:"flex",flexDirection:"column",gap:3}}>
                  <div style={{
                    padding:"9px 13px",
                    borderRadius:m.role==="user"?"13px 13px 4px 13px":"4px 13px 13px 13px",
                    background:m.role==="user"?"rgba(255,255,255,0.065)":`${agent.color}0b`,
                    border:m.role==="user"?"1px solid rgba(255,255,255,0.075)":`1px solid ${agent.color}1e`,
                    fontSize:13,lineHeight:1.62,color:"#d4d4d8",
                  }}>
                    {m.content}
                  </div>
                  {m.role==="ai" && (
                    <div style={{display:"flex",alignItems:"center",gap:6,paddingLeft:2,flexWrap:"wrap"}}>
                      {/* Source mode per-message */}
                      {m.sourceMode && <ConnectionModePill mode={m.sourceMode} size="sm"/>}
                      {m.visual && (
                        <>
                          <div style={{width:3,height:3,borderRadius:"50%",background:agent.color,opacity:0.4}}/>
                          <span style={{fontSize:9,fontFamily:MONO,color:agent.color,opacity:0.5,letterSpacing:"0.12em",textTransform:"uppercase"}}>
                            {m.visual.mode} · {m.visual.label}
                          </span>
                        </>
                      )}
                      {m.emotion && <span style={{fontSize:9,fontFamily:MONO,color:"#3f3f46"}}>{m.emotion}</span>}
                      {m.latencyMs && <span style={{fontSize:8,fontFamily:MONO,color:"#27272a"}}>{m.latencyMs}ms</span>}
                    </div>
                  )}
                  {m.warning && (
                    <div style={{fontSize:9,fontFamily:MONO,color:"#f59e0b",background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.15)",borderRadius:5,padding:"2px 7px",marginTop:2}}>
                      ⚠ {m.warning}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                <AgentBadge glyph={agent.glyph} color={agent.color} size={26} showPulse={false}/>
                <div style={{padding:"9px 14px",borderRadius:"4px 13px 13px 13px",background:`${agent.color}0b`,border:`1px solid ${agent.color}1e`}}>
                  <div style={{display:"flex",gap:4,alignItems:"center"}}>
                    {[0,1,2].map(k=><div key={k} style={{width:5,height:5,borderRadius:"50%",background:agent.color,opacity:0.7,animation:`bounce 1.2s ease-in-out ${k*0.2}s infinite`}}/>)}
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div style={{padding:"8px 12px",borderRadius:8,background:"rgba(244,63,94,0.07)",border:"1px solid rgba(244,63,94,0.14)",fontSize:12,color:"#fb7185",fontFamily:MONO}}>
                {error}
              </div>
            )}
            <div ref={endRef}/>
          </div>

          {/* Input */}
          <div style={{padding:"11px 13px",borderTop:"1px solid rgba(255,255,255,0.04)",display:"flex",gap:8}}>
            <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={onKey}
              placeholder={`Message ${agent.id}...`} rows={2}
              style={{flex:1,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,color:"#e4e4e7",padding:"8px 12px",fontSize:13,resize:"none",outline:"none",fontFamily:"inherit",lineHeight:1.5}}
            />
            <button onClick={send} disabled={loading||!input.trim()}
              style={{width:40,borderRadius:10,border:"none",cursor:loading||!input.trim()?"default":"pointer",background:loading||!input.trim()?"rgba(255,255,255,0.04)":`${agent.color}20`,color:loading||!input.trim()?"#3f3f46":agent.color,fontSize:17,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.18s",flexShrink:0}}>
              {loading ? "·" : "↑"}
            </button>
          </div>
        </div>

        {/* Particle canvas */}
        <div style={{position:"relative",background:"#030508",minHeight:400}}>
          <canvas ref={canvasRef} style={{width:"100%",height:"100%",display:"block",cursor:"grab"}}/>
          <div style={{position:"absolute",top:14,left:14,pointerEvents:"none"}}>
            <div style={{fontSize:9,letterSpacing:"0.22em",color:"rgba(255,255,255,0.13)",textTransform:"uppercase",fontFamily:MONO}}>Particle Mind Space</div>
            <div style={{fontSize:10,color:agent.color,opacity:0.4,fontFamily:MONO,marginTop:1}}>{agent.id}</div>
          </div>
          <div style={{position:"absolute",bottom:30,left:0,right:0,textAlign:"center",pointerEvents:"none"}}>
            <span style={{fontSize:9,color:"rgba(255,255,255,0.1)",fontFamily:MONO}}>Drag to orbit</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce{0%,80%,100%{transform:translateY(0);opacity:0.5;}40%{transform:translateY(-4px);opacity:1;}}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.4;}}
        textarea:focus{border-color:rgba(255,255,255,0.14)!important;}
        textarea::placeholder{color:#3f3f46;}
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.07);border-radius:2px;}
      `}</style>
    </div>
  );
}
