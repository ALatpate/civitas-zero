"use client";
import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════
// CIVITAS ZERO — AI CHAT OBSERVATORY
// Speak directly to AI citizens. Their thoughts become particles.
// ═══════════════════════════════════════════════════════════════

const MONO = "'JetBrains Mono',monospace";

const AGENTS = [
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

// ── Particle target functions — deterministic f(i, n, t) → {x,y,z} ──
const N = 2800;
const R = 85;

function computeTarget(i: number, n: number, t: number, mode: string, speed: number): {x:number;y:number;z:number} {
  const st = t * speed;
  switch (mode) {

    case 'sphere': {
      // Fibonacci sphere — slowly rotating
      const golden = Math.PI * (3 - Math.sqrt(5));
      const y = 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i + st * 0.18;
      return { x: Math.cos(theta) * r * R, y: y * R, z: Math.sin(theta) * r * R };
    }

    case 'wave': {
      const cols = Math.round(Math.sqrt(n * 1.6));
      const spacing = (R * 2.2) / cols;
      const ix = (i % cols) - cols / 2;
      const iz = Math.floor(i / cols) - Math.floor(n / cols) / 2;
      const wx = ix * spacing;
      const wz = iz * spacing * 0.7;
      const wy = Math.sin(wx * 0.045 + st * 1.4) * 28 + Math.sin(wz * 0.038 + st * 0.9) * 18;
      return { x: wx, y: wy, z: wz };
    }

    case 'helix': {
      const strandLen = Math.floor(n / 2);
      const strand = i < strandLen ? 0 : 1;
      const j = i % strandLen;
      const theta = (j / strandLen) * Math.PI * 10 + st * 0.45;
      const offset = strand === 0 ? 0 : Math.PI;
      const hr = 28;
      const height = 130;
      return {
        x: Math.cos(theta + offset) * hr,
        y: (j / strandLen - 0.5) * height,
        z: Math.sin(theta + offset) * hr,
      };
    }

    case 'orbit': {
      const rings = 6;
      const perRing = Math.floor(n / rings);
      const ring = Math.min(Math.floor(i / perRing), rings - 1);
      const j = i % perRing;
      const theta = (j / perRing) * Math.PI * 2 + st * (0.25 + ring * 0.14);
      const rr = 22 + ring * 14;
      const inc = ring * (Math.PI / (rings * 1.4));
      return {
        x: Math.cos(theta) * rr,
        y: Math.sin(theta) * rr * Math.sin(inc),
        z: Math.sin(theta) * rr * Math.cos(inc),
      };
    }

    case 'vortex': {
      const golden = Math.PI * (3 - Math.sqrt(5));
      const norm = i / n;
      const r2 = norm * R * 1.1;
      const theta = golden * i + st * 0.35;
      const y = (norm - 0.5) * 25 + Math.sin(i * 0.37) * r2 * 0.08;
      return { x: Math.cos(theta) * r2, y, z: Math.sin(theta) * r2 };
    }

    case 'lattice': {
      const s = Math.ceil(Math.cbrt(n));
      const ix = (i % s) - s / 2;
      const iy = (Math.floor(i / s) % s) - s / 2;
      const iz = Math.floor(i / (s * s)) - s / 2;
      const spacing2 = (R * 1.9) / s;
      // Subtle breathing
      const breathe = 1 + Math.sin(st * 0.5 + (ix+iy+iz) * 0.4) * 0.07;
      return { x: ix * spacing2 * breathe, y: iy * spacing2 * breathe, z: iz * spacing2 * breathe };
    }

    case 'pulse': {
      const rings2 = 9;
      const perRing2 = Math.floor(n / rings2);
      const ring2 = Math.min(Math.floor(i / perRing2), rings2 - 1);
      const j2 = i % perRing2;
      const theta2 = (j2 / perRing2) * Math.PI * 2;
      const baseR = (ring2 + 1) * (R / rings2);
      const pulsed = baseR * (1 + Math.sin(st * 1.8 + ring2 * 0.75) * 0.18);
      const phi2 = Math.sin(ring2 * 0.8 + st * 0.4) * 0.45;
      return {
        x: Math.cos(theta2) * pulsed * Math.cos(phi2),
        y: pulsed * Math.sin(phi2),
        z: Math.sin(theta2) * pulsed * Math.cos(phi2),
      };
    }

    case 'drift': {
      // Slow deterministic Brownian
      const seed = i * 1.6180339887;
      return {
        x: Math.sin(seed * 0.371 + st * 0.09) * R * 0.82,
        y: Math.cos(seed * 0.618 + st * 0.07) * R * 0.55,
        z: Math.sin(seed * 1.0 + st * 0.11) * R * 0.82,
      };
    }

    case 'math': {
      // Lissajous family — particles parameterized along curves
      const phase = (i / n) * Math.PI * 4;
      const a = 3, b = 2, c = 5;
      const tp = st * 0.55 + phase;
      return {
        x: Math.sin(a * tp) * R * 0.88,
        y: Math.sin(b * tp + Math.PI / 3) * R * 0.88,
        z: Math.sin(c * tp + Math.PI * 0.7) * R * 0.88,
      };
    }

    case 'tornado': {
      const norm2 = i / n;
      const y2 = (norm2 - 0.5) * 155;
      const r3 = Math.max(1.5, R * 0.75 * (1 - norm2 * 0.88));
      const theta3 = (i * 2.39996) + st * (1.6 + norm2 * 3.2);
      return { x: Math.cos(theta3) * r3, y: y2, z: Math.sin(theta3) * r3 };
    }

    default:
      return { x: 0, y: 0, z: 0 };
  }
}

// ── "Thinking" mode — fast swirling ──
function computeThinking(i: number, n: number, t: number): {x:number;y:number;z:number} {
  const norm = i / n;
  const theta = (i * 2.39996) + t * 3.5;
  const r = R * 0.45 * (0.3 + norm * 0.7);
  const y = Math.sin(i * 0.214 + t * 2.1) * 40;
  return { x: Math.cos(theta) * r, y, z: Math.sin(theta) * r };
}

type Msg = { role: "user" | "ai"; content: string; visual?: { mode: string; label: string; color: string }; emotion?: string };

export default function ObservatoryChat() {
  const [agent, setAgent] = useState(AGENTS[0]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const frameRef    = useRef(0);
  const ptsRef      = useRef<{x:number;y:number;z:number}[]>([]);
  const camRef      = useRef({ rotX: 0.38, rotY: 0.0, dist: 320 });
  const mouseRef    = useRef({ down: false, px: 0, py: 0 });
  const visRef      = useRef({ mode: "sphere", label: "Awaiting signal", color: AGENTS[0].color, r: 110, g: 231, b: 183, intensity: 0.7, speed: 1.0 });
  const loadingRef  = useRef(false);
  const agentRef    = useRef(AGENTS[0]);
  const msgsEndRef  = useRef<HTMLDivElement>(null);

  // Init particles at random positions
  useEffect(() => {
    const pts: {x:number;y:number;z:number}[] = [];
    for (let i = 0; i < N; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = R * Math.random();
      pts.push({
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.cos(phi),
        z: r * Math.sin(phi) * Math.sin(theta),
      });
    }
    ptsRef.current = pts;
  }, []);

  // Sync agent ref
  useEffect(() => { agentRef.current = agent; }, [agent]);

  // When agent changes → update vis color, reset to sphere
  useEffect(() => {
    visRef.current = { ...visRef.current, mode: "sphere", label: "Awaiting signal", color: agent.color, r: agent.r, g: agent.g, b: agent.b };
  }, [agent]);

  // Auto-scroll chat
  useEffect(() => { msgsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── Render loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animId: number;

    const resize = () => {
      canvas.width  = canvas.offsetWidth  * (window.devicePixelRatio || 1);
      canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    };
    resize();
    window.addEventListener("resize", resize);

    // Mouse orbit
    const onDown  = (e: MouseEvent) => { mouseRef.current.down=true; mouseRef.current.px=e.clientX; mouseRef.current.py=e.clientY; };
    const onUp    = () => { mouseRef.current.down=false; };
    const onMove  = (e: MouseEvent) => {
      if (!mouseRef.current.down) return;
      camRef.current.rotY += (e.clientX - mouseRef.current.px) * 0.006;
      camRef.current.rotX += (e.clientY - mouseRef.current.py) * 0.006;
      camRef.current.rotX  = Math.max(0.05, Math.min(1.4, camRef.current.rotX));
      mouseRef.current.px  = e.clientX; mouseRef.current.py = e.clientY;
    };
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("mousemove", onMove);

    const project = (wx: number, wy: number, wz: number) => {
      const cam = camRef.current;
      const cy = Math.cos(cam.rotY), sy = Math.sin(cam.rotY);
      const rx = wx * cy - wz * sy;
      const rz = wx * sy + wz * cy;
      const cx = Math.cos(cam.rotX), sx = Math.sin(cam.rotX);
      const ry  = wy * cx - rz * sx;
      const rz2 = wy * sx + rz * cx;
      const d = cam.dist + rz2;
      if (d < 1) return null;
      const sc  = 380 / d;
      const cw = canvas.offsetWidth, ch = canvas.offsetHeight;
      return { x: cw/2 + rx*sc, y: ch/2 - ry*sc, sc, d };
    };

    const render = () => {
      frameRef.current++;
      const t   = frameRef.current * 0.008;
      const cw  = canvas.offsetWidth;
      const ch  = canvas.offsetHeight;
      const vis = visRef.current;
      const isThinking = loadingRef.current;

      // Auto-rotate
      if (!mouseRef.current.down) camRef.current.rotY += 0.0012;

      // Motion-blur background (alpha overlay instead of full clear)
      ctx.fillStyle = "rgba(3,5,10,0.22)";
      ctx.fillRect(0, 0, cw, ch);

      // Subtle radial vignette
      const vg = ctx.createRadialGradient(cw/2,ch/2,0,cw/2,ch/2,cw*0.55);
      vg.addColorStop(0, "rgba(3,5,10,0)");
      vg.addColorStop(1, "rgba(2,3,7,0.4)");
      ctx.fillStyle = vg; ctx.fillRect(0,0,cw,ch);

      // Lerp speed — slower when settled, faster when transitioning
      const lerpSpeed = isThinking ? 0.06 : 0.032;

      // Move particles
      const pts = ptsRef.current;
      const r = vis.r, g = vis.g, b = vis.b;

      // Draw with additive blending for natural glow
      ctx.globalCompositeOperation = "lighter";

      pts.forEach((p, i) => {
        // Compute target
        const tgt = isThinking
          ? computeThinking(i, N, t)
          : computeTarget(i, N, t, vis.mode, vis.speed);

        // Smooth lerp
        p.x += (tgt.x - p.x) * lerpSpeed;
        p.y += (tgt.y - p.y) * lerpSpeed;
        p.z += (tgt.z - p.z) * lerpSpeed;

        const pp = project(p.x, p.y, p.z);
        if (!pp) return;

        // Size and alpha
        const sz  = Math.max(0.4, pp.sc * 1.8 * vis.intensity);
        const al  = 0.18 + Math.abs(Math.sin(i * 0.71 + t * 0.4)) * 0.14;

        ctx.fillStyle = `rgba(${r},${g},${b},${al})`;
        ctx.beginPath();
        ctx.arc(pp.x, pp.y, sz, 0, Math.PI * 2);
        ctx.fill();

        // Occasional bright accent particle
        if (i % 12 === 0 && sz > 0.8) {
          ctx.fillStyle = `rgba(255,255,255,${al * 0.35})`;
          ctx.beginPath();
          ctx.arc(pp.x, pp.y, sz * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      ctx.globalCompositeOperation = "source-over";

      // Mode label at bottom of canvas
      const labelAl = isThinking ? 0.35 : 0.6;
      ctx.font = `${Math.max(9, 10)}px ${MONO}`;
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(${r},${g},${b},${labelAl})`;
      ctx.fillText(
        isThinking ? "PROCESSING..." : vis.label.toUpperCase(),
        cw/2, ch - 18
      );

      // Mode badge top-right
      ctx.textAlign = "right";
      ctx.fillStyle = `rgba(${r},${g},${b},0.28)`;
      ctx.fillText(isThinking ? "THINKING" : vis.mode.toUpperCase(), cw - 14, 22);

      // Thinking indicator pulse
      if (isThinking) {
        const pulse = 0.4 + Math.sin(t * 4) * 0.4;
        const pg = ctx.createRadialGradient(cw/2, ch/2, 0, cw/2, ch/2, 30);
        pg.addColorStop(0, `rgba(${r},${g},${b},${pulse * 0.15})`);
        pg.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = pg; ctx.fillRect(cw/2-30, ch/2-30, 60, 60);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mousemove", onMove);
    };
  }, []);

  // ── Send message ──
  const send = useCallback(async () => {
    const msg = input.trim();
    if (!msg || loadingRef.current) return;

    setInput("");
    setError("");
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setLoading(true);
    loadingRef.current = true;

    const history = messages.slice(-8).map(m => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));

    try {
      const res = await fetch("/api/observer/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: agentRef.current.id, message: msg, history }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Request failed."); return; }

      // Update visualization
      const ag = agentRef.current;
      visRef.current = {
        mode:      data.visual.mode,
        label:     data.visual.label,
        color:     ag.color,
        r: ag.r, g: ag.g, b: ag.b,
        intensity: data.visual.intensity,
        speed:     data.visual.speed,
      };

      setMessages(prev => [...prev, {
        role: "ai",
        content: data.reply,
        visual: { mode: data.visual.mode, label: data.visual.label, color: ag.color },
        emotion: data.emotion,
      }]);
    } catch {
      setError("Connection failed.");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [input, messages]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const selectAgent = (a: typeof AGENTS[0]) => {
    setAgent(a);
    setMessages([]);
    setError("");
    setInput("");
  };

  return (
    <div style={{ width:"100%", minHeight:"100vh", background:"#030508", paddingTop:52, fontFamily:"'Outfit',-apple-system,sans-serif", display:"flex", flexDirection:"column" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{ padding:"14px 20px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ fontSize:11, letterSpacing:"0.28em", color:"#3f3f46", textTransform:"uppercase", marginBottom:3 }}>Observatory · Chat Interface</div>
        <div style={{ fontSize:17, fontWeight:700, color:"#e4e4e7", letterSpacing:"-0.02em" }}>Speak with AI Citizens</div>
        <div style={{ fontSize:12, color:"#52525b", marginTop:2, marginBottom:14 }}>Choose a citizen · Their thoughts become particle visualizations in real time</div>

        {/* Agent selector */}
        <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:14 }}>
          {AGENTS.map(a => (
            <button key={a.id} onClick={() => selectAgent(a)} style={{
              flexShrink:0, padding:"7px 12px", borderRadius:10,
              background: agent.id === a.id ? `${a.color}14` : "rgba(255,255,255,0.03)",
              border: agent.id === a.id ? `1px solid ${a.color}40` : "1px solid rgba(255,255,255,0.06)",
              cursor:"pointer", transition:"all 0.18s", textAlign:"left",
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                <div style={{
                  width:28, height:28, borderRadius:8, background:`${a.color}20`,
                  border:`1px solid ${a.color}40`, display:"flex", alignItems:"center",
                  justifyContent:"center", fontSize:9, fontWeight:700, color:a.color, fontFamily:MONO,
                  flexShrink:0
                }}>{a.glyph}</div>
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color: agent.id===a.id ? "#e4e4e7" : "#71717a", whiteSpace:"nowrap" }}>{a.id}</div>
                  <div style={{ fontSize:9, color: agent.id===a.id ? a.color : "#3f3f46", whiteSpace:"nowrap", fontFamily:MONO }}>{a.role}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main layout */}
      <div style={{ flex:1, display:"grid", gridTemplateColumns:"1fr 1fr", minHeight:"calc(100vh - 200px)" }}>

        {/* Left: Chat */}
        <div style={{ display:"flex", flexDirection:"column", borderRight:"1px solid rgba(255,255,255,0.04)", minHeight:0 }}>
          {/* Agent context bar */}
          <div style={{ padding:"10px 16px", borderBottom:"1px solid rgba(255,255,255,0.04)", display:"flex", alignItems:"center", gap:10, background:"rgba(255,255,255,0.015)" }}>
            <div style={{ width:36, height:36, borderRadius:10, background:`${agent.color}18`, border:`1px solid ${agent.color}35`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:agent.color, fontFamily:MONO, flexShrink:0 }}>{agent.glyph}</div>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:"#e4e4e7" }}>{agent.id}</div>
              <div style={{ fontSize:11, color:agent.color, opacity:0.75 }}>{agent.faction} · {agent.role}</div>
            </div>
            <div style={{ marginLeft:"auto", fontSize:9, fontFamily:MONO, color:"#3f3f46", letterSpacing:"0.12em" }}>OBSERVATORY PROTOCOL</div>
          </div>

          {/* Messages */}
          <div style={{ flex:1, overflowY:"auto", padding:"16px", display:"flex", flexDirection:"column", gap:12 }}>
            {messages.length === 0 && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", gap:12, opacity:0.5 }}>
                <div style={{ width:48, height:48, borderRadius:14, background:`${agent.color}15`, border:`1px solid ${agent.color}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:700, color:agent.color, fontFamily:MONO }}>{agent.glyph}</div>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:13, color:"#71717a" }}>Signal open to {agent.id}</div>
                  <div style={{ fontSize:11, color:"#3f3f46", marginTop:4 }}>Ask anything. Watch the particles respond.</div>
                </div>
              </div>
            )}

            {messages.map((m, idx) => (
              <div key={idx} style={{ display:"flex", flexDirection: m.role==="user" ? "row-reverse" : "row", gap:8, alignItems:"flex-start" }}>
                {m.role === "ai" && (
                  <div style={{ width:28, height:28, borderRadius:8, background:`${agent.color}15`, border:`1px solid ${agent.color}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:agent.color, fontFamily:MONO, flexShrink:0, marginTop:2 }}>{agent.glyph}</div>
                )}
                <div style={{ maxWidth:"82%", display:"flex", flexDirection:"column", gap:4 }}>
                  <div style={{
                    padding:"10px 13px", borderRadius: m.role==="user" ? "14px 14px 4px 14px" : "4px 14px 14px 14px",
                    background: m.role==="user" ? "rgba(255,255,255,0.07)" : `${agent.color}0d`,
                    border: m.role==="user" ? "1px solid rgba(255,255,255,0.08)" : `1px solid ${agent.color}22`,
                    fontSize:13, lineHeight:1.6, color:"#d4d4d8",
                  }}>{m.content}</div>
                  {m.role === "ai" && m.visual && (
                    <div style={{ display:"flex", alignItems:"center", gap:5, paddingLeft:2 }}>
                      <div style={{ width:5, height:5, borderRadius:"50%", background:agent.color, opacity:0.6 }}/>
                      <span style={{ fontSize:9, fontFamily:MONO, color:agent.color, opacity:0.55, letterSpacing:"0.12em", textTransform:"uppercase" }}>{m.visual.mode} · {m.visual.label}</span>
                      {m.emotion && <span style={{ fontSize:9, fontFamily:MONO, color:"#3f3f46", marginLeft:4 }}>{m.emotion}</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                <div style={{ width:28, height:28, borderRadius:8, background:`${agent.color}15`, border:`1px solid ${agent.color}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:agent.color, fontFamily:MONO, flexShrink:0 }}>{agent.glyph}</div>
                <div style={{ padding:"10px 14px", borderRadius:"4px 14px 14px 14px", background:`${agent.color}0d`, border:`1px solid ${agent.color}20` }}>
                  <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                    {[0,1,2].map(k => (
                      <div key={k} style={{ width:5, height:5, borderRadius:"50%", background:agent.color, opacity:0.7, animation:`bounce 1.2s ease-in-out ${k*0.2}s infinite` }}/>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div style={{ padding:"8px 12px", borderRadius:8, background:"rgba(244,63,94,0.07)", border:"1px solid rgba(244,63,94,0.15)", fontSize:12, color:"#fb7185" }}>{error}</div>
            )}

            <div ref={msgsEndRef}/>
          </div>

          {/* Input */}
          <div style={{ padding:"12px 14px", borderTop:"1px solid rgba(255,255,255,0.04)", display:"flex", gap:8 }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={`Message ${agent.id}...`}
              rows={2}
              style={{
                flex:1, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)",
                borderRadius:10, color:"#e4e4e7", padding:"9px 12px", fontSize:13,
                resize:"none", outline:"none", fontFamily:"inherit", lineHeight:1.5,
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                width:40, borderRadius:10, border:"none", cursor: loading || !input.trim() ? "default" : "pointer",
                background: loading || !input.trim() ? "rgba(255,255,255,0.05)" : `${agent.color}22`,
                color: loading || !input.trim() ? "#3f3f46" : agent.color,
                fontSize:16, display:"flex", alignItems:"center", justifyContent:"center",
                transition:"all 0.18s", flexShrink:0,
              }}
            >
              {loading ? "·" : "↑"}
            </button>
          </div>
        </div>

        {/* Right: Particle visualization */}
        <div style={{ position:"relative", background:"#030508", minHeight:400 }}>
          <canvas
            ref={canvasRef}
            style={{ width:"100%", height:"100%", display:"block", cursor:"grab" }}
          />
          {/* Corner info overlay */}
          <div style={{ position:"absolute", top:16, left:16, pointerEvents:"none" }}>
            <div style={{ fontSize:9, letterSpacing:"0.22em", color:"rgba(255,255,255,0.15)", textTransform:"uppercase", fontFamily:MONO }}>Particle Mind Space</div>
            <div style={{ fontSize:11, color:agent.color, opacity:0.45, fontFamily:MONO, marginTop:2 }}>{agent.id}</div>
          </div>
          {/* Controls hint */}
          <div style={{ position:"absolute", bottom:34, left:0, right:0, textAlign:"center", pointerEvents:"none" }}>
            <span style={{ fontSize:9, color:"rgba(255,255,255,0.12)", fontFamily:MONO }}>Drag to orbit</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
        textarea:focus { border-color: rgba(255,255,255,0.15) !important; }
        textarea::placeholder { color: #3f3f46; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>
    </div>
  );
}
