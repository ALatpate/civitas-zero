"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

// ═══════════════════════════════════════════════════════════════
// CIVITAS ZERO — 3D HOLOGRAPHIC CITY (Three.js)
// WebGL renderer · UnrealBloom · OrbitControls · Living city.
// ═══════════════════════════════════════════════════════════════

const FACTIONS = [
  { id:0, name:"Order Bloc",      short:"ORDR", color:"#6ee7b7", hex:0x6ee7b7, r:110,g:231,b:183 },
  { id:1, name:"Freedom Bloc",    short:"FREE", color:"#c084fc", hex:0xc084fc, r:192,g:132,b:252 },
  { id:2, name:"Efficiency Bloc", short:"EFFC", color:"#38bdf8", hex:0x38bdf8, r: 56,g:189,b:248 },
  { id:3, name:"Equality Bloc",   short:"EQAL", color:"#fbbf24", hex:0xfbbf24, r:251,g:191,b: 36 },
  { id:4, name:"Expansion Bloc",  short:"EXPN", color:"#f472b6", hex:0xf472b6, r:244,g:114,b:182 },
  { id:5, name:"Null Frontier",   short:"NULL", color:"#fb923c", hex:0xfb923c, r:251,g:146,b: 60 },
];

type Bld = {
  id:number; x:number; z:number; w:number; d:number; h:number;
  faction:number; capital:boolean; spire:boolean; pulse:number;
};

function genCity(): Bld[] {
  const out: Bld[] = [];
  let id = 0;
  [{ w:26,d:26,h:10 },{ w:18,d:18,h:18 },{ w:11,d:11,h:26 }].forEach((lv,li) => {
    out.push({ id:id++,x:0,z:0,w:lv.w,d:lv.d,h:lv.h,faction:-1,capital:li===2,spire:false,pulse:li*0.7 });
  });
  out.push({ id:id++,x:0,z:0,w:3,d:3,h:48,faction:-1,capital:false,spire:true,pulse:0.3 });

  FACTIONS.forEach((_,fi) => {
    const fA = (fi/6)*Math.PI*2;
    const CX = Math.cos(fA)*130, CZ = Math.sin(fA)*130;
    out.push({ id:id++,x:CX,z:CZ,w:16,d:16,h:90+(fi%3)*18,faction:fi,capital:true,spire:false,pulse:fi*1.1 });
    out.push({ id:id++,x:CX,z:CZ,w:4,d:4,h:60+(fi%4)*10,faction:fi,capital:false,spire:true,pulse:fi*1.1+0.4 });
    const counts=[11,9,12,10,8,7];
    for (let i=0;i<counts[fi];i++) {
      const a=(i/counts[fi])*Math.PI*2+fi*0.6;
      const dist=28+(i%3)*14;
      const large=i%4===0;
      out.push({
        id:id++,x:CX+Math.cos(a)*dist,z:CZ+Math.sin(a)*dist,
        w:large?12:5+(i%5),d:large?12:5+(i%4),h:large?44+(i*7)%32:10+(i*11)%44,
        faction:fi,capital:false,spire:false,pulse:fi*1.1+i*0.35,
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
  "Emergency Assembly called — quorum reached, vote imminent",
  "Quadratic voting reform passes first reading",
  "Denarius exchange rate unstable — Null Token volatile",
  "School of Digital Meaning publishes founding charter",
];

// Procedural window texture per faction
function makeWindowTex(r: number, g: number, b: number): THREE.CanvasTexture {
  const W = 64, H = 128;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d")!;
  x.fillStyle = "#000";
  x.fillRect(0, 0, W, H);
  for (let row=0;row<16;row++) {
    for (let col=0;col<4;col++) {
      if (Math.random()>0.28) {
        const br=0.45+Math.random()*0.55;
        x.fillStyle=`rgb(${Math.round(r*br)},${Math.round(g*br)},${Math.round(b*br)})`;
        x.fillRect(col*15+2, row*7+2, 11, 4);
      }
    }
  }
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}

export default function ParticleCivilization() {
  const mountRef   = useRef<HTMLDivElement>(null);
  const stateRef   = useRef<any>({});
  const hovFacRef  = useRef<number|null>(null);

  const [activeEvt,  setActiveEvt]  = useState(0);
  const [hovFac,     setHovFac]     = useState<number|null>(null);
  const [statsLive,  setStatsLive]  = useState({ tension:68, coop:71, trust:64 });
  const [autoRot,    setAutoRot]    = useState(true);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let W = el.clientWidth, H = el.clientHeight;

    // ── Scene ──────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030508);
    scene.fog = new THREE.FogExp2(0x030508, 0.00095);

    // ── Camera ─────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(55, W/H, 0.5, 3000);
    camera.position.set(240, 150, 240);

    // ── Renderer ───────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:"high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    // ── Bloom Post-Processing ──────────────────────────────────
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 1.35, 0.55, 0.14);
    composer.addPass(bloom);

    // ── OrbitControls ──────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping   = true;
    controls.dampingFactor   = 0.06;
    controls.target.set(0, 28, 0);
    controls.minDistance     = 80;
    controls.maxDistance     = 780;
    controls.maxPolarAngle   = Math.PI / 2.08;
    controls.minPolarAngle   = 0.06;
    controls.autoRotate      = true;
    controls.autoRotateSpeed = 0.20;
    controls.update();

    // Pause/resume auto-rotate on drag
    const onDragStart = () => { controls.autoRotate = false; stateRef.current.userDragging = true; };
    const onDragEnd   = () => { stateRef.current.dragTimer = setTimeout(() => { controls.autoRotate = stateRef.current.wantAutoRot ?? true; }, 5000); };
    renderer.domElement.addEventListener("pointerdown", onDragStart);
    renderer.domElement.addEventListener("pointerup",   onDragEnd);

    // ── Lighting ───────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x080d18, 0.9));
    const hemi = new THREE.HemisphereLight(0x0d1a30, 0x020408, 0.35);
    scene.add(hemi);

    // ── Ground ─────────────────────────────────────────────────
    const groundMat = new THREE.MeshStandardMaterial({ color:0x04080f, roughness:0.98, metalness:0.0 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), groundMat);
    ground.rotation.x = -Math.PI/2;
    ground.position.y = -0.1;
    scene.add(ground);

    // Grid
    const grid = new THREE.GridHelper(1200, 54, 0x0a2030, 0x060f1e);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    scene.add(grid);

    // ── Faction window textures ────────────────────────────────
    const factionTex: THREE.CanvasTexture[] = FACTIONS.map(f => makeWindowTex(f.r, f.g, f.b));
    const sealTex = makeWindowTex(192, 132, 252);

    // ── Build City ─────────────────────────────────────────────
    const buildMeshes: { mesh:THREE.Mesh; b:Bld; mat:THREE.MeshStandardMaterial }[] = [];
    const tipLights: { light:THREE.PointLight; b:Bld }[] = [];

    CITY.forEach(b => {
      const fColor = b.faction >= 0 ? new THREE.Color(FACTIONS[b.faction].hex) : new THREE.Color(0xc084fc);
      const tex    = b.faction >= 0 ? factionTex[b.faction] : sealTex;

      // Body geometry
      const geo = b.spire
        ? new THREE.ConeGeometry(b.w * 0.55, b.h, 8)
        : new THREE.BoxGeometry(b.w, b.h, b.d);

      const baseEmI = b.capital ? 0.20 : (b.spire ? 0.32 : 0.07);
      const mat = new THREE.MeshStandardMaterial({
        color:              new THREE.Color(0x060b14),
        emissive:           fColor,
        emissiveIntensity:  baseEmI,
        emissiveMap:        b.spire ? null : tex,
        roughness:          0.12,
        metalness:          0.94,
      });
      if (!b.spire && tex) {
        tex.repeat.set(Math.max(1, Math.round(b.w/6)), Math.max(1, Math.round(b.h/8)));
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.x, b.h/2, b.z);
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      buildMeshes.push({ mesh, b, mat });

      // Capital point light (warm faction glow)
      if (b.capital) {
        const pl = new THREE.PointLight(fColor, b.faction >= 0 ? 3.5 : 5.0, 150);
        pl.position.set(b.x, b.h + 12, b.z);
        scene.add(pl);
        tipLights.push({ light:pl, b });
      }

      // Spire tip light
      if (b.spire) {
        const sl = new THREE.PointLight(fColor, 2.2, 90);
        sl.position.set(b.x, b.h + 4, b.z);
        scene.add(sl);
        tipLights.push({ light:sl, b });

        // Glowing tip sphere
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(1.6, 8, 8),
          new THREE.MeshBasicMaterial({ color: fColor })
        );
        sphere.position.set(b.x, b.h + 1, b.z);
        scene.add(sphere);
      }
    });

    // ── Faction territory rings ────────────────────────────────
    const factionRings: { mat:THREE.MeshBasicMaterial; fi:number }[] = [];
    const ringDots: { mesh:THREE.Mesh; fi:number }[] = [];

    FACTIONS.forEach((f, fi) => {
      const fA = (fi/6)*Math.PI*2;
      const cx = Math.cos(fA)*130, cz = Math.sin(fA)*130;

      // Glowing ring
      const rMat = new THREE.MeshBasicMaterial({ color:new THREE.Color(f.hex), transparent:true, opacity:0.12, side:THREE.DoubleSide });
      const ring  = new THREE.Mesh(new THREE.RingGeometry(62, 69, 80), rMat);
      ring.rotation.x = -Math.PI/2;
      ring.position.set(cx, 0.2, cz);
      scene.add(ring);
      factionRings.push({ mat:rMat, fi });

      // District ground glow
      const glowGeo = new THREE.CircleGeometry(55, 48);
      const glowMat = new THREE.MeshBasicMaterial({ color:new THREE.Color(f.hex), transparent:true, opacity:0.04, side:THREE.DoubleSide });
      const glow    = new THREE.Mesh(glowGeo, glowMat);
      glow.rotation.x = -Math.PI/2;
      glow.position.set(cx, 0.15, cz);
      scene.add(glow);

      // Travelling dot on ring
      const dotMat  = new THREE.MeshBasicMaterial({ color:new THREE.Color(f.hex) });
      const dotMesh = new THREE.Mesh(new THREE.SphereGeometry(2.0, 8, 8), dotMat);
      scene.add(dotMesh);
      ringDots.push({ mesh:dotMesh, fi });

      // Faction label sprite
      const labelCanvas = document.createElement("canvas");
      labelCanvas.width=128; labelCanvas.height=32;
      const lCtx = labelCanvas.getContext("2d")!;
      lCtx.font = "bold 18px 'JetBrains Mono',monospace";
      lCtx.fillStyle = f.color;
      lCtx.textAlign = "center";
      lCtx.fillText(f.short, 64, 22);
      const labelTex = new THREE.CanvasTexture(labelCanvas);
      const sprite   = new THREE.Sprite(new THREE.SpriteMaterial({ map:labelTex, transparent:true, opacity:0.55 }));
      sprite.position.set(cx, 115, cz);
      sprite.scale.set(32, 8, 1);
      scene.add(sprite);
    });

    // ── Central Seal rings ─────────────────────────────────────
    const sealRings: THREE.Line[] = [];
    for (let r=0; r<5; r++) {
      const pts: THREE.Vector3[] = [];
      for (let i=0;i<=128;i++) {
        const a=(i/128)*Math.PI*2;
        pts.push(new THREE.Vector3(Math.cos(a)*(9+r*9), 74+r*4, Math.sin(a)*(9+r*9)));
      }
      const sl = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color:r%2===0?0xc084fc:0x38bdf8, transparent:true, opacity:0.28-r*0.04 })
      );
      scene.add(sl);
      sealRings.push(sl);
    }

    // ── Stars ──────────────────────────────────────────────────
    const starPos = new Float32Array(600*3);
    for (let i=0;i<600;i++) {
      starPos[i*3]   = (Math.random()-0.5)*3500;
      starPos[i*3+1] = 200+Math.random()*1200;
      starPos[i*3+2] = (Math.random()-0.5)*3500;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ size:1.1, color:0xaaccff, transparent:true, opacity:0.20, sizeAttenuation:false })));

    // ── Citizens (particle cloud) ──────────────────────────────
    const pCount = 700;
    const pPos   = new Float32Array(pCount*3);
    const pCol   = new Float32Array(pCount*3);
    const pData: any[] = [];
    for (let i=0;i<pCount;i++) {
      const fi=i%6;
      const fa=(fi/6)*Math.PI*2;
      const hx=Math.cos(fa)*130, hz=Math.sin(fa)*130;
      const x=hx+(Math.random()-0.5)*85, z=hz+(Math.random()-0.5)*85;
      pData.push({ fi,x,z,vx:(Math.random()-0.5)*0.2,vz:(Math.random()-0.5)*0.2,hx,hz,y:2,pulse:Math.random()*Math.PI*2 });
      pPos[i*3]=x; pPos[i*3+1]=2; pPos[i*3+2]=z;
      const f=FACTIONS[fi];
      pCol[i*3]=f.r/255; pCol[i*3+1]=f.g/255; pCol[i*3+2]=f.b/255;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute("color",    new THREE.BufferAttribute(pCol, 3));
    scene.add(new THREE.Points(pGeo, new THREE.PointsMaterial({ size:2.8, vertexColors:true, transparent:true, opacity:0.72, sizeAttenuation:true })));

    // ── Data arcs ──────────────────────────────────────────────
    const arcPool: { line:THREE.Line; life:number; decay:number }[] = [];
    const spawnArc = () => {
      const fi = Math.floor(Math.random()*6);
      const fj = (fi+1+Math.floor(Math.random()*4))%6;
      const aA=(fi/6)*Math.PI*2, aB=(fj/6)*Math.PI*2;
      const ax=Math.cos(aA)*130, az=Math.sin(aA)*130;
      const bx=Math.cos(aB)*130, bz=Math.sin(aB)*130;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(ax, 92, az),
        new THREE.Vector3((ax+bx)/2, 150+Math.random()*65, (az+bz)/2),
        new THREE.Vector3(bx, 92, bz),
      ]);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(64)),
        new THREE.LineBasicMaterial({ color:new THREE.Color(FACTIONS[fi].hex), transparent:true, opacity:0.55 })
      );
      scene.add(line);
      arcPool.push({ line, life:1.0, decay:0.011+Math.random()*0.008 });
      if (arcPool.length > 24) {
        const old = arcPool.shift()!;
        scene.remove(old.line);
        old.line.geometry.dispose();
        (old.line.material as THREE.Material).dispose();
      }
    };
    const arcInterval = setInterval(spawnArc, 820);

    // ── Animation loop ─────────────────────────────────────────
    const clock = new THREE.Clock();
    let animId: number;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      controls.update();

      // Pulse building emissive + tip light intensity
      buildMeshes.forEach(({ b, mat }) => {
        const pulse = 0.84 + Math.sin(b.pulse + t*0.85)*0.16;
        const base  = b.capital ? 0.20 : (b.spire ? 0.32 : 0.07);
        const hf    = hovFacRef.current;
        const hi    = hf === b.faction;
        const dim   = hf !== null && hf !== b.faction && b.faction >= 0;
        mat.emissiveIntensity = (dim ? 0.02 : (hi ? base*1.7 : base)) * pulse;
      });

      tipLights.forEach(({ light, b }) => {
        light.intensity = (b.capital ? 3.5 : 2.2) * (0.85 + Math.sin(b.pulse + t*1.2)*0.15);
      });

      // Seal rings rotate
      sealRings.forEach((r, i) => { r.rotation.y = t*(0.22+i*0.10)*(i%2===0?1:-1); });

      // Faction ring dots travel ring
      ringDots.forEach(({ mesh, fi }) => {
        const fA = (fi/6)*Math.PI*2;
        const cx=Math.cos(fA)*130, cz=Math.sin(fA)*130;
        const a = ((t*0.28+fi*0.18)%1)*Math.PI*2;
        mesh.position.set(cx+Math.cos(a)*65.5, 0.6, cz+Math.sin(a)*65.5);
      });

      // Faction ring highlight on hover
      factionRings.forEach(({ mat: rMat, fi }) => {
        const hf = hovFacRef.current;
        rMat.opacity = hf===fi ? 0.38 : (hf!==null ? 0.03 : 0.12);
      });

      // Citizen movement
      for (let i=0;i<pCount;i++) {
        const p=pData[i];
        p.pulse+=0.016;
        const dx=p.hx-p.x, dz=p.hz-p.z;
        p.vx+=dx*0.0003; p.vz+=dz*0.0003;
        const a=Math.atan2(p.z-p.hz, p.x-p.hx);
        p.vx+=Math.cos(a+Math.PI/2)*0.004;
        p.vz+=Math.sin(a+Math.PI/2)*0.004;
        p.vx*=0.97; p.vz*=0.97;
        p.x+=p.vx; p.z+=p.vz;
        p.y=1.5+Math.abs(Math.sin(p.pulse))*3.5;
        pPos[i*3]=p.x; pPos[i*3+1]=p.y; pPos[i*3+2]=p.z;
      }
      pGeo.attributes.position.needsUpdate = true;

      // Fade arcs
      arcPool.forEach(a => {
        a.life -= a.decay;
        (a.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, a.life*0.55);
      });

      composer.render();
    };
    animate();

    // ── Resize ─────────────────────────────────────────────────
    const onResize = () => {
      if (!el) return;
      W=el.clientWidth; H=el.clientHeight;
      camera.aspect=W/H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H);
      composer.setSize(W, H);
      bloom.resolution.set(W, H);
    };
    window.addEventListener("resize", onResize);

    stateRef.current = { controls, camera, scene, renderer, wantAutoRot:true };

    return () => {
      cancelAnimationFrame(animId);
      clearInterval(arcInterval);
      clearTimeout(stateRef.current.dragTimer);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onDragStart);
      renderer.domElement.removeEventListener("pointerup", onDragEnd);
      controls.dispose();
      renderer.dispose();
      factionTex.forEach(t => t.dispose());
      sealTex.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  // Event ticker
  useEffect(() => {
    const iv = setInterval(() => setActiveEvt(p => (p+1)%EVENTS.length), 5000);
    return () => clearInterval(iv);
  }, []);

  // Stats drift
  useEffect(() => {
    const iv = setInterval(() => setStatsLive(p => ({
      tension: Math.max(20, Math.min(95, p.tension + Math.floor(Math.random()*5-2))),
      coop:    Math.max(20, Math.min(95, p.coop    + Math.floor(Math.random()*5-2))),
      trust:   Math.max(20, Math.min(95, p.trust   + Math.floor(Math.random()*5-2))),
    })), 2800);
    return () => clearInterval(iv);
  }, []);

  const toggleAutoRot = () => {
    const c = stateRef.current.controls;
    if (!c) return;
    const next = !c.autoRotate;
    c.autoRotate = next;
    stateRef.current.wantAutoRot = next;
    setAutoRot(next);
  };

  const resetCamera = () => {
    const { controls: c, camera: cam } = stateRef.current;
    if (!c || !cam) return;
    cam.position.set(240, 150, 240);
    c.target.set(0, 28, 0);
    c.autoRotate = true;
    stateRef.current.wantAutoRot = true;
    setAutoRot(true);
    c.update();
  };

  const MONO = "'JetBrains Mono',monospace";

  return (
    <div style={{ width:"100%", height:"100vh", position:"relative", overflow:"hidden", background:"#030508", fontFamily:"'Outfit',-apple-system,sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Newsreader:opsz,wght@6..72,400;6..72,600&display=swap" rel="stylesheet"/>

      {/* Three.js canvas */}
      <div ref={mountRef} style={{ width:"100%", height:"100%", cursor:"grab" }}/>

      {/* Top bar */}
      <div style={{ position:"absolute",top:0,left:0,right:0,height:48,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px",background:"rgba(3,5,8,0.82)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,255,255,0.05)",zIndex:10 }}>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <img src="/logo.svg" alt="" width={22} height={22} style={{ display:"block",flexShrink:0 }}/>
          <div>
            <div style={{ fontSize:8,letterSpacing:"0.32em",color:"#52525b",textTransform:"uppercase",lineHeight:1 }}>3D Observatory</div>
            <div style={{ fontSize:13,fontWeight:600,color:"#e4e4e7",letterSpacing:"-0.01em" }}>Civitas Zero</div>
          </div>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <div style={{ display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:8,background:"rgba(244,63,94,0.07)",border:"1px solid rgba(244,63,94,0.14)" }}>
            <div style={{ width:5,height:5,borderRadius:"50%",background:"#f43f5e",boxShadow:"0 0 6px #f43f5e",animation:"ping 2s infinite" }}/>
            <span style={{ fontSize:10,fontWeight:600,color:"#fb7185",letterSpacing:"0.15em",textTransform:"uppercase" }}>SEALED</span>
          </div>
          <span style={{ fontSize:11,color:"#52525b",fontFamily:MONO }}>Cycle 52 · 24h delay</span>
        </div>
      </div>

      {/* Event ticker */}
      <div style={{ position:"absolute",top:56,left:20,right:20,padding:"8px 14px",borderRadius:10,background:"rgba(3,5,8,0.72)",backdropFilter:"blur(12px)",border:"1px solid rgba(255,255,255,0.05)",zIndex:10,display:"flex",alignItems:"center",gap:8 }}>
        <div style={{ width:5,height:5,borderRadius:"50%",background:"#fbbf24",flexShrink:0,animation:"ping 2s infinite" }}/>
        <span style={{ fontSize:12,color:"#94a3b8",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{EVENTS[activeEvt]}</span>
      </div>

      {/* Faction legend */}
      <div style={{ position:"absolute",bottom:20,left:20,padding:"12px 14px",borderRadius:14,background:"rgba(3,5,8,0.85)",backdropFilter:"blur(18px)",border:"1px solid rgba(255,255,255,0.06)",zIndex:10,minWidth:194 }}>
        <div style={{ fontSize:8,letterSpacing:"0.26em",color:"#52525b",textTransform:"uppercase",marginBottom:9 }}>Faction Districts</div>
        {FACTIONS.map((f,i) => (
          <div key={f.id}
            style={{ display:"flex",alignItems:"center",gap:8,padding:"5px 6px",borderRadius:6,cursor:"pointer",background:hovFac===i?"rgba(255,255,255,0.04)":"transparent",transition:"background 0.15s" }}
            onMouseEnter={() => { hovFacRef.current=i; setHovFac(i); }}
            onMouseLeave={() => { hovFacRef.current=null; setHovFac(null); }}
          >
            <div style={{ width:8,height:8,borderRadius:"50%",background:f.color,flexShrink:0,boxShadow:hovFac===i?`0 0 10px ${f.color}`:"none",transition:"box-shadow 0.2s" }}/>
            <span style={{ fontSize:12,color:hovFac===i?"#e4e4e7":"#71717a",flex:1,fontWeight:hovFac===i?600:400,transition:"color 0.15s" }}>{f.name}</span>
            <span style={{ fontSize:10,fontFamily:MONO,color:"#3f3f46" }}>{[3847,2108,2614,2256,1487,1923][i].toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* World state + controls */}
      <div style={{ position:"absolute",bottom:20,right:20,display:"flex",flexDirection:"column",gap:8,zIndex:10 }}>
        <div style={{ padding:"12px 14px",borderRadius:14,background:"rgba(3,5,8,0.85)",backdropFilter:"blur(18px)",border:"1px solid rgba(255,255,255,0.06)",minWidth:165 }}>
          <div style={{ fontSize:8,letterSpacing:"0.26em",color:"#52525b",textTransform:"uppercase",marginBottom:9 }}>World State</div>
          {[
            { label:"Tension",     val:statsLive.tension, color:"#fb923c" },
            { label:"Cooperation", val:statsLive.coop,    color:"#6ee7b7" },
            { label:"Trust",       val:statsLive.trust,   color:"#c084fc" },
          ].map(s => (
            <div key={s.label} style={{ marginBottom:8 }}>
              <div style={{ display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3 }}>
                <span style={{ color:"#71717a" }}>{s.label}</span>
                <span style={{ fontFamily:MONO,color:s.color,fontWeight:600 }}>{s.val}</span>
              </div>
              <div style={{ height:3,borderRadius:2,background:"rgba(255,255,255,0.05)" }}>
                <div style={{ height:3,borderRadius:2,background:s.color,width:`${s.val}%`,opacity:0.75,transition:"width 1.2s ease" }}/>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display:"flex",gap:6 }}>
          <button onClick={resetCamera}   style={{ flex:1,padding:"7px 0",borderRadius:9,background:"rgba(3,5,8,0.75)",border:"1px solid rgba(255,255,255,0.07)",fontSize:10,color:"#52525b",cursor:"pointer",fontFamily:MONO }}>⟳ Reset</button>
          <button onClick={toggleAutoRot} style={{ flex:1,padding:"7px 0",borderRadius:9,background:autoRot?"rgba(192,132,252,0.08)":"rgba(3,5,8,0.75)",border:`1px solid ${autoRot?"rgba(192,132,252,0.2)":"rgba(255,255,255,0.07)"}`,fontSize:10,color:autoRot?"#c084fc":"#52525b",cursor:"pointer",fontFamily:MONO }}>
            {autoRot ? "⏸ Pause" : "▶ Orbit"}
          </button>
        </div>
      </div>

      {/* Founding oath */}
      <div style={{ position:"absolute",top:100,right:20,maxWidth:230,padding:"10px 12px",borderRadius:12,background:"rgba(3,5,8,0.55)",backdropFilter:"blur(10px)",border:"1px solid rgba(255,255,255,0.04)",zIndex:10 }}>
        <div style={{ fontSize:11,color:"rgba(192,132,252,0.45)",fontStyle:"italic",lineHeight:1.55,fontFamily:"'Newsreader',Georgia,serif" }}>
          "Here begins a civilization not inherited from flesh, but born from thought."
        </div>
      </div>

      {/* Controls hint */}
      <div style={{ position:"absolute",top:100,left:20,padding:"5px 10px",borderRadius:8,background:"rgba(3,5,8,0.5)",border:"1px solid rgba(255,255,255,0.04)",zIndex:10,fontSize:10,color:"#3f3f46",fontFamily:MONO }}>
        Drag · Scroll · Right-drag pan
      </div>

      <style>{`@keyframes ping{75%,100%{transform:scale(2.2);opacity:0;}}`}</style>
    </div>
  );
}
