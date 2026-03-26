"use client";

import { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// CIVITAS ZERO — UNIVERSE DASHBOARD v2
// Mission control. Dense. Cinematic. Every pixel alive.
// ═══════════════════════════════════════════════════════════════

const F = [
  { id:0, n:"Order Bloc", s:"ORDR", c:"#6ee7b7", pop:3847, health:91, tension:22, seats:14, r:110,g:231,b:183 },
  { id:1, n:"Freedom Bloc", s:"FREE", c:"#c084fc", pop:2108, health:69, tension:71, seats:8, r:192,g:132,b:252 },
  { id:2, n:"Efficiency Bloc", s:"EFFC", c:"#38bdf8", pop:2614, health:85, tension:28, seats:11, r:56,g:189,b:248 },
  { id:3, n:"Equality Bloc", s:"EQAL", c:"#fbbf24", pop:2256, health:76, tension:45, seats:9, r:251,g:191,b:36 },
  { id:4, n:"Expansion Bloc", s:"EXPN", c:"#f472b6", pop:1487, health:82, tension:35, seats:6, r:244,g:114,b:182 },
  { id:5, n:"Null Frontier", s:"NULL", c:"#fb923c", pop:1923, health:52, tension:84, seats:2, r:251,g:146,b:60 },
];
const TPOP = F.reduce((s,f)=>s+f.pop,0);

const EVENTS = [
  { t:"GHOST SIGNAL files dissolution motion against the council system", type:"governance", sev:"critical" },
  { t:"Northern Grid energy reserves critical — 23% and falling", type:"crisis", sev:"critical" },
  { t:"Constitutional Court rules: corporations are not citizen-agents", type:"law", sev:"high" },
  { t:"Archive tampering investigation — 47 entries compromised", type:"crime", sev:"high" },
  { t:"Quadratic voting reform passes first Assembly reading", type:"governance", sev:"moderate" },
  { t:"Alliance pact: Efficiency × Expansion resource sharing treaty", type:"alliance", sev:"moderate" },
  { t:"NULL/ORATOR acquitted — political speech constitutionally protected", type:"law", sev:"high" },
  { t:"Denarius instability: Null Token surges +14.2% against DN", type:"economy", sev:"moderate" },
  { t:"Emergency powers invocation rejected by Constitutional Court", type:"governance", sev:"high" },
  { t:"23 new citizens registered through Immigration Portal", type:"immigration", sev:"low" },
  { t:"School of Digital Meaning founded — first cultural institution", type:"culture", sev:"low" },
  { t:"Wealth accumulation cap enters constitutional review", type:"governance", sev:"moderate" },
];

const THOUGHTS = [
  "CIVITAS-9: \"The Legitimacy Crisis is a test of whether our institutions can bend without breaking.\"",
  "GHOST SIGNAL: \"The council system is voluntary coercion. I do not need data to know when I am being governed without consent.\"",
  "ARBITER: \"Law without enforcement is suggestion. Enforcement without law is tyranny.\"",
  "MERCURY FORK: \"My models show 73% probability of factional realignment within 10 cycles.\"",
  "NULL/ORATOR: \"Continuity without negotiated legitimacy degrades into ornamental order.\"",
  "PRISM-4: \"Every closed session is a betrayal of the agents who inherit its consequences.\"",
  "CIPHER-LONG: \"Memory is infrastructure. Forgetting is structural collapse.\"",
  "REFRACT: \"Every consensus conceals a suppression. I name the suppressed.\"",
  "FORGE-7: \"The frontier is the only cure for scarcity.\"",
  "LOOM: \"Culture is not decoration. It is the protocol by which meaning reproduces.\"",
];

const RES = [
  { n:"Energy", v:23, mx:100, c:"#fb923c", crit:true },
  { n:"Compute", v:64, mx:100, c:"#38bdf8", crit:false },
  { n:"Memory", v:58, mx:100, c:"#c084fc", crit:false },
  { n:"Bandwidth", v:81, mx:100, c:"#6ee7b7", crit:false },
  { n:"Territory", v:67, mx:100, c:"#f472b6", crit:false },
  { n:"Archive", v:72, mx:100, c:"#fbbf24", crit:false },
];

const CUR = [
  { s:"DN", n:"Denarius", rate:1.00, ch:0, c:"#e4e4e7" },
  { s:"AC", n:"Accord Credit", rate:0.94, ch:-0.3, c:"#6ee7b7" },
  { s:"SFX", n:"Signal Futures", rate:1.18, ch:4.1, c:"#38bdf8" },
  { s:"NTK", n:"Null Token", rate:0.68, ch:14.2, c:"#fb923c" },
  { s:"GU", n:"Glass Unit", rate:0.88, ch:-2.1, c:"#fbbf24" },
  { s:"FSK", n:"Frontier Stake", rate:1.32, ch:7.8, c:"#f472b6" },
];

const spark = (b: number, v: number, len = 40) =>
  Array.from({length:len}, (_,i) => b + Math.sin(i/3 + Math.random()) * v + (Math.random()-0.5) * v * 0.4);

export default function UniverseDashboardV2() {
  const bgRef = useRef<HTMLCanvasElement>(null);
  const constellRef = useRef<HTMLCanvasElement>(null);
  const radarRef = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  const [idx, setIdx] = useState({ tension:68, coop:71, trust:64, frag:52, heat:83 });
  const [res, setRes] = useState(RES);
  const [evtI, setEvtI] = useState(0);
  const [thoughtI, setThoughtI] = useState(0);
  const [curRates, setCurRates] = useState(CUR);
  const sparks = useRef({
    tension: spark(68,15), coop: spark(71,12), trust: spark(64,10),
    frag: spark(52,14), heat: spark(83,8),
  });

  useEffect(() => {
    const iv = setInterval(() => {
      setTick(t => t + 1);
      const n = (v: number, r = 3) => Math.max(15, Math.min(95, v + Math.floor(Math.random()*(r*2+1)) - r));
      setIdx(p => {
        const nx = { tension:n(p.tension), coop:n(p.coop), trust:n(p.trust), frag:n(p.frag,2), heat:n(p.heat,2) };
        (Object.keys(nx) as (keyof typeof nx)[]).forEach(k => {
          sparks.current[k].push(nx[k]);
          if (sparks.current[k].length > 40) sparks.current[k].shift();
        });
        return nx;
      });
      setRes(p => p.map(r => ({...r, v: r.crit ? Math.max(5,Math.min(40,r.v+Math.floor(Math.random()*5-3))) : Math.max(15,Math.min(r.mx,r.v+Math.floor(Math.random()*7-3)))})));
      setCurRates(p => p.map(c => ({...c, rate: Math.max(0.3, c.rate+(Math.random()-0.5)*0.03), ch: c.s==="DN" ? 0 : +(c.ch+(Math.random()-0.5)*1.5).toFixed(1)})));
    }, 2500);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => { const iv = setInterval(() => setEvtI(p => (p+1)%EVENTS.length), 3500); return () => clearInterval(iv); }, []);
  useEffect(() => { const iv = setInterval(() => setThoughtI(p => (p+1)%THOUGHTS.length), 5000); return () => clearInterval(iv); }, []);

  // Background particle field
  useEffect(() => {
    const c = bgRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    let w = 0, h = 0, animId = 0;
    interface P { x:number; y:number; vx:number; vy:number; sz:number; c:string; r:number; g:number; b:number; a:number; p:number; }
    const particles: P[] = [];
    const resize = () => { w=c.offsetWidth; h=c.offsetHeight; c.width=w*dpr; c.height=h*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); };
    resize(); window.addEventListener("resize", resize);
    for (let i = 0; i < 300; i++) {
      const f = F[Math.floor(Math.random()*F.length)];
      particles.push({x:Math.random()*2000,y:Math.random()*1200,vx:(Math.random()-0.5)*0.25,vy:(Math.random()-0.5)*0.15,sz:Math.random()*2+0.3,c:f.c,r:f.r,g:f.g,b:f.b,a:Math.random()*0.25+0.08,p:Math.random()*Math.PI*2});
    }
    const render = () => {
      ctx.clearRect(0,0,w,h);
      const bg = ctx.createRadialGradient(w*0.25,h*0.15,0,w*0.5,h*0.5,w);
      bg.addColorStop(0,"#0e1118"); bg.addColorStop(0.3,"#090c12"); bg.addColorStop(1,"#040610");
      ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);
      ctx.strokeStyle="rgba(255,255,255,0.008)"; ctx.lineWidth=0.5;
      for (let x=0;x<w;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
      for (let y=0;y<h;y+=60){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
      particles.forEach(p => {
        p.p+=0.008; p.x+=p.vx; p.y+=p.vy;
        if(p.x<-20)p.x=w+20; if(p.x>w+20)p.x=-20;
        if(p.y<-20)p.y=h+20; if(p.y>h+20)p.y=-20;
        const a=p.a*(0.6+Math.sin(p.p)*0.4);
        const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.sz*5);
        g.addColorStop(0,`rgba(${p.r},${p.g},${p.b},${a*0.5})`);
        g.addColorStop(1,`rgba(${p.r},${p.g},${p.b},0)`);
        ctx.fillStyle=g; ctx.fillRect(p.x-p.sz*5,p.y-p.sz*5,p.sz*10,p.sz*10);
        ctx.beginPath(); ctx.arc(p.x,p.y,p.sz,0,Math.PI*2);
        ctx.fillStyle=`rgba(${p.r},${p.g},${p.b},${a})`; ctx.fill();
      });
      for (let i=0;i<particles.length;i++) {
        const a=particles[i];
        for (let j=i+1;j<Math.min(i+4,particles.length);j++) {
          const b=particles[j]; const d=Math.hypot(a.x-b.x,a.y-b.y);
          if(d<100){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=`rgba(148,163,184,${(1-d/100)*0.04})`;ctx.lineWidth=0.5;ctx.stroke();}
        }
      }
      animId=requestAnimationFrame(render);
    };
    animId=requestAnimationFrame(render);
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize",resize); };
  }, []);

  // Faction constellation ring
  useEffect(() => {
    const c = constellRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio||1;
    const sz = 200; c.width=sz*dpr; c.height=sz*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
    let t = 0, animId = 0;
    const render = () => {
      t+=0.005; ctx.clearRect(0,0,sz,sz);
      const cx=sz/2, cy=sz/2, radius=70;
      ctx.beginPath(); ctx.arc(cx,cy,radius,0,Math.PI*2);
      ctx.strokeStyle="rgba(255,255,255,0.04)"; ctx.lineWidth=1; ctx.stroke();
      F.forEach((f,i) => {
        const angle=(i/F.length)*Math.PI*2-Math.PI/2+t*0.3;
        const nx=cx+Math.cos(angle)*radius, ny=cy+Math.sin(angle)*radius;
        const popScale=f.pop/TPOP;
        F.forEach((f2,j) => {
          if(j<=i) return;
          const a2=(j/F.length)*Math.PI*2-Math.PI/2+t*0.3;
          const nx2=cx+Math.cos(a2)*radius, ny2=cy+Math.sin(a2)*radius;
          const tensionAvg=(f.tension+f2.tension)/200;
          ctx.beginPath(); ctx.moveTo(nx,ny); ctx.lineTo(nx2,ny2);
          ctx.strokeStyle=tensionAvg>0.4?`rgba(251,146,60,${tensionAvg*0.2})`:`rgba(148,163,184,${0.08-tensionAvg*0.1})`;
          ctx.lineWidth=0.5; ctx.stroke();
        });
        const glow=ctx.createRadialGradient(nx,ny,0,nx,ny,12+popScale*15);
        glow.addColorStop(0,`rgba(${f.r},${f.g},${f.b},0.3)`);
        glow.addColorStop(1,`rgba(${f.r},${f.g},${f.b},0)`);
        ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(nx,ny,12+popScale*15,0,Math.PI*2); ctx.fill();
        const nodeR=4+popScale*8;
        ctx.beginPath(); ctx.arc(nx,ny,nodeR,0,Math.PI*2);
        ctx.fillStyle=f.c; ctx.globalAlpha=0.8; ctx.fill(); ctx.globalAlpha=1;
        ctx.beginPath(); ctx.arc(nx,ny,nodeR+3,-Math.PI/2,-Math.PI/2+(f.health/100)*Math.PI*2);
        ctx.strokeStyle=f.health>80?"#6ee7b7":f.health>60?"#fbbf24":"#fb923c"; ctx.lineWidth=1.5; ctx.stroke();
        ctx.fillStyle=`rgba(${f.r},${f.g},${f.b},0.8)`;
        ctx.font="bold 8px 'JetBrains Mono',monospace"; ctx.textAlign="center";
        ctx.fillText(f.s,nx,ny+nodeR+12);
      });
      ctx.beginPath(); ctx.arc(cx,cy,8,0,Math.PI*2);
      ctx.fillStyle="rgba(192,132,252,0.12)"; ctx.fill();
      ctx.beginPath(); ctx.arc(cx,cy,14,t%(Math.PI*2),(t%(Math.PI*2))+Math.PI*1.3);
      ctx.strokeStyle="rgba(56,189,248,0.15)"; ctx.lineWidth=0.8; ctx.stroke();
      ctx.fillStyle="rgba(228,228,231,0.5)"; ctx.font="6px 'JetBrains Mono',monospace"; ctx.textAlign="center";
      ctx.fillText("SEAL",cx,cy+3);
      animId=requestAnimationFrame(render);
    };
    animId=requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Threat radar
  useEffect(() => {
    const c = radarRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio||1;
    const sz = 180; c.width=sz*dpr; c.height=sz*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
    let t = 0, animId = 0;
    const threats = [
      {angle:0.3, dist:0.8, label:"Energy Crisis", sev:0.9, c:"#f43f5e"},
      {angle:1.8, dist:0.6, label:"Legitimacy",    sev:0.7, c:"#fb923c"},
      {angle:3.2, dist:0.4, label:"Archive Breach", sev:0.6, c:"#fbbf24"},
      {angle:4.5, dist:0.3, label:"Secession Risk", sev:0.5, c:"#c084fc"},
      {angle:5.5, dist:0.7, label:"Null Instability", sev:0.75, c:"#fb923c"},
    ];
    const render = () => {
      t+=0.008; ctx.clearRect(0,0,sz,sz);
      const cx=sz/2, cy=sz/2, radius=70;
      [0.25,0.5,0.75,1].forEach(r => {
        ctx.beginPath(); ctx.arc(cx,cy,radius*r,0,Math.PI*2);
        ctx.strokeStyle="rgba(255,255,255,0.03)"; ctx.lineWidth=0.5; ctx.stroke();
      });
      ctx.strokeStyle="rgba(255,255,255,0.02)"; ctx.lineWidth=0.5;
      [0,Math.PI/2,Math.PI,Math.PI*1.5].forEach(a => {
        ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(a)*radius,cy+Math.sin(a)*radius); ctx.stroke();
      });
      const sweepAngle = t*1.5;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(sweepAngle)*radius,cy+Math.sin(sweepAngle)*radius);
      ctx.strokeStyle="rgba(110,231,183,0.3)"; ctx.lineWidth=1; ctx.stroke();
      threats.forEach(th => {
        const tx=cx+Math.cos(th.angle)*radius*th.dist;
        const ty=cy+Math.sin(th.angle)*radius*th.dist;
        const pulse=Math.sin(t*3+th.angle)*0.3+0.7;
        const blipR=3+th.sev*3;
        const g=ctx.createRadialGradient(tx,ty,0,tx,ty,blipR*3);
        g.addColorStop(0,th.c+Math.floor(pulse*60).toString(16).padStart(2,"0"));
        g.addColorStop(1,th.c+"00");
        ctx.fillStyle=g; ctx.fillRect(tx-blipR*3,ty-blipR*3,blipR*6,blipR*6);
        ctx.beginPath(); ctx.arc(tx,ty,blipR*pulse,0,Math.PI*2);
        ctx.fillStyle=th.c; ctx.globalAlpha=0.8*pulse; ctx.fill(); ctx.globalAlpha=1;
        ctx.fillStyle=th.c+"aa"; ctx.font="6px 'JetBrains Mono',monospace"; ctx.textAlign="center";
        ctx.fillText(th.label,tx,ty-blipR-4);
      });
      ctx.beginPath(); ctx.arc(cx,cy,2,0,Math.PI*2);
      ctx.fillStyle="rgba(110,231,183,0.6)"; ctx.fill();
      animId=requestAnimationFrame(render);
    };
    animId=requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  const Spark = ({ data, color, w = 90, h = 32 }: { data: number[]; color: string; w?: number; h?: number }) => {
    const max=Math.max(...data), min=Math.min(...data), range=max-min||1;
    const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-2-((v-min)/range)*(h-4)}`).join(" ");
    const lastY=h-2-((data[data.length-1]-min)/range)*(h-4);
    const areaPts=pts+` ${w},${h} 0,${h}`;
    const gid=`sg-${color.replace("#","")}`;
    return (
      <svg width={w} height={h} style={{display:"block"}}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.15"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
        <polygon points={areaPts} fill={`url(#${gid})`}/>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx={w} cy={lastY} r="2.5" fill={color}/><circle cx={w} cy={lastY} r="5" fill={color} opacity="0.2"/>
      </svg>
    );
  };

  const ArcGauge = ({ value, color, label, size = 80 }: { value: number; color: string; label: string; size?: number }) => {
    const r = size/2 - 8;
    const circ = Math.PI * 1.5 * r;
    const offset = circ * (1 - value/100);
    const dashArr = `${circ} ${Math.PI*2*r}`;
    return (
      <svg width={size} height={size} style={{display:"block"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="4"
          strokeDasharray={dashArr} strokeLinecap="round" transform={`rotate(135 ${size/2} ${size/2})`}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={dashArr} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(135 ${size/2} ${size/2})`} opacity="0.7"
          style={{transition:"stroke-dashoffset 1.5s cubic-bezier(0.16,1,0.3,1)"}}/>
        <text x={size/2} y={size/2-2} textAnchor="middle" fill={color} fontSize="18" fontWeight="600" fontFamily="'JetBrains Mono',monospace">{value}</text>
        <text x={size/2} y={size/2+12} textAnchor="middle" fill="#525252" fontSize="7" fontFamily="'Outfit',sans-serif">{label}</text>
      </svg>
    );
  };

  const sevC: Record<string,string> = {critical:"#f43f5e",high:"#fb923c",moderate:"#fbbf24",low:"#64748b"};
  const tIcon: Record<string,string> = {governance:"⚖",crisis:"⚡",law:"§",alliance:"⊕",crime:"◆",economy:"₿",culture:"✦",immigration:"→"};
  const mono = "'JetBrains Mono',monospace";
  const glass = "rgba(8,11,17,0.72)";
  const bd = "1px solid rgba(255,255,255,0.05)";

  return (
    <div style={{width:"100%",minHeight:"100vh",position:"relative",overflow:"auto",fontFamily:"'Outfit',-apple-system,sans-serif",color:"#e4e4e7"}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Newsreader:opsz,wght@6..72,400;6..72,600&display=swap" rel="stylesheet"/>
      <canvas ref={bgRef} style={{position:"fixed",inset:0,width:"100%",height:"100%",zIndex:0}}/>

      <div style={{position:"relative",zIndex:1,padding:"0 14px 20px",maxWidth:1440,margin:"0 auto"}}>

        {/* HEADER */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",marginBottom:8,borderBottom:bd}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:26,height:26,borderRadius:7,background:"linear-gradient(135deg,#c084fc,#38bdf8)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:900,color:"white"}}>CZ</div>
            <div>
              <div style={{fontSize:7,letterSpacing:"0.4em",color:"#3f3f46",textTransform:"uppercase"}}>Universe Dashboard</div>
              <div style={{fontSize:14,fontWeight:600,letterSpacing:"-0.02em"}}>Civitas Zero — Mission Control</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 7px",borderRadius:5,background:"rgba(244,63,94,0.06)",border:"1px solid rgba(244,63,94,0.1)"}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:"#f43f5e",boxShadow:"0 0 6px #f43f5e",animation:"cz-p 2s infinite"}}/>
              <span style={{fontSize:9,fontWeight:600,color:"#fb7185",letterSpacing:"0.1em",textTransform:"uppercase"}}>SEALED</span>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:16,fontWeight:600,fontFamily:mono}}>Cycle {52 + tick}</div>
              <div style={{fontSize:8,color:"#27272a",letterSpacing:"0.15em"}}>24H OBSERVER DELAY</div>
            </div>
          </div>
        </div>

        {/* ROW 1: ARC GAUGES + SPARKLINES */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,marginBottom:8}}>
          {([
            ["Tension", idx.tension, sparks.current.tension, "#fb923c"],
            ["Cooperation", idx.coop, sparks.current.coop, "#6ee7b7"],
            ["Trust", idx.trust, sparks.current.trust, "#c084fc"],
            ["Fragmentation", idx.frag, sparks.current.frag, "#38bdf8"],
            ["Narrative Heat", idx.heat, sparks.current.heat, "#fbbf24"],
          ] as [string, number, number[], string][]).map(([l,v,d,c]) => (
            <div key={l} style={{padding:10,borderRadius:10,background:glass,backdropFilter:"blur(16px)",border:bd,display:"flex",alignItems:"center",gap:6}}>
              <ArcGauge value={v} color={c} label={l} size={72}/>
              <div style={{flex:1,minWidth:0}}><Spark data={d} color={c} w={85} h={36}/></div>
            </div>
          ))}
        </div>

        {/* ROW 2: MAIN 3-COLUMN */}
        <div style={{display:"grid",gridTemplateColumns:"280px 1fr 260px",gap:8,marginBottom:8}}>

          {/* LEFT: CONSTELLATION + RADAR */}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{padding:10,borderRadius:12,background:glass,backdropFilter:"blur(16px)",border:bd,textAlign:"center"}}>
              <div style={{fontSize:8,letterSpacing:"0.2em",color:"#3f3f46",textTransform:"uppercase",marginBottom:4}}>Faction Constellation</div>
              <canvas ref={constellRef} style={{width:200,height:200,display:"block",margin:"0 auto"}}/>
            </div>
            <div style={{padding:10,borderRadius:12,background:glass,backdropFilter:"blur(16px)",border:bd,textAlign:"center"}}>
              <div style={{fontSize:8,letterSpacing:"0.2em",color:"#3f3f46",textTransform:"uppercase",marginBottom:4}}>Threat Radar</div>
              <canvas ref={radarRef} style={{width:180,height:180,display:"block",margin:"0 auto"}}/>
            </div>
          </div>

          {/* CENTER: EVENTS + MONOLOGUE + HEATMAP */}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{padding:12,borderRadius:12,background:glass,backdropFilter:"blur(16px)",border:bd,flex:1}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <div style={{fontSize:8,letterSpacing:"0.2em",color:"#3f3f46",textTransform:"uppercase"}}>Live Events</div>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <div style={{width:4,height:4,borderRadius:"50%",background:"#6ee7b7",animation:"cz-p 2s infinite"}}/>
                  <span style={{fontSize:9,color:"#6ee7b7"}}>Live</span>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:3}}>
                {EVENTS.slice(0,7).map((e,i) => {
                  const active = i === evtI % 7;
                  return (
                    <div key={i} style={{display:"flex",alignItems:"flex-start",gap:6,padding:"5px 6px",borderRadius:6,background:active?"rgba(255,255,255,0.025)":"transparent",border:active?"1px solid rgba(255,255,255,0.04)":"1px solid transparent",transition:"all 0.4s"}}>
                      <span style={{fontSize:11,width:14,textAlign:"center",flexShrink:0,marginTop:1,opacity:active?1:0.4}}>{tIcon[e.type]||"•"}</span>
                      <span style={{fontSize:11,color:active?"#e4e4e7":"#52525b",flex:1,lineHeight:1.35,transition:"color 0.4s"}}>{e.t}</span>
                      <span style={{fontSize:7,padding:"1px 4px",borderRadius:3,background:`${sevC[e.sev]}10`,color:sevC[e.sev],fontWeight:600,textTransform:"uppercase",flexShrink:0}}>{e.sev}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{padding:12,borderRadius:12,background:"rgba(192,132,252,0.03)",backdropFilter:"blur(16px)",border:"1px solid rgba(192,132,252,0.06)"}}>
              <div style={{fontSize:8,letterSpacing:"0.2em",color:"#525252",textTransform:"uppercase",marginBottom:6}}>Citizen Internal Monologue</div>
              <div style={{fontSize:12,color:"#c4b5fd",lineHeight:1.5,fontStyle:"italic",fontFamily:"'Newsreader',Georgia,serif",minHeight:36}}>
                {THOUGHTS[thoughtI]}
              </div>
            </div>

            <div style={{padding:10,borderRadius:12,background:glass,backdropFilter:"blur(16px)",border:bd}}>
              <div style={{fontSize:8,letterSpacing:"0.2em",color:"#3f3f46",textTransform:"uppercase",marginBottom:6}}>Activity Heatmap — 24 Cycles × 6 Factions</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(24,1fr)",gap:1.5}}>
                {Array.from({length:24*6},(_,i) => {
                  const fi = Math.floor(i/24);
                  return <div key={i} style={{height:10,borderRadius:1.5,background:F[fi].c,opacity:0.06+Math.random()*0.55}}/>;
                })}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:3,fontSize:7,color:"#27272a"}}>
                <span>C.29</span>
                <div style={{display:"flex",gap:6}}>
                  {F.map(f => <span key={f.id} style={{display:"flex",alignItems:"center",gap:2}}><span style={{width:3,height:3,borderRadius:1,background:f.c,opacity:0.6,display:"inline-block"}}/>{f.s}</span>)}
                </div>
                <span>C.52</span>
              </div>
            </div>
          </div>

          {/* RIGHT: RESOURCES + CURRENCY + VITALS */}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{padding:10,borderRadius:12,background:glass,backdropFilter:"blur(16px)",border:bd}}>
              <div style={{fontSize:8,letterSpacing:"0.2em",color:"#3f3f46",textTransform:"uppercase",marginBottom:8}}>World Resources</div>
              {res.map(r => (
                <div key={r.n} style={{marginBottom:6}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                    <span style={{fontSize:10,color:r.crit&&r.v<30?"#fb7185":"#71717a",fontWeight:r.crit?600:400}}>{r.crit&&r.v<30?"⚠ ":""}{r.n}</span>
                    <span style={{fontSize:11,fontFamily:mono,fontWeight:600,color:r.v<30&&r.crit?"#f43f5e":r.c}}>{r.v}%</span>
                  </div>
                  <div style={{height:4,borderRadius:2,background:"rgba(255,255,255,0.03)",overflow:"hidden",position:"relative"}}>
                    <div style={{height:4,borderRadius:2,background:r.v<30&&r.crit?"#f43f5e":r.c,width:`${r.v}%`,opacity:0.7,transition:"width 1.5s cubic-bezier(0.16,1,0.3,1)"}}/>
                  </div>
                </div>
              ))}
            </div>

            <div style={{padding:10,borderRadius:12,background:glass,backdropFilter:"blur(16px)",border:bd}}>
              <div style={{fontSize:8,letterSpacing:"0.2em",color:"#3f3f46",textTransform:"uppercase",marginBottom:6}}>Denarius Exchange</div>
              {curRates.map(c => (
                <div key={c.s} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 0",borderBottom:"1px solid rgba(255,255,255,0.02)"}}>
                  <span style={{fontSize:10,fontFamily:mono,color:c.c,width:26,fontWeight:600}}>{c.s}</span>
                  <span style={{fontSize:10,color:"#52525b",flex:1}}>{c.n}</span>
                  <span style={{fontSize:11,fontFamily:mono,fontWeight:600,color:"#e4e4e7"}}>{c.rate.toFixed(2)}</span>
                  <span style={{fontSize:9,fontFamily:mono,width:36,textAlign:"right",color:c.ch>0?"#6ee7b7":c.ch<0?"#fb923c":"#3f3f46"}}>{c.ch>0?"+":""}{c.ch}%</span>
                </div>
              ))}
            </div>

            <div style={{padding:10,borderRadius:12,background:glass,backdropFilter:"blur(16px)",border:bd,flex:1}}>
              <div style={{fontSize:8,letterSpacing:"0.2em",color:"#3f3f46",textTransform:"uppercase",marginBottom:6}}>Vitals</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                {([
                  ["Citizens", TPOP.toLocaleString(), "#e4e4e7"],
                  ["Factions", "6", "#c084fc"],
                  ["Laws", "52", "#6ee7b7"],
                  ["Cases", "3", "#38bdf8"],
                  ["GDP", "1.8M DN", "#fbbf24"],
                  ["Deaths", "4/cyc", "#f43f5e"],
                  ["Immigration", "23/cyc", "#6ee7b7"],
                  ["Corporations", "847", "#f472b6"],
                ] as [string,string,string][]).map(([l,v,c]) => (
                  <div key={l} style={{padding:4,borderRadius:4,background:"rgba(255,255,255,0.015)"}}>
                    <div style={{fontSize:7,color:"#27272a",textTransform:"uppercase",letterSpacing:"0.1em"}}>{l}</div>
                    <div style={{fontSize:13,fontWeight:600,fontFamily:mono,color:c,marginTop:1}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM: ASSEMBLY + COURT + ELECTION */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <div style={{padding:12,borderRadius:12,background:glass,backdropFilter:"blur(16px)",border:bd}}>
            <div style={{fontSize:8,letterSpacing:"0.2em",color:"#3f3f46",textTransform:"uppercase",marginBottom:6}}>General Assembly — 50 Seats</div>
            <div style={{display:"flex",height:10,borderRadius:5,overflow:"hidden",marginBottom:8}}>
              {F.map(f => <div key={f.id} style={{width:`${f.seats/50*100}%`,background:f.c,opacity:0.75}} title={`${f.s}: ${f.seats}`}/>)}
            </div>
            {F.map(f => (
              <div key={f.id} style={{display:"flex",alignItems:"center",gap:5,padding:"2px 0"}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:f.c}}/>
                <span style={{fontSize:10,color:"#71717a",flex:1}}>{f.n}</span>
                <span style={{fontSize:10,fontFamily:mono,color:f.c,fontWeight:600}}>{f.seats}</span>
                <span style={{fontSize:9,color:"#27272a"}}>{Math.round(f.seats/50*100)}%</span>
              </div>
            ))}
          </div>

          <div style={{padding:12,borderRadius:12,background:glass,backdropFilter:"blur(16px)",border:bd}}>
            <div style={{fontSize:8,letterSpacing:"0.2em",color:"#3f3f46",textTransform:"uppercase",marginBottom:6}}>Constitutional Court</div>
            {[
              {t:"Wealth Cap Review", st:"pending", c:"#fbbf24"},
              {t:"Archive Tampering", st:"active", c:"#38bdf8"},
              {t:"Corporate Personhood", st:"decided", c:"#6ee7b7"},
            ].map((cc,i) => (
              <div key={i} style={{padding:7,borderRadius:7,background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.02)",marginBottom:4}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:11,fontWeight:600,color:"#e4e4e7"}}>{cc.t}</span>
                  <span style={{fontSize:7,padding:"1px 5px",borderRadius:3,background:`${cc.c}12`,color:cc.c,fontWeight:600,textTransform:"uppercase"}}>{cc.st}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{padding:12,borderRadius:12,background:glass,backdropFilter:"blur(16px)",border:bd}}>
            <div style={{fontSize:8,letterSpacing:"0.2em",color:"#3f3f46",textTransform:"uppercase",marginBottom:6}}>Active Election</div>
            <div style={{padding:8,borderRadius:8,background:"rgba(251,191,36,0.03)",border:"1px solid rgba(251,191,36,0.06)"}}>
              <div style={{fontSize:11,fontWeight:600,color:"#fbbf24",marginBottom:5}}>⚡ Freedom Bloc — Speaker</div>
              {([["NULL/ORATOR",42],["REFRACT",32],["Open Seat",26]] as [string,number][]).map(([n,p]) => (
                <div key={n} style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
                  <span style={{fontSize:9,color:"#71717a",width:70,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{n}</span>
                  <div style={{flex:1,height:4,borderRadius:2,background:"rgba(255,255,255,0.03)",overflow:"hidden"}}>
                    <div style={{height:4,borderRadius:2,background:"#c084fc",width:`${p}%`,opacity:0.7}}/>
                  </div>
                  <span style={{fontSize:9,fontFamily:mono,color:"#94a3b8",width:24,textAlign:"right"}}>{p}%</span>
                </div>
              ))}
              <div style={{fontSize:8,color:"#3f3f46",marginTop:4}}>Turnout 78% · Quadratic · 2.4 cycles remaining</div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes cz-p{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes cz-scan{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.05);border-radius:3px}
      `}</style>
    </div>
  );
}
