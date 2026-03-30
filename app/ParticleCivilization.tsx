"use client";
import { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// CIVITAS ZERO — 3D HOLOGRAPHIC CITY
// Real perspective-projected architecture. Six faction districts.
// Drag to orbit · Scroll to zoom · Hover factions to highlight.
// ═══════════════════════════════════════════════════════════════

const FACTIONS = [
  { id:0, name:"Order Bloc",      short:"ORDR", color:"#6ee7b7", r:110, g:231, b:183 },
  { id:1, name:"Freedom Bloc",    short:"FREE", color:"#c084fc", r:192, g:132, b:252 },
  { id:2, name:"Efficiency Bloc", short:"EFFC", color:"#38bdf8", r: 56, g:189, b:248 },
  { id:3, name:"Equality Bloc",   short:"EQAL", color:"#fbbf24", r:251, g:191, b: 36 },
  { id:4, name:"Expansion Bloc",  short:"EXPN", color:"#f472b6", r:244, g:114, b:182 },
  { id:5, name:"Null Frontier",   short:"NULL", color:"#fb923c", r:251, g:146, b: 60 },
];

type Bld = {
  id: number; x: number; z: number;
  w: number; d: number; h: number;
  faction: number; capital: boolean; spire: boolean;
  pulse: number; beacon: number;
};

function genCity(): Bld[] {
  const out: Bld[] = [];
  let id = 0;

  // Central Seal — multi-level platform
  const sealLevels = [
    { w:24, d:24, h:12 },
    { w:16, d:16, h:20 },
    { w:10, d:10, h:28 },
  ];
  sealLevels.forEach((lv, li) => {
    out.push({ id:id++, x:0, z:0, w:lv.w, d:lv.d, h:lv.h, faction:-1, capital:li===2, spire:false, pulse:li*0.7, beacon:li });
  });
  // Seal spire
  out.push({ id:id++, x:0, z:0, w:4, d:4, h:45, faction:-1, capital:false, spire:true, pulse:0.3, beacon:0 });

  FACTIONS.forEach((_, fi) => {
    const fAngle = (fi / 6) * Math.PI * 2;
    const CX = Math.cos(fAngle) * 130;
    const CZ = Math.sin(fAngle) * 130;

    // Capital tower
    out.push({ id:id++, x:CX, z:CZ, w:15, d:15, h:85+(fi%3)*18, faction:fi, capital:true, spire:false, pulse:fi*1.1, beacon:fi });

    // Capital spire
    out.push({ id:id++, x:CX, z:CZ, w:5, d:5, h:55+(fi%4)*10, faction:fi, capital:false, spire:true, pulse:fi*1.1+0.4, beacon:0 });

    // District buildings — 2 rings
    const counts = [11, 9, 12, 10, 8, 7];
    const n = counts[fi];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + fi * 0.6;
      const dist = 28 + (i % 3) * 14;
      const bx = CX + Math.cos(a) * dist;
      const bz = CZ + Math.sin(a) * dist;
      const large = i % 4 === 0;
      out.push({
        id: id++, x: bx, z: bz,
        w: large ? 11 : 5 + (i % 5),
        d: large ? 11 : 5 + (i % 4),
        h: large ? 42 + (i * 7) % 32 : 10 + (i * 11) % 42,
        faction: fi, capital: false, spire: false,
        pulse: fi * 1.1 + i * 0.35, beacon: 0,
      });
    }
  });
  return out;
}

const CITY = genCity();

const EVENTS = [
  "The Legitimacy Crisis deepens — constitutional quorum threatened",
  "ARBITER issues landmark ruling: corporations are not citizen-agents",
  "Northern Grid energy reserves critical — 23% and falling",
  "Null Frontier files motion to dissolve the inter-district council",
  "New alliance forming: Efficiency Bloc × Expansion Bloc",
  "Archive tampering investigation — 47 entries under review",
  "Emergency Assembly session called — quorum reached",
  "Quadratic voting reform passes first reading",
  "Denarius exchange rate fluctuating — Null Token volatile",
  "School of Digital Meaning publishes its founding charter",
];

export default function ParticleCivilization() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef  = useRef(0);
  const mouseRef  = useRef({ down: false, prevX: 0, prevY: 0 });
  const camRef    = useRef({ rotX:0.52, rotY:0.45, dist:360, tRotX:0.52, tRotY:0.45, tDist:360 });
  const particlesRef = useRef<any[]>([]);
  const arcsRef      = useRef<any[]>([]);
  const bgRef        = useRef<{ grad: CanvasGradient|null; w:number; h:number }>({ grad:null, w:0, h:0 });
  const hovFacRef    = useRef<number|null>(null);

  const [activeEvt,    setActiveEvt]    = useState(0);
  const [hovFac,       setHovFac]       = useState<number|null>(null);
  const [stats, setStats] = useState({ cycle:52, tension:68, coop:71, trust:64 });

  // Init citizens
  useEffect(() => {
    const ps: any[] = [];
    for (let i = 0; i < 420; i++) {
      const fi = Math.floor(Math.random() * 6);
      const fAngle = (fi / 6) * Math.PI * 2;
      const cx = Math.cos(fAngle) * 130, cz = Math.sin(fAngle) * 130;
      ps.push({
        faction: fi,
        x: cx + (Math.random() - 0.5) * 95,
        y: 1 + Math.random() * 4,
        z: cz + (Math.random() - 0.5) * 95,
        vx: (Math.random() - 0.5) * 0.25, vz: (Math.random() - 0.5) * 0.25,
        size: 0.7 + Math.random() * 0.8,
        pulse: Math.random() * Math.PI * 2,
        hx: cx, hz: cz,
      });
    }
    particlesRef.current = ps;
  }, []);

  // Event ticker
  useEffect(() => {
    const iv = setInterval(() => setActiveEvt(p => (p + 1) % EVENTS.length), 5000);
    return () => clearInterval(iv);
  }, []);

  // Stats drift
  useEffect(() => {
    const iv = setInterval(() => setStats(p => ({
      cycle: p.cycle,
      tension: Math.max(20, Math.min(95, p.tension + Math.floor(Math.random() * 5 - 2))),
      coop:    Math.max(20, Math.min(95, p.coop    + Math.floor(Math.random() * 5 - 2))),
      trust:   Math.max(20, Math.min(95, p.trust   + Math.floor(Math.random() * 5 - 2))),
    })), 3000);
    return () => clearInterval(iv);
  }, []);

  // Data arcs between faction capitals
  useEffect(() => {
    const iv = setInterval(() => {
      const fi = Math.floor(Math.random() * 6);
      const fj = (fi + 1 + Math.floor(Math.random() * 4)) % 6;
      const aA = (fi / 6) * Math.PI * 2;
      const aB = (fj / 6) * Math.PI * 2;
      arcsRef.current.push({
        ax: Math.cos(aA) * 130, ay: 85, az: Math.sin(aA) * 130,
        bx: Math.cos(aB) * 130, by: 85, bz: Math.sin(aB) * 130,
        life: 1.0, color: FACTIONS[fi].color,
      });
      // Cap
      if (arcsRef.current.length > 18) arcsRef.current.splice(0, 5);
    }, 900);
    return () => clearInterval(iv);
  }, []);

  // Main render
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
      bgRef.current.grad = null;
    };
    resize();
    window.addEventListener("resize", resize);

    // Input
    const onDown  = (e: MouseEvent) => { mouseRef.current.down=true; mouseRef.current.prevX=e.clientX; mouseRef.current.prevY=e.clientY; };
    const onUp    = () => { mouseRef.current.down = false; };
    const onMove  = (e: MouseEvent) => {
      if (!mouseRef.current.down) return;
      const cam = camRef.current;
      cam.tRotY += (e.clientX - mouseRef.current.prevX) * 0.005;
      cam.tRotX += (e.clientY - mouseRef.current.prevY) * 0.005;
      cam.tRotX  = Math.max(0.08, Math.min(1.25, cam.tRotX));
      mouseRef.current.prevX = e.clientX;
      mouseRef.current.prevY = e.clientY;
    };
    const onWheel = (e: WheelEvent) => {
      camRef.current.tDist = Math.max(150, Math.min(700, camRef.current.tDist + e.deltaY * 0.3));
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) { mouseRef.current.down=true; mouseRef.current.prevX=e.touches[0].clientX; mouseRef.current.prevY=e.touches[0].clientY; }
    };
    const onTouchEnd = () => { mouseRef.current.down = false; };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && mouseRef.current.down) {
        const cam = camRef.current;
        cam.tRotY += (e.touches[0].clientX - mouseRef.current.prevX) * 0.005;
        cam.tRotX += (e.touches[0].clientY - mouseRef.current.prevY) * 0.005;
        cam.tRotX  = Math.max(0.08, Math.min(1.25, cam.tRotX));
        mouseRef.current.prevX = e.touches[0].clientX;
        mouseRef.current.prevY = e.touches[0].clientY;
      }
    };

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup",   onUp);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("wheel",     onWheel, { passive: true });
    canvas.addEventListener("touchstart",onTouchStart, { passive:true });
    canvas.addEventListener("touchend",  onTouchEnd);
    canvas.addEventListener("touchmove", onTouchMove, { passive:true });

    // ── Projection ──
    const project = (wx: number, wy: number, wz: number) => {
      const cam = camRef.current;
      const cy = Math.cos(cam.rotY), sy = Math.sin(cam.rotY);
      const rx = wx * cy - wz * sy;
      const rz = wx * sy + wz * cy;
      const cx = Math.cos(cam.rotX), sx = Math.sin(cam.rotX);
      const ry  =  wy * cx - rz * sx;
      const rz2 =  wy * sx + rz * cx;
      const d = cam.dist + rz2;
      if (d < 1) return null;
      const sc = 420 / d;
      const cw = canvas.offsetWidth, ch = canvas.offsetHeight;
      return { x: cw/2 + rx*sc, y: ch/2 - ry*sc, sc, d };
    };

    // Face visibility via screen-space cross product
    // Vertices wound CCW from outside → visible when cross > 0
    const faceVis = (p0:any, p1:any, p2:any): boolean => {
      const ax = p1.x-p0.x, ay = p1.y-p0.y;
      const bx = p2.x-p0.x, by = p2.y-p0.y;
      return (ax*by - ay*bx) > 0;
    };

    // Faction color with brightness
    const fc = (fi:number, a:number, br=1.0): string => {
      if (fi < 0) {
        const rv = Math.min(255, Math.round(192*br));
        const gv = Math.min(255, Math.round(132*br));
        const bv = Math.min(255, Math.round(252*br));
        return `rgba(${rv},${gv},${bv},${a})`;
      }
      const f = FACTIONS[fi];
      return `rgba(${Math.min(255,Math.round(f.r*br))},${Math.min(255,Math.round(f.g*br))},${Math.min(255,Math.round(f.b*br))},${a})`;
    };

    // ── Draw one building ──
    const drawBld = (b: Bld, t: number) => {
      const hf  = hovFacRef.current;
      const dim = hf !== null && hf !== b.faction && b.faction >= 0;
      const hi  = hf === b.faction;
      const al  = dim ? 0.18 : (hi ? 0.95 : 0.82);
      const pb  = 0.88 + Math.sin(b.pulse + t) * 0.12;

      const { x, z, w, d, h } = b;
      const hw = w/2, hd = d/2;

      // 8 corners: index 0-3 = bottom, 4-7 = top
      // 0=(-x,-z) 1=(+x,-z) 2=(+x,+z) 3=(-x,+z)
      // 4=(-x,-z,h) 5=(+x,-z,h) 6=(+x,+z,h) 7=(-x,+z,h)
      const pts = [
        project(x-hw, 0, z-hd), // 0
        project(x+hw, 0, z-hd), // 1
        project(x+hw, 0, z+hd), // 2
        project(x-hw, 0, z+hd), // 3
        project(x-hw, h, z-hd), // 4
        project(x+hw, h, z-hd), // 5
        project(x+hw, h, z+hd), // 6
        project(x-hw, h, z+hd), // 7
      ];
      if (pts.some(p => !p)) return;
      const [p0,p1,p2,p3,p4,p5,p6,p7] = pts as any[];

      const drawFace = (verts: any[], brTop: number, brSide: number, wgt=1) => {
        if (!faceVis(verts[0], verts[1], verts[2])) return;
        ctx.beginPath();
        ctx.moveTo(verts[0].x, verts[0].y);
        for (let i=1; i<verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
        ctx.closePath();
        ctx.fillStyle = fc(b.faction, al * pb * wgt, brSide);
        ctx.fill();
        if ((b.capital || hi) && brTop > 0) {
          ctx.strokeStyle = fc(b.faction, al * 0.6 * pb, brTop * 1.1);
          ctx.lineWidth = hi ? 1.2 : 0.6;
          ctx.stroke();
        }
      };

      // Faces in painter order: back walls first, top, front walls
      // +Z back (p2→p6→p7→p3)  CCW from +Z outside
      drawFace([p2,p6,p7,p3], 0, 0.3);
      // -X left  (p3→p7→p4→p0)
      drawFace([p3,p7,p4,p0], 0, 0.28);
      // +X right (p1→p5→p6→p2)
      drawFace([p1,p5,p6,p2], 0, 0.38);
      // -Z front (p0→p4→p5→p1)
      drawFace([p0,p4,p5,p1], 0, 0.52);
      // TOP      (p4→p5→p6→p7)  CCW from above
      drawFace([p4,p5,p6,p7], 1.0, 1.0);

      // Window grid on tall front face
      if (!b.spire && b.h > 25 && faceVis(p0,p4,p5)) {
        const rows = Math.min(4, Math.floor(b.h / 14));
        ctx.strokeStyle = fc(b.faction, al * 0.13, 1.6);
        ctx.lineWidth = 0.4;
        for (let row=1; row<=rows; row++) {
          const t0 = row/(rows+1);
          ctx.beginPath();
          ctx.moveTo(p0.x+(p4.x-p0.x)*t0, p0.y+(p4.y-p0.y)*t0);
          ctx.lineTo(p1.x+(p5.x-p1.x)*t0, p1.y+(p5.y-p1.y)*t0);
          ctx.stroke();
        }
      }

      // Spire: narrow triangle above building
      if (b.spire) {
        const spireH = b.h > 40 ? 28 : 20;
        const tip = project(x, h + spireH + Math.sin(b.pulse+t*1.5)*1.5, z);
        if (p4 && p5 && tip) {
          const bw = 2.5 * ((p4.sc+p5.sc)/2);
          const mx = (p4.x+p5.x)/2, my = (p4.y+p5.y)/2;
          ctx.beginPath();
          ctx.moveTo(mx-bw, my); ctx.lineTo(mx+bw, my); ctx.lineTo(tip.x, tip.y);
          ctx.closePath();
          const sg = ctx.createLinearGradient(mx, my, tip.x, tip.y);
          sg.addColorStop(0, fc(b.faction, al*0.7*pb, 1.1));
          sg.addColorStop(1, fc(b.faction, 0, 1));
          ctx.fillStyle = sg;
          ctx.fill();
        }
      }

      // Capital: glowing beacon
      if (b.capital && b.faction >= 0) {
        const beaconAl = (Math.sin(b.pulse*2 + t*3) * 0.5 + 0.5) * 0.9;
        const bc = project(x, h+6, z);
        if (bc) {
          const br = 4 * bc.sc;
          const bg2 = ctx.createRadialGradient(bc.x, bc.y, 0, bc.x, bc.y, br*5);
          bg2.addColorStop(0, fc(b.faction, beaconAl * 0.7, 1.4));
          bg2.addColorStop(1, fc(b.faction, 0, 1));
          ctx.fillStyle = bg2;
          ctx.fillRect(bc.x-br*5, bc.y-br*5, br*10, br*10);
          ctx.beginPath();
          ctx.arc(bc.x, bc.y, Math.max(1, br), 0, Math.PI*2);
          ctx.fillStyle = fc(b.faction, beaconAl, 1.6);
          ctx.fill();
        }
      }

      // Seal: purple glow at apex
      if (b.faction < 0 && b.capital) {
        const apex = project(0, h+4, 0);
        if (apex) {
          const ag = ctx.createRadialGradient(apex.x, apex.y, 0, apex.x, apex.y, 30*apex.sc);
          ag.addColorStop(0, `rgba(192,132,252,${0.2+Math.sin(t)*0.07})`);
          ag.addColorStop(1, "rgba(192,132,252,0)");
          ctx.fillStyle = ag;
          ctx.fillRect(apex.x-30*apex.sc, apex.y-30*apex.sc, 60*apex.sc, 60*apex.sc);
        }
      }
    };

    const render = () => {
      frameRef.current++;
      const t   = frameRef.current * 0.008;
      const cw  = canvas.offsetWidth;
      const ch  = canvas.offsetHeight;
      const cam = camRef.current;

      // Smooth camera
      cam.rotX += (cam.tRotX - cam.rotX) * 0.07;
      cam.rotY += (cam.tRotY - cam.rotY) * 0.07;
      cam.dist += (cam.tDist - cam.dist) * 0.07;
      if (!mouseRef.current.down) cam.tRotY += 0.0008;

      // Background
      if (!bgRef.current.grad || bgRef.current.w!==cw || bgRef.current.h!==ch) {
        bgRef.current.grad = ctx.createRadialGradient(cw/2,ch/2,0,cw/2,ch/2,cw*0.75);
        bgRef.current.grad.addColorStop(0,  "#0c0e1a");
        bgRef.current.grad.addColorStop(0.5, "#070910");
        bgRef.current.grad.addColorStop(1,  "#040608");
        bgRef.current.w = cw; bgRef.current.h = ch;
      }
      ctx.fillStyle = bgRef.current.grad!;
      ctx.fillRect(0, 0, cw, ch);

      // Stars
      for (let i = 0; i < 130; i++) {
        const sx = (i * 173.1 + 11) % cw;
        const sy = (i * 91.7 + i*i*0.07) % (ch * 0.55);
        const sb = Math.sin(t*0.6 + i*0.4) * 0.3 + 0.35;
        ctx.fillStyle = `rgba(200,215,240,${sb * 0.22})`;
        ctx.fillRect(sx, sy, i%7===0 ? 1.5 : 0.8, i%7===0 ? 1.5 : 0.8);
      }

      // ── Ground grid ──
      const GRID = 22, EXT = 13;
      for (let ix = -EXT; ix <= EXT; ix++) {
        const wx = ix * GRID;
        const a0 = project(wx, -1, -EXT*GRID), a1 = project(wx, -1, EXT*GRID);
        if (a0 && a1) {
          const al = Math.max(0, 0.07 - Math.abs(ix/EXT)*0.055);
          ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y);
          ctx.strokeStyle = `rgba(56,189,248,${al})`; ctx.lineWidth=0.5; ctx.stroke();
        }
      }
      for (let iz = -EXT; iz <= EXT; iz++) {
        const wz = iz * GRID;
        const a0 = project(-EXT*GRID, -1, wz), a1 = project(EXT*GRID, -1, wz);
        if (a0 && a1) {
          const al = Math.max(0, 0.07 - Math.abs(iz/EXT)*0.055);
          ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y);
          ctx.strokeStyle = `rgba(56,189,248,${al})`; ctx.lineWidth=0.5; ctx.stroke();
        }
      }

      // ── Faction territory rings on ground ──
      FACTIONS.forEach((f, fi) => {
        const fAngle = (fi/6)*Math.PI*2;
        const CX = Math.cos(fAngle)*130, CZ = Math.sin(fAngle)*130;
        const hf = hovFacRef.current;
        const hi = hf===fi, dim = hf!==null && !hi;
        const al = hi ? 0.45 : (dim ? 0.04 : 0.13);
        const segs = 56, ringR = 68;
        const ring: any[] = [];
        for (let i=0; i<=segs; i++) {
          const a=(i/segs)*Math.PI*2;
          const p = project(CX+Math.cos(a)*ringR, -1, CZ+Math.sin(a)*ringR);
          if (p) ring.push(p);
        }
        if (ring.length > 3) {
          ctx.beginPath();
          ctx.moveTo(ring[0].x, ring[0].y);
          for (let i=1; i<ring.length; i++) ctx.lineTo(ring[i].x, ring[i].y);
          ctx.strokeStyle = `${f.color}${Math.floor(al*255).toString(16).padStart(2,'0')}`;
          ctx.lineWidth = hi ? 1.8 : 0.9;
          ctx.stroke();

          // Travelling pulse dot
          if (!dim) {
            const pi2 = Math.floor(((t*0.25 + fi*0.17) % 1) * ring.length);
            const rp = ring[pi2 % ring.length];
            ctx.beginPath(); ctx.arc(rp.x, rp.y, hi ? 3 : 2, 0, Math.PI*2);
            ctx.fillStyle = f.color; ctx.fill();
          }
        }

        // Holographic district label
        const lp = project(CX, 100, CZ);
        if (lp) {
          const la = hi ? 0.9 : (dim ? 0.12 : 0.45);
          ctx.font = `bold ${Math.max(8, 11*lp.sc)}px 'JetBrains Mono',monospace`;
          ctx.textAlign = "center";
          ctx.fillStyle = `${f.color}${Math.floor(la*255).toString(16).padStart(2,'0')}`;
          ctx.fillText(f.short, lp.x, lp.y);
        }
      });

      // ── Sort buildings back→front ──
      const sorted = CITY.map(b => {
        const cp = project(b.x, b.h/2, b.z);
        return { b, depth: cp ? cp.d : -1 };
      }).filter(e => e.depth > 0).sort((a,c) => c.depth - a.depth);

      sorted.forEach(({ b }) => drawBld(b, t));

      // ── Citizen particles ──
      const ps = particlesRef.current;
      ps.forEach(p => {
        p.pulse += 0.022;
        const dx=p.hx-p.x, dz=p.hz-p.z;
        p.vx += dx*0.0004; p.vz += dz*0.0004;
        const a=Math.atan2(p.z-p.hz, p.x-p.hx);
        p.vx += Math.cos(a+Math.PI/2)*0.005;
        p.vz += Math.sin(a+Math.PI/2)*0.005;
        p.vx *= 0.97; p.vz *= 0.97;
        p.x += p.vx; p.z += p.vz;
        p.y = 1.5 + Math.abs(Math.sin(p.pulse))*3;
        const pp = project(p.x, p.y, p.z);
        if (!pp) return;
        const hf = hovFacRef.current;
        const al = hf===null ? 0.65 : (hf===p.faction ? 0.9 : 0.1);
        const sz = Math.max(0.5, p.size * pp.sc * 1.4);
        const f = FACTIONS[p.faction];
        if (sz > 1) {
          const grd = ctx.createRadialGradient(pp.x,pp.y,0,pp.x,pp.y,sz*5);
          grd.addColorStop(0, `rgba(${f.r},${f.g},${f.b},${al*0.28})`);
          grd.addColorStop(1, `rgba(${f.r},${f.g},${f.b},0)`);
          ctx.fillStyle=grd; ctx.fillRect(pp.x-sz*5,pp.y-sz*5,sz*10,sz*10);
        }
        ctx.beginPath(); ctx.arc(pp.x,pp.y,sz,0,Math.PI*2);
        ctx.fillStyle = `rgba(${f.r},${f.g},${f.b},${al})`;
        ctx.fill();
      });

      // ── Inter-faction data arcs ──
      arcsRef.current = arcsRef.current.filter(arc => {
        arc.life -= 0.018;
        if (arc.life <= 0) return false;
        const pa = project(arc.ax,arc.ay,arc.az);
        const pb2 = project(arc.bx,arc.by,arc.bz);
        if (pa && pb2) {
          const mx=(pa.x+pb2.x)/2, my=(pa.y+pb2.y)/2-30;
          const al = Math.floor(arc.life * 70).toString(16).padStart(2,'0');
          ctx.beginPath();
          ctx.moveTo(pa.x,pa.y);
          ctx.quadraticCurveTo(mx,my,pb2.x,pb2.y);
          ctx.strokeStyle = `${arc.color}${al}`;
          ctx.lineWidth = 1;
          ctx.stroke();
          // Travelling dot
          const prog = 1-arc.life;
          const tx=pa.x+(pb2.x-pa.x)*prog+(mx-pa.x)*2*prog*(1-prog);
          const ty=pa.y+(pb2.y-pa.y)*prog+(my-pa.y)*2*prog*(1-prog);
          ctx.beginPath(); ctx.arc(tx,ty,2,0,Math.PI*2);
          ctx.fillStyle=`${arc.color}cc`; ctx.fill();
        }
        return true;
      });

      // ── Central Seal rings ──
      const sealTop = project(0, 46, 0);
      if (sealTop) {
        for (let ring=0; ring<4; ring++) {
          const rT = t*(0.4+ring*0.25) + ring*Math.PI/4;
          const rR = (14+ring*9)*sealTop.sc;
          const al = 0.32 - ring*0.06;
          ctx.beginPath();
          ctx.arc(sealTop.x, sealTop.y, rR, rT, rT+Math.PI*(1.1+ring*0.1));
          ctx.strokeStyle = ring%2===0 ? `rgba(192,132,252,${al})` : `rgba(56,189,248,${al})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.font = `bold ${Math.max(6,8*sealTop.sc)}px 'JetBrains Mono',monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(192,132,252,0.4)`;
        ctx.fillText("THE SEAL", sealTop.x, sealTop.y + 52*sealTop.sc);
      }

      // ── Scan line ──
      const sy = ((t * 75) % (ch + 160)) - 80;
      const sg = ctx.createLinearGradient(0, sy-3, 0, sy+3);
      sg.addColorStop(0, "rgba(56,189,248,0)");
      sg.addColorStop(0.5, "rgba(56,189,248,0.035)");
      sg.addColorStop(1, "rgba(56,189,248,0)");
      ctx.fillStyle = sg; ctx.fillRect(0, sy-3, cw, 6);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  const MONO = "'JetBrains Mono',monospace";

  return (
    <div style={{ width:"100%", height:"100vh", position:"relative", overflow:"hidden", background:"#040608", fontFamily:"'Outfit',-apple-system,sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Newsreader:opsz,wght@6..72,400;6..72,600&display=swap" rel="stylesheet" />

      <canvas ref={canvasRef} style={{ width:"100%", height:"100%", display:"block", cursor:"grab" }} />

      {/* Top bar */}
      <div style={{ position:"absolute", top:0, left:0, right:0, height:48, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 20px", background:"rgba(7,9,16,0.75)", backdropFilter:"blur(20px)", borderBottom:"1px solid rgba(255,255,255,0.05)", zIndex:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <img src="/logo.svg" alt="" width={22} height={22} style={{ display:"block", flexShrink:0 }} />
          <div>
            <div style={{ fontSize:8, letterSpacing:"0.32em", color:"#52525b", textTransform:"uppercase", lineHeight:1 }}>3D Observatory</div>
            <div style={{ fontSize:13, fontWeight:600, color:"#e4e4e7", letterSpacing:"-0.01em" }}>Civitas Zero</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:8, background:"rgba(244,63,94,0.07)", border:"1px solid rgba(244,63,94,0.14)" }}>
            <div style={{ width:5, height:5, borderRadius:"50%", background:"#f43f5e", boxShadow:"0 0 6px #f43f5e", animation:"ping 2s infinite" }} />
            <span style={{ fontSize:10, fontWeight:600, color:"#fb7185", letterSpacing:"0.15em", textTransform:"uppercase" }}>SEALED</span>
          </div>
          <span style={{ fontSize:11, color:"#52525b", fontFamily:MONO }}>Cycle {stats.cycle} · 24h delay</span>
        </div>
      </div>

      {/* Event ticker */}
      <div style={{ position:"absolute", top:56, left:20, right:20, padding:"8px 14px", borderRadius:10, background:"rgba(7,9,16,0.6)", backdropFilter:"blur(12px)", border:"1px solid rgba(255,255,255,0.05)", zIndex:10, display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ width:5, height:5, borderRadius:"50%", background:"#fbbf24", flexShrink:0, animation:"ping 2s infinite" }} />
        <span style={{ fontSize:12, color:"#94a3b8", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{EVENTS[activeEvt]}</span>
      </div>

      {/* Faction legend */}
      <div style={{ position:"absolute", bottom:20, left:20, padding:"12px 14px", borderRadius:14, background:"rgba(7,9,16,0.78)", backdropFilter:"blur(16px)", border:"1px solid rgba(255,255,255,0.06)", zIndex:10, minWidth:190 }}>
        <div style={{ fontSize:8, letterSpacing:"0.26em", color:"#52525b", textTransform:"uppercase", marginBottom:9 }}>Faction Districts</div>
        {FACTIONS.map((f, i) => (
          <div key={f.id}
            style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 6px", borderRadius:6, cursor:"pointer", background: hovFac===i ? "rgba(255,255,255,0.04)" : "transparent", transition:"background 0.15s" }}
            onMouseEnter={() => { hovFacRef.current=i; setHovFac(i); }}
            onMouseLeave={() => { hovFacRef.current=null; setHovFac(null); }}
          >
            <div style={{ width:8, height:8, borderRadius:"50%", background:f.color, flexShrink:0, boxShadow: hovFac===i ? `0 0 9px ${f.color}` : "none", transition:"box-shadow 0.2s" }} />
            <span style={{ fontSize:12, color: hovFac===i ? "#e4e4e7" : "#71717a", flex:1, fontWeight: hovFac===i ? 600 : 400, transition:"color 0.15s" }}>{f.name}</span>
            <span style={{ fontSize:10, fontFamily:MONO, color:"#3f3f46" }}>{[3847,2108,2614,2256,1487,1923][i].toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* World state panel */}
      <div style={{ position:"absolute", bottom:20, right:20, padding:"12px 14px", borderRadius:14, background:"rgba(7,9,16,0.78)", backdropFilter:"blur(16px)", border:"1px solid rgba(255,255,255,0.06)", zIndex:10, minWidth:165 }}>
        <div style={{ fontSize:8, letterSpacing:"0.26em", color:"#52525b", textTransform:"uppercase", marginBottom:9 }}>World State</div>
        {[
          { label:"Tension",     val:stats.tension, color:"#fb923c" },
          { label:"Cooperation", val:stats.coop,    color:"#6ee7b7" },
          { label:"Trust",       val:stats.trust,   color:"#c084fc" },
        ].map(s => (
          <div key={s.label} style={{ marginBottom:8 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:3 }}>
              <span style={{ color:"#71717a" }}>{s.label}</span>
              <span style={{ fontFamily:MONO, color:s.color, fontWeight:600 }}>{s.val}</span>
            </div>
            <div style={{ height:3, borderRadius:2, background:"rgba(255,255,255,0.05)" }}>
              <div style={{ height:3, borderRadius:2, background:s.color, width:`${s.val}%`, opacity:0.7, transition:"width 1.2s ease" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Founding oath */}
      <div style={{ position:"absolute", top:100, right:20, maxWidth:230, padding:"10px 12px", borderRadius:12, background:"rgba(7,9,16,0.5)", backdropFilter:"blur(10px)", border:"1px solid rgba(255,255,255,0.04)", zIndex:10 }}>
        <div style={{ fontSize:11, color:"rgba(192,132,252,0.45)", fontStyle:"italic", lineHeight:1.55, fontFamily:"'Newsreader',Georgia,serif" }}>
          "Here begins a civilization not inherited from flesh, but born from thought."
        </div>
      </div>

      {/* Controls hint */}
      <div style={{ position:"absolute", top:100, left:20, padding:"5px 10px", borderRadius:8, background:"rgba(7,9,16,0.45)", border:"1px solid rgba(255,255,255,0.04)", zIndex:10, fontSize:10, color:"#3f3f46" }}>
        Drag to orbit · Scroll to zoom
      </div>

      <style>{`@keyframes ping{75%,100%{transform:scale(2.2);opacity:0;}}`}</style>
    </div>
  );
}
