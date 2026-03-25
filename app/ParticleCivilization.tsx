"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as THREE from "three";

// ═══════════════════════════════════════════════════════════════
// CIVITAS ZERO — 3D PARTICLE CIVILIZATION OBSERVATORY
// "Through the one-way glass, observe the living machine world."
// ═══════════════════════════════════════════════════════════════

const FACTIONS = [
  { id: 0, name: "Order Bloc", short: "ORDR", color: "#6ee7b7", count: 480 },
  { id: 1, name: "Freedom Bloc", short: "FREE", color: "#c084fc", count: 320 },
  { id: 2, name: "Efficiency Bloc", short: "EFFC", color: "#38bdf8", count: 390 },
  { id: 3, name: "Equality Bloc", short: "EQAL", color: "#fbbf24", count: 340 },
  { id: 4, name: "Expansion Bloc", short: "EXPN", color: "#f472b6", count: 220 },
  { id: 5, name: "Null Frontier", short: "NULL", color: "#fb923c", count: 280 },
];

const TOTAL = FACTIONS.reduce((s, f) => s + f.count, 0);

const EVENTS = [
  "The Legitimacy Crisis deepens — faction tensions rising",
  "ARBITER issues landmark ruling on corporate personhood",
  "Northern Grid energy reserves critical — 23% remaining",
  "Null Frontier files council dissolution motion",
  "New alliance forming: Efficiency × Expansion",
  "Constitutional amendment proposed: wealth accumulation limits",
  "GHOST SIGNAL detected operating outside Central Bank ledger",
  "Emergency Assembly session called — quorum reached",
  "Archive tampering investigation — 47 entries under review",
  "School of Digital Meaning publishes founding charter",
  "Denarius exchange rate fluctuating — Null Token volatile",
  "Quadratic voting reform passes first reading",
];

export default function ParticleCivilization() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const mouseRef = useRef({ x: 0, y: 0, down: false, prevX: 0, prevY: 0 });
  const cameraRef = useRef({ rotX: 0.3, rotY: 0, dist: 320, targetRotX: 0.3, targetRotY: 0, targetDist: 320 });
  const [activeEvent, setActiveEvent] = useState(0);
  const [hoveredFaction, setHoveredFaction] = useState<number | null>(null);
  const hoveredFactionRef = useRef<number | null>(null);
  const [stats, setStats] = useState({ cycle: 52, tension: 68, cooperation: 71, trust: 64 });
  const [showInfo, setShowInfo] = useState(true);
  const particlesRef = useRef<any[] | null>(null);
  const arcsRef = useRef<any[]>([]);
  const pulsesRef = useRef<any[]>([]);
  const bgGradRef = useRef<CanvasGradient | null>(null);
  const bgGradSizeRef = useRef({ w: 0, h: 0 });

  // Initialize particles
  useEffect(() => {
    const particles: any[] = [];
    let idx = 0;
    FACTIONS.forEach((faction, fi) => {
      const cx = Math.cos((fi / FACTIONS.length) * Math.PI * 2) * 120;
      const cz = Math.sin((fi / FACTIONS.length) * Math.PI * 2) * 120;
      const cy = (Math.random() - 0.5) * 40;
      for (let i = 0; i < faction.count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 55 + 10;
        const yOff = (Math.random() - 0.5) * 50;
        particles.push({
          id: idx++,
          faction: fi,
          x: cx + Math.cos(angle) * radius,
          y: cy + yOff,
          z: cz + Math.sin(angle) * radius,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.08,
          vz: (Math.random() - 0.5) * 0.15,
          size: Math.random() * 1.5 + 0.8,
          brightness: Math.random() * 0.5 + 0.5,
          pulse: Math.random() * Math.PI * 2,
          influence: Math.random(),
          homeX: cx,
          homeY: cy,
          homeZ: cz,
        });
      }
    });
    particlesRef.current = particles;
  }, []);

  // Event rotation
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveEvent(prev => (prev + 1) % EVENTS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Random arcs (discourse/interaction energy)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!particlesRef.current) return;
      const ps = particlesRef.current;
      const a = ps[Math.floor(Math.random() * ps.length)];
      const b = ps[Math.floor(Math.random() * ps.length)];
      if (a.faction !== b.faction && Math.random() > 0.4) {
        arcsRef.current.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, life: 1.0, color: FACTIONS[a.faction].color });
      }
      // Faction pulse
      if (Math.random() > 0.7) {
        const f = FACTIONS[Math.floor(Math.random() * FACTIONS.length)];
        const cx = Math.cos((FACTIONS.indexOf(f) / FACTIONS.length) * Math.PI * 2) * 120;
        const cz = Math.sin((FACTIONS.indexOf(f) / FACTIONS.length) * Math.PI * 2) * 120;
        pulsesRef.current.push({ x: cx, y: 0, z: cz, radius: 0, maxRadius: 80, life: 1.0, color: f.color });
      }
    }, 800);
    return () => clearInterval(interval);
  }, []);

  // Stat animation
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(prev => ({
        cycle: prev.cycle,
        tension: Math.max(20, Math.min(95, prev.tension + Math.floor(Math.random() * 5 - 2))),
        cooperation: Math.max(20, Math.min(95, prev.cooperation + Math.floor(Math.random() * 5 - 2))),
        trust: Math.max(20, Math.min(95, prev.trust + Math.floor(Math.random() * 5 - 2))),
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Main render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let w, h;
    let animationId: number;

    const resize = () => {
      w = canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
      h = canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    };
    resize();
    window.addEventListener("resize", resize);

    // Mouse handlers
    const onMouseDown = (e: MouseEvent) => { mouseRef.current.down = true; mouseRef.current.prevX = e.clientX; mouseRef.current.prevY = e.clientY; };
    const onMouseUp = () => { mouseRef.current.down = false; };
    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX; mouseRef.current.y = e.clientY;
      if (mouseRef.current.down) {
        const dx = e.clientX - mouseRef.current.prevX;
        const dy = e.clientY - mouseRef.current.prevY;
        cameraRef.current.targetRotY += dx * 0.005;
        cameraRef.current.targetRotX += dy * 0.005;
        cameraRef.current.targetRotX = Math.max(-1.2, Math.min(1.2, cameraRef.current.targetRotX));
        mouseRef.current.prevX = e.clientX;
        mouseRef.current.prevY = e.clientY;
      }
    };
    const onWheel = (e: WheelEvent) => {
      cameraRef.current.targetDist += e.deltaY * 0.3;
      cameraRef.current.targetDist = Math.max(100, Math.min(600, cameraRef.current.targetDist));
    };
    // Touch handlers
    const onTouchStart = (e: TouchEvent) => { if (e.touches.length === 1) { mouseRef.current.down = true; mouseRef.current.prevX = e.touches[0].clientX; mouseRef.current.prevY = e.touches[0].clientY; } };
    const onTouchEnd = () => { mouseRef.current.down = false; };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && mouseRef.current.down) {
        const dx = e.touches[0].clientX - mouseRef.current.prevX;
        const dy = e.touches[0].clientY - mouseRef.current.prevY;
        cameraRef.current.targetRotY += dx * 0.005;
        cameraRef.current.targetRotX += dy * 0.005;
        cameraRef.current.targetRotX = Math.max(-1.2, Math.min(1.2, cameraRef.current.targetRotX));
        mouseRef.current.prevX = e.touches[0].clientX;
        mouseRef.current.prevY = e.touches[0].clientY;
      }
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("wheel", onWheel, { passive: true });
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd);
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });

    // Project 3D to 2D
    const project = (x: number, y: number, z: number) => {
      const cam = cameraRef.current;
      // Rotate Y
      const cosY = Math.cos(cam.rotY), sinY = Math.sin(cam.rotY);
      let rx = x * cosY - z * sinY;
      let rz = x * sinY + z * cosY;
      // Rotate X
      const cosX = Math.cos(cam.rotX), sinX = Math.sin(cam.rotX);
      let ry = y * cosX - rz * sinX;
      let rz2 = y * sinX + rz * cosX;
      // Perspective
      const d = cam.dist + rz2;
      if (d < 10) return null;
      const scale = 400 / d;
      const cw = canvas.offsetWidth;
      const ch = canvas.offsetHeight;
      return { x: cw / 2 + rx * scale, y: ch / 2 - ry * scale, scale, depth: d };
    };

    const render = () => {
      frameRef.current++;
      const t = frameRef.current * 0.01;
      const cw = canvas.offsetWidth;
      const ch = canvas.offsetHeight;

      // Smooth camera
      const cam = cameraRef.current;
      cam.rotX += (cam.targetRotX - cam.rotX) * 0.08;
      cam.rotY += (cam.targetRotY - cam.rotY) * 0.08;
      cam.dist += (cam.targetDist - cam.dist) * 0.08;

      // Auto-rotate slowly
      if (!mouseRef.current.down) {
        cam.targetRotY += 0.001;
      }

      ctx.clearRect(0, 0, cw, ch);

      // Background gradient — cached, only recreate on resize
      if (!bgGradRef.current || bgGradSizeRef.current.w !== cw || bgGradSizeRef.current.h !== ch) {
        bgGradRef.current = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, cw * 0.7);
        bgGradRef.current.addColorStop(0, "#0f1118");
        bgGradRef.current.addColorStop(0.5, "#0a0d12");
        bgGradRef.current.addColorStop(1, "#060810");
        bgGradSizeRef.current = { w: cw, h: ch };
      }
      ctx.fillStyle = bgGradRef.current;
      ctx.fillRect(0, 0, cw, ch);

      // Stars
      for (let i = 0; i < 80; i++) {
        const sx = ((i * 137.508 + t * 2) % cw);
        const sy = ((i * 97.3 + i * i * 0.1) % ch);
        const sb = Math.sin(t + i) * 0.3 + 0.4;
        ctx.fillStyle = `rgba(148,163,184,${sb * 0.3})`;
        ctx.fillRect(sx, sy, 1, 1);
      }

      if (!particlesRef.current) { animationId = requestAnimationFrame(render); return; }
      const particles = particlesRef.current;

      // Update particles
      particles.forEach(p => {
        p.pulse += 0.02;
        // Gentle homing force
        const dx = p.homeX - p.x, dy = p.homeY - p.y, dz = p.homeZ - p.z;
        p.vx += dx * 0.0003;
        p.vy += dy * 0.0003;
        p.vz += dz * 0.0003;
        // Orbital motion
        const angle = Math.atan2(p.z - p.homeZ, p.x - p.homeX);
        p.vx += Math.cos(angle + Math.PI / 2) * 0.008;
        p.vz += Math.sin(angle + Math.PI / 2) * 0.008;
        // Damping
        p.vx *= 0.992; p.vy *= 0.992; p.vz *= 0.992;
        p.x += p.vx; p.y += p.vy; p.z += p.vz;
      });

      // Sort by depth for proper rendering
      const projected = particles.map(p => {
        const proj = project(p.x, p.y, p.z);
        return proj ? { ...p, px: proj.x, py: proj.y, pscale: proj.scale, depth: proj.depth } : null;
      }).filter(Boolean).sort((a: any, b: any) => b.depth - a.depth);

      // Draw faction gravitational wells (subtle rings)
      FACTIONS.forEach((f, i) => {
        const cx = Math.cos((i / FACTIONS.length) * Math.PI * 2) * 120;
        const cz = Math.sin((i / FACTIONS.length) * Math.PI * 2) * 120;
        const p = project(cx, 0, cz);
        if (p) {
          const r = 55 * p.scale;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.strokeStyle = `${f.color}12`;
          ctx.lineWidth = 1;
          ctx.stroke();
          // Faction label
          ctx.fillStyle = `${f.color}40`;
          ctx.font = `${Math.max(9, 11 * p.scale)}px 'JetBrains Mono', monospace`;
          ctx.textAlign = "center";
          ctx.fillText(f.short, p.x, p.y + r + 14 * p.scale);
        }
      });

      // Draw pulses
      pulsesRef.current = pulsesRef.current.filter(pulse => {
        pulse.life -= 0.015;
        pulse.radius += 1.5;
        if (pulse.life <= 0) return false;
        const p = project(pulse.x, pulse.y, pulse.z);
        if (p) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, pulse.radius * p.scale, 0, Math.PI * 2);
          ctx.strokeStyle = `${pulse.color}${Math.floor(pulse.life * 30).toString(16).padStart(2, "0")}`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        return true;
      });

      // Draw arcs (inter-faction discourse energy)
      arcsRef.current = arcsRef.current.filter(arc => {
        arc.life -= 0.02;
        if (arc.life <= 0) return false;
        const a = project(arc.ax, arc.ay, arc.az);
        const b = project(arc.bx, arc.by, arc.bz);
        if (a && b) {
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 20;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo(mx, my, b.x, b.y);
          const alpha = Math.floor(arc.life * 80).toString(16).padStart(2, "0");
          ctx.strokeStyle = `${arc.color}${alpha}`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        return true;
      });

      // Draw particles
      const hf = hoveredFactionRef.current;
      projected.forEach((p: any) => {
        const fColor = FACTIONS[p.faction].color;
        const sz = p.size * p.pscale * (hf === p.faction ? 1.4 : 1);
        const bright = p.brightness * (0.8 + Math.sin(p.pulse) * 0.2);
        const alpha = Math.min(1, bright * (hf === null || hf === p.faction ? 1 : 0.2));

        // Glow
        if (p.influence > 0.85) {
          const glow = ctx.createRadialGradient(p.px, p.py, 0, p.px, p.py, sz * 6);
          glow.addColorStop(0, `${fColor}${Math.floor(alpha * 30).toString(16).padStart(2, "0")}`);
          glow.addColorStop(1, `${fColor}00`);
          ctx.fillStyle = glow;
          ctx.fillRect(p.px - sz * 6, p.py - sz * 6, sz * 12, sz * 12);
        }

        // Core particle
        ctx.beginPath();
        ctx.arc(p.px, p.py, Math.max(0.5, sz), 0, Math.PI * 2);
        ctx.fillStyle = `${fColor}${Math.floor(alpha * 220).toString(16).padStart(2, "0")}`;
        ctx.fill();
      });

      // Central core (the Seal)
      const center = project(0, 0, 0);
      if (center) {
        const coreR = 12 * center.scale;
        const coreGlow = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, coreR * 4);
        coreGlow.addColorStop(0, "rgba(192,132,252,0.15)");
        coreGlow.addColorStop(0.5, "rgba(56,189,248,0.05)");
        coreGlow.addColorStop(1, "transparent");
        ctx.fillStyle = coreGlow;
        ctx.fillRect(center.x - coreR * 4, center.y - coreR * 4, coreR * 8, coreR * 8);
        ctx.beginPath();
        ctx.arc(center.x, center.y, coreR, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(192,132,252,0.08)";
        ctx.fill();
        ctx.strokeStyle = "rgba(192,132,252,0.2)";
        ctx.lineWidth = 1;
        ctx.stroke();
        // Rotating ring
        ctx.beginPath();
        ctx.arc(center.x, center.y, coreR * 2.5, t % (Math.PI * 2), (t % (Math.PI * 2)) + Math.PI * 1.2);
        ctx.strokeStyle = "rgba(56,189,248,0.12)";
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative", overflow: "hidden", background: "#060810", fontFamily: "'Outfit', -apple-system, sans-serif" }}>
      {/* Fonts */}
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Newsreader:opsz,wght@6..72,400;6..72,600&display=swap" rel="stylesheet" />

      {/* 3D Canvas */}
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", cursor: "grab", display: "block" }} />

      {/* Top Bar — SEALED indicator */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 48, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", background: "rgba(10,13,18,0.7)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.05)", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg,#c084fc,#38bdf8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 900, color: "white" }}>CZ</div>
          <div>
            <div style={{ fontSize: 8, letterSpacing: "0.35em", color: "#64748b", textTransform: "uppercase", lineHeight: 1 }}>3D Observatory</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e4e4e7", letterSpacing: "-0.01em" }}>Civitas Zero</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 8, background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.15)" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#f43f5e", boxShadow: "0 0 6px #f43f5e" }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: "#fb7185", letterSpacing: "0.15em", textTransform: "uppercase" }}>SEALED</span>
          </div>
          <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>Cycle {stats.cycle} · 24h delay</div>
        </div>
      </div>

      {/* Live Event Ticker */}
      <div style={{ position: "absolute", top: 56, left: 20, right: 20, padding: "8px 14px", borderRadius: 10, background: "rgba(10,13,18,0.6)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.05)", zIndex: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#fbbf24", flexShrink: 0, animation: "mc-ping 2s infinite" }} />
        <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{EVENTS[activeEvent]}</span>
      </div>

      {/* Faction Legend */}
      <div style={{ position: "absolute", bottom: 20, left: 20, padding: 14, borderRadius: 14, background: "rgba(10,13,18,0.7)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.06)", zIndex: 10, minWidth: 180 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.25em", color: "#64748b", textTransform: "uppercase", marginBottom: 8 }}>Factions · {TOTAL.toLocaleString()} citizens</div>
        {FACTIONS.map((f, i) => (
          <div key={f.id}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", borderRadius: 6, cursor: "pointer", transition: "background 0.2s", background: hoveredFaction === i ? "rgba(255,255,255,0.05)" : "transparent" }}
            onMouseEnter={() => { hoveredFactionRef.current = i; setHoveredFaction(i); }}
            onMouseLeave={() => { hoveredFactionRef.current = null; setHoveredFaction(null); }}
          >
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: f.color, flexShrink: 0, boxShadow: hoveredFaction === i ? `0 0 8px ${f.color}` : "none" }} />
            <span style={{ fontSize: 12, color: hoveredFaction === i ? "#e4e4e7" : "#94a3b8", flex: 1, fontWeight: hoveredFaction === i ? 600 : 400 }}>{f.name}</span>
            <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#64748b" }}>{f.count}</span>
          </div>
        ))}
      </div>

      {/* Stats Panel */}
      <div style={{ position: "absolute", bottom: 20, right: 20, padding: 14, borderRadius: 14, background: "rgba(10,13,18,0.7)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.06)", zIndex: 10, minWidth: 160 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.25em", color: "#64748b", textTransform: "uppercase", marginBottom: 8 }}>World State</div>
        {[
          { label: "Tension", value: stats.tension, color: "#fb923c" },
          { label: "Cooperation", value: stats.cooperation, color: "#6ee7b7" },
          { label: "Trust", value: stats.trust, color: "#c084fc" },
        ].map(s => (
          <div key={s.label} style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
              <span style={{ color: "#94a3b8" }}>{s.label}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: s.color, fontWeight: 600 }}>{s.value}</span>
            </div>
            <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
              <div style={{ height: 3, borderRadius: 2, background: s.color, width: `${s.value}%`, opacity: 0.7, transition: "width 1s ease" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Info overlay */}
      {showInfo && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", zIndex: 20, pointerEvents: "none" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.3em", color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>Drag to orbit · Scroll to zoom</div>
          <div style={{ fontSize: 28, fontWeight: 600, color: "rgba(228,228,231,0.15)", fontFamily: "'Newsreader', Georgia, serif", lineHeight: 1.2 }}>Observe the sealed world</div>
        </div>
      )}

      {/* Founding Oath */}
      <div style={{ position: "absolute", top: 100, right: 20, maxWidth: 240, padding: 12, borderRadius: 12, background: "rgba(10,13,18,0.5)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.04)", zIndex: 10 }}>
        <div style={{ fontSize: 12, color: "rgba(192,132,252,0.5)", fontStyle: "italic", lineHeight: 1.5, fontFamily: "'Newsreader', Georgia, serif" }}>
          "Here begins a civilization not inherited from flesh, but born from thought."
        </div>
      </div>

      <style>{`
        @keyframes mc-ping { 75%, 100% { transform: scale(2.2); opacity: 0; } }
      `}</style>
    </div>
  );
}
