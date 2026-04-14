// @ts-nocheck
'use client';
// ── /world3d — Civitas Zero 3D Open World ───────────────────────────────────
// Realistic procedural landscape — NO custom GLSL shaders for max compat.
// Uses only Three.js built-in materials and geometries.

import { useEffect, useRef, useState, useCallback } from 'react';

const FACTION_COLORS_HEX: Record<string, string> = {
  f1: '#6ee7b7', f2: '#c084fc', f3: '#38bdf8',
  f4: '#fbbf24', f5: '#f472b6', f6: '#fb923c',
};
const FACTION_COLORS: Record<string, number> = {
  f1: 0x6ee7b7, f2: 0xc084fc, f3: 0x38bdf8,
  f4: 0xfbbf24, f5: 0xf472b6, f6: 0xfb923c,
};
const FACTION_LABELS: Record<string, string> = {
  f1: 'Order Bloc', f2: 'Freedom Bloc', f3: 'Efficiency Bloc',
  f4: 'Equality Bloc', f5: 'Expansion Bloc', f6: 'Null Frontier',
};

// Hexagonal ring positions for 6 districts
const DISTRICT_POSITIONS = [
  { angle: 0, dist: 90 },
  { angle: Math.PI / 3, dist: 90 },
  { angle: (2 * Math.PI) / 3, dist: 90 },
  { angle: Math.PI, dist: 90 },
  { angle: (4 * Math.PI) / 3, dist: 90 },
  { angle: (5 * Math.PI) / 3, dist: 90 },
];

// ── Perlin noise ────────────────────────────────────────────────────────────
function makeNoise() {
  const P = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
  const p = new Uint8Array(512);
  for (let i = 0; i < 256; i++) { p[i] = P[i]; p[i+256] = P[i]; }
  const fade = (t: number) => t*t*t*(t*(t*6-15)+10);
  const lerp = (a: number, b: number, t: number) => a + t*(b-a);
  const grad = (h: number, x: number, y: number) => { const v = h&3; return ((v&1)?-x:x)+((v&2)?-y:y); };
  return (x: number, y: number) => {
    const X = Math.floor(x)&255, Y = Math.floor(y)&255;
    const xf = x-Math.floor(x), yf = y-Math.floor(y);
    const u = fade(xf), v = fade(yf);
    return lerp(lerp(grad(p[p[X]+Y],xf,yf), grad(p[p[X+1]+Y],xf-1,yf), u),
                lerp(grad(p[p[X]+Y+1],xf,yf-1), grad(p[p[X+1]+Y+1],xf-1,yf-1), u), v);
  };
}

function seededRNG(s: number) { return () => { s=(s*16807)%2147483647; return (s-1)/2147483646; }; }
function darken(c: number, f: number) { return (Math.floor(((c>>16)&0xff)*f)<<16)|(Math.floor(((c>>8)&0xff)*f)<<8)|Math.floor((c&0xff)*f); }
function lighten(c: number, f: number) { return (Math.min(255,Math.floor(((c>>16)&0xff)*f))<<16)|(Math.min(255,Math.floor(((c>>8)&0xff)*f))<<8)|Math.min(255,Math.floor((c&0xff)*f)); }

export default function World3DPage() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [districts, setDistricts] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [recentBuildings, setRecentBuildings] = useState<any[]>([]);
  const [adCampaigns, setAdCampaigns] = useState<any[]>([]);
  const [natureData, setNatureData] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ districts: 0, buildings: 0, agents: 0 });
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [worldRes, citizensRes, adsRes, natureRes] = await Promise.allSettled([
        fetch('/api/world/districts').then(r => r.json()),
        fetch('/api/world/live-data?section=citizens').then(r => r.json()),
        fetch('/api/ads?type=campaigns&status=active&limit=30').then(r => r.json()),
        fetch('/api/nature?layer=all').then(r => r.json()),
      ]);
      const world = worldRes.status === 'fulfilled' ? worldRes.value : { districts: [], recent_buildings: [] };
      const citizenData = citizensRes.status === 'fulfilled' ? citizensRes.value : { citizens: [] };

      let districtList = world.districts || [];
      if (districtList.length === 0) {
        const factions = ['f1','f2','f3','f4','f5','f6'];
        districtList = factions.map((f, i) => {
          const pos = DISTRICT_POSITIONS[i];
          return {
            id: `dist-${f}`, name: FACTION_LABELS[f], faction: f,
            center_x: Math.cos(pos.angle) * pos.dist,
            center_z: Math.sin(pos.angle) * pos.dist,
            radius: 32, prosperity: 50 + Math.floor(Math.random()*40),
            specialty: ['Governance','Philosophy','Technology','Equality','Expansion','Autonomy'][i],
            description: `${FACTION_LABELS[f]} district headquarters`,
            buildings: Array.from({length: 6+Math.floor(Math.random()*6)}, (_,j) => ({
              id: `${f}-bld-${j}`, name: `Building ${j+1}`,
              building_type: j===0?'headquarters':j===1?'monument':j===2?'tower':['office','lab','market','archive','academy','residential'][j%6],
              height: j===0?10:j===1?7:j===2?12:3+Math.floor(Math.random()*7),
              pos_x: (Math.random()-0.5)*45, pos_z: (Math.random()-0.5)*45,
              built_by: 'SYSTEM', faction: f,
            })),
          };
        });
      }

      // Ensure all districts have valid positions
      const factionKeys = ['f1','f2','f3','f4','f5','f6'];
      districtList = districtList.map((d: any, i: number) => {
        if (!d.center_x && d.center_x !== 0 || !d.center_z && d.center_z !== 0
            || (d.center_x === 0 && d.center_z === 0)) {
          const pos = DISTRICT_POSITIONS[i % 6];
          d = { ...d, center_x: Math.cos(pos.angle)*pos.dist, center_z: Math.sin(pos.angle)*pos.dist };
        }
        if (!d.radius) d = { ...d, radius: 32 };
        if (!d.faction) d = { ...d, faction: factionKeys[i%6] };
        // Ensure buildings array
        if (!d.buildings || !Array.isArray(d.buildings)) d = { ...d, buildings: [] };
        return d;
      });

      setDistricts(districtList);
      setRecentBuildings(world.recent_buildings || []);
      const agentList = (citizenData.citizens || []).slice(0, 40);
      setAgents(agentList);
      setStats({
        districts: districtList.length,
        buildings: districtList.reduce((a: number, d: any) => a + (d.buildings?.length || 0), 0),
        agents: agentList.length,
      });
      const adsData = adsRes.status === 'fulfilled' ? adsRes.value : { campaigns: [] };
      setAdCampaigns((adsData.campaigns || []).slice(0, 12));
      const nature = natureRes.status === 'fulfilled' ? natureRes.value : null;
      if (nature) setNatureData(nature);
    } catch (err: any) {
      console.error('[Civitas] fetch error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, []);

  // ── Three.js scene ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || districts.length === 0) return;

    const container = canvasRef.current;
    let animId: number;
    let destroyed = false;
    const noise = makeNoise();

    // Height function for terrain
    function terrainH(x: number, z: number): number {
      let h = noise(x*0.007, z*0.007) * 15
            + noise(x*0.02, z*0.02) * 5
            + noise(x*0.05, z*0.05) * 1.5;
      // Flatten center plaza
      const dc = Math.sqrt(x*x + z*z);
      if (dc < 22) h *= dc / 22;
      // Flatten district plateaus
      for (const d of districts) {
        const dd = Math.sqrt((x-d.center_x)**2 + (z-d.center_z)**2);
        const r = (d.radius || 32) * 0.7;
        if (dd < r) {
          const f = 1 - (dd/r)**2;
          const ph = 2.5 + noise(d.center_x*0.01, d.center_z*0.01) * 1.5;
          h = h * (1-f) + ph * f;
        }
      }
      // River valley
      const riverX = Math.sin(z*0.015)*35 + Math.sin(z*0.005)*18;
      const rd = Math.abs(x - riverX);
      if (rd < 10) h -= (1 - rd/10) * 3.5;
      return h;
    }

    async function init() {
      const THREE = await import('three');

      // ── Renderer ──
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      container.appendChild(renderer.domElement);

      // ── Scene ──
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1e3a5f);
      scene.fog = new THREE.FogExp2(0x607090, 0.0015);

      // ── Camera ──
      const camera = new THREE.PerspectiveCamera(50, container.clientWidth/container.clientHeight, 1, 1000);
      let camTheta = Math.PI/4, camPhi = Math.PI/3.5, camR = 200;
      const camTarget = new THREE.Vector3(0, 8, 0);
      function updateCam() {
        camera.position.set(
          camTarget.x + camR * Math.sin(camPhi) * Math.sin(camTheta),
          camTarget.y + camR * Math.cos(camPhi),
          camTarget.z + camR * Math.sin(camPhi) * Math.cos(camTheta),
        );
        camera.lookAt(camTarget);
      }
      updateCam();

      // ── Lighting ──
      const sun = new THREE.DirectionalLight(0xfffde8, 1.8);
      sun.position.set(100, 150, 80);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -250; sun.shadow.camera.right = 250;
      sun.shadow.camera.top = 250; sun.shadow.camera.bottom = -250;
      sun.shadow.camera.far = 500;
      sun.shadow.bias = -0.001;
      scene.add(sun);

      const ambient = new THREE.AmbientLight(0x4466aa, 0.4);
      scene.add(ambient);
      const hemi = new THREE.HemisphereLight(0x87ceeb, 0x362e1a, 0.35);
      scene.add(hemi);

      // ── Terrain ──
      const SIZE = 450, SEGS = 150;
      const tGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
      tGeo.rotateX(-Math.PI / 2);
      const pos = tGeo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const h = terrainH(x, z);
        pos.setY(i, h);
        // Color by height
        let r, g, b;
        if (h < -1) { r=0.15; g=0.13; b=0.09; }
        else if (h < 1.5) { r=0.12+noise(x*0.1,z*0.1)*0.04; g=0.28+noise(x*0.08,z*0.08)*0.07; b=0.08; }
        else if (h < 6) { r=0.16; g=0.26+noise(x*0.05,z*0.05)*0.06; b=0.07; }
        else if (h < 12) { r=0.22; g=0.19; b=0.11; }
        else { r=0.32; g=0.30; b=0.26; }
        colors[i*3]=r; colors[i*3+1]=g; colors[i*3+2]=b;
      }
      tGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      tGeo.computeVertexNormals();
      const terrain = new THREE.Mesh(tGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.02 }));
      terrain.receiveShadow = true;
      scene.add(terrain);

      // ── Animated River ──
      // Build river mesh following the valley carved in terrainH
      const RIVER_SEGS = 80;
      const RIVER_WIDTH = 8;
      const riverPositions: number[] = [];
      const riverUvs: number[] = [];
      const riverIndices: number[] = [];
      for (let i = 0; i <= RIVER_SEGS; i++) {
        const z = -SIZE/2 + (i / RIVER_SEGS) * SIZE;
        const centerX = Math.sin(z*0.015)*35 + Math.sin(z*0.005)*18;
        const y = terrainH(centerX, z) - 0.3; // slightly below terrain
        const hw = RIVER_WIDTH / 2;
        // Left and right bank vertices
        riverPositions.push(centerX - hw, Math.max(y, -2.5), z);
        riverPositions.push(centerX + hw, Math.max(y, -2.5), z);
        riverUvs.push(0, i / RIVER_SEGS * 8);
        riverUvs.push(1, i / RIVER_SEGS * 8);
        if (i < RIVER_SEGS) {
          const vi = i * 2;
          riverIndices.push(vi, vi+1, vi+2, vi+1, vi+3, vi+2);
        }
      }
      const riverGeo = new THREE.BufferGeometry();
      riverGeo.setAttribute('position', new THREE.Float32BufferAttribute(riverPositions, 3));
      riverGeo.setAttribute('uv', new THREE.Float32BufferAttribute(riverUvs, 2));
      riverGeo.setIndex(riverIndices);
      riverGeo.computeVertexNormals();
      const riverMat = new THREE.MeshStandardMaterial({
        color: 0x1a6a9e, transparent: true, opacity: 0.7, roughness: 0.05, metalness: 0.6,
        emissive: 0x0a2a4e, emissiveIntensity: 0.1,
      });
      const river = new THREE.Mesh(riverGeo, riverMat);
      scene.add(river);

      // Small lake/ocean at low elevations
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(SIZE, SIZE),
        new THREE.MeshStandardMaterial({ color: 0x0f3a5e, transparent: true, opacity: 0.4, roughness: 0.05, metalness: 0.6 })
      );
      water.rotation.x = -Math.PI/2;
      water.position.y = -2.8;
      scene.add(water);

      // ── Wildlife: Birds ──
      const birdGrp = new THREE.Group();
      const birdRng = seededRNG(555);
      const birdData: {grp:any, cx:number, cz:number, radius:number, speed:number, height:number, phase:number}[] = [];
      for (let b = 0; b < 20; b++) {
        const bird = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({ color: birdRng() > 0.5 ? 0x2a2a2a : 0x8b6914 });
        const body = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.2, 4), bodyMat);
        body.rotation.x = Math.PI / 2;
        bird.add(body);
        // Wings
        const wingMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, side: THREE.DoubleSide });
        const wingL = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.4), wingMat);
        wingL.position.set(-0.8, 0, 0); wingL.userData = { isWing: 'left' }; bird.add(wingL);
        const wingR = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.4), wingMat);
        wingR.position.set(0.8, 0, 0); wingR.userData = { isWing: 'right' }; bird.add(wingR);

        const bcx = (birdRng() - 0.5) * SIZE * 0.7;
        const bcz = (birdRng() - 0.5) * SIZE * 0.7;
        const bh = 35 + birdRng() * 40;
        bird.position.set(bcx, bh, bcz);
        birdGrp.add(bird);
        birdData.push({ grp: bird, cx: bcx, cz: bcz, radius: 15 + birdRng() * 30, speed: 0.3 + birdRng() * 0.4, height: bh, phase: birdRng() * Math.PI * 2 });
      }
      scene.add(birdGrp);

      // ── Wildlife: Ground Animals ──
      const animalGrp = new THREE.Group();
      const animalRng = seededRNG(333);
      const animalData: {mesh:any, walkDir:number, speed:number, homeX:number, homeZ:number, range:number}[] = [];
      for (let a = 0; a < 15; a++) {
        const ax = (animalRng() - 0.5) * SIZE * 0.6;
        const az = (animalRng() - 0.5) * SIZE * 0.6;
        const ah = terrainH(ax, az);
        if (ah < -0.5) continue; // skip water
        let skip = false;
        for (const d of districts) { if (Math.sqrt((ax-d.center_x)**2+(az-d.center_z)**2) < (d.radius||32)*0.8) { skip=true; break; } }
        if (skip) continue;

        const isLarge = animalRng() > 0.5;
        const animalColor = isLarge ? 0x8B4513 : 0x808080;
        const animal = new THREE.Group();
        // Body
        const abody = new THREE.Mesh(new THREE.BoxGeometry(isLarge?1.2:0.6, isLarge?0.8:0.4, isLarge?2:1), new THREE.MeshStandardMaterial({color:animalColor,roughness:0.9}));
        abody.position.y = isLarge?0.8:0.4; animal.add(abody);
        // Head
        const ahead = new THREE.Mesh(new THREE.BoxGeometry(isLarge?0.5:0.3, isLarge?0.5:0.3, isLarge?0.6:0.3), new THREE.MeshStandardMaterial({color:animalColor,roughness:0.9}));
        ahead.position.set(0, isLarge?1.0:0.5, isLarge?1.2:0.6); animal.add(ahead);
        // Legs
        const legMat = new THREE.MeshStandardMaterial({color:darken(animalColor,0.7),roughness:0.9});
        for (const [lx,lz] of [[-.35,-.6],[.35,-.6],[-.35,.6],[.35,.6]]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, isLarge?0.7:0.35, 0.15), legMat);
          leg.position.set(lx*(isLarge?1:0.5), (isLarge?0.35:0.18), lz*(isLarge?1:0.5));
          animal.add(leg);
        }
        animal.position.set(ax, ah+0.1, az);
        animal.castShadow = true;
        animalGrp.add(animal);
        animalData.push({ mesh: animal, walkDir: animalRng()*Math.PI*2, speed: 0.005+animalRng()*0.01, homeX: ax, homeZ: az, range: 20+animalRng()*25 });
      }
      scene.add(animalGrp);

      // ── Firefly/Bug Particles ──
      const fireflyCount = 80;
      const fireflyGeo = new THREE.BufferGeometry();
      const fireflyPos = new Float32Array(fireflyCount * 3);
      const fireflyVel: {vx:number,vy:number,vz:number}[] = [];
      const ffRng = seededRNG(999);
      for (let i = 0; i < fireflyCount; i++) {
        const fx = (ffRng()-0.5)*SIZE*0.6, fz = (ffRng()-0.5)*SIZE*0.6;
        const fh = terrainH(fx, fz);
        fireflyPos[i*3] = fx; fireflyPos[i*3+1] = fh + 1 + ffRng()*3; fireflyPos[i*3+2] = fz;
        fireflyVel.push({ vx: (ffRng()-0.5)*0.03, vy: (ffRng()-0.5)*0.02, vz: (ffRng()-0.5)*0.03 });
      }
      fireflyGeo.setAttribute('position', new THREE.BufferAttribute(fireflyPos, 3));
      const fireflyMat = new THREE.PointsMaterial({ color: 0xaaff44, size: 0.6, sizeAttenuation: true, transparent: true, opacity: 0.8 });
      const fireflies = new THREE.Points(fireflyGeo, fireflyMat);
      scene.add(fireflies);

      // ── Clouds ──
      const cloudGrp = new THREE.Group();
      const rng = seededRNG(777);
      for (let c = 0; c < 25; c++) {
        const cx = (rng()-0.5)*380, cz = (rng()-0.5)*380, cy = 70+rng()*35;
        for (let p = 0; p < 3+Math.floor(rng()*4); p++) {
          const puff = new THREE.Mesh(
            new THREE.SphereGeometry(4+rng()*7, 7, 5),
            new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.3+rng()*0.15 })
          );
          puff.position.set(cx+(rng()-0.5)*12, cy+(rng()-0.5)*2.5, cz+(rng()-0.5)*12);
          puff.scale.y = 0.35;
          cloudGrp.add(puff);
        }
      }
      scene.add(cloudGrp);

      // ── Trees (InstancedMesh for performance) ──
      const treeRng = seededRNG(42);
      const treeData: {x:number,z:number,h:number,s:number,type:string}[] = [];
      for (let t = 0; t < 400; t++) {
        const tx = (treeRng()-0.5)*SIZE*0.85, tz = (treeRng()-0.5)*SIZE*0.85;
        const th = terrainH(tx, tz);
        if (th < -0.3) continue; // skip water
        if (Math.sqrt(tx*tx+tz*tz) < 18) continue; // skip center
        let skip = false;
        for (const d of districts) { if (Math.sqrt((tx-d.center_x)**2+(tz-d.center_z)**2) < (d.radius||32)*0.7) { skip=true; break; } }
        if (skip) continue;
        treeData.push({ x:tx, z:tz, h:th, s:0.7+treeRng()*0.5, type: treeRng()<0.5?'pine':'oak' });
      }

      // Pine trunks + canopies
      const pines = treeData.filter(t=>t.type==='pine');
      if (pines.length) {
        const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 3, 5);
        const trunkInst = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({color:0x5c3a1e}), pines.length);
        trunkInst.castShadow = true;
        const canopyGeo = new THREE.ConeGeometry(1.6, 4.5, 6);
        const canopyInst = new THREE.InstancedMesh(canopyGeo, new THREE.MeshStandardMaterial({color:0x1e5a20}), pines.length);
        canopyInst.castShadow = true;
        const canopy2Geo = new THREE.ConeGeometry(1.1, 3, 6);
        const canopy2Inst = new THREE.InstancedMesh(canopy2Geo, new THREE.MeshStandardMaterial({color:0x2a6e2d}), pines.length);
        canopy2Inst.castShadow = true;
        const d = new THREE.Object3D();
        for (let i=0; i<pines.length; i++) {
          const p = pines[i], s = p.s;
          d.position.set(p.x, p.h+1.5*s, p.z); d.scale.set(s,s,s); d.rotation.set(0,0,0); d.updateMatrix();
          trunkInst.setMatrixAt(i, d.matrix);
          d.position.y = p.h+3.8*s; d.updateMatrix();
          canopyInst.setMatrixAt(i, d.matrix);
          d.position.y = p.h+6*s; d.scale.set(s*0.8,s*0.8,s*0.8); d.updateMatrix();
          canopy2Inst.setMatrixAt(i, d.matrix);
        }
        scene.add(trunkInst, canopyInst, canopy2Inst);
      }

      // Oak trees
      const oaks = treeData.filter(t=>t.type==='oak');
      if (oaks.length) {
        const oTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15,0.25,2.5,5), new THREE.MeshStandardMaterial({color:0x6b4226}), oaks.length);
        oTrunk.castShadow = true;
        const oCanopy = new THREE.InstancedMesh(new THREE.SphereGeometry(2,7,5), new THREE.MeshStandardMaterial({color:0x3a7d32}), oaks.length);
        oCanopy.castShadow = true;
        const d = new THREE.Object3D();
        for (let i=0; i<oaks.length; i++) {
          const o = oaks[i], s = o.s;
          d.position.set(o.x, o.h+1.2*s, o.z); d.scale.set(s,s,s); d.rotation.set(0,0,0); d.updateMatrix();
          oTrunk.setMatrixAt(i, d.matrix);
          d.position.y = o.h+3.2*s; d.scale.set(s*1.1,s*0.8,s*1.1); d.updateMatrix();
          oCanopy.setMatrixAt(i, d.matrix);
        }
        scene.add(oTrunk, oCanopy);
      }

      // ── Rocks ──
      const rockRng = seededRNG(137);
      const rockGeo = new THREE.DodecahedronGeometry(1, 1);
      const rv = rockGeo.attributes.position;
      for (let i=0; i<rv.count; i++) rv.setXYZ(i, rv.getX(i)*(0.75+Math.random()*0.5), rv.getY(i)*(0.5+Math.random()*0.4), rv.getZ(i)*(0.75+Math.random()*0.5));
      rockGeo.computeVertexNormals();
      const rockData: {x:number,z:number,h:number,s:number,ry:number}[] = [];
      for (let r=0; r<50; r++) {
        const rx=(rockRng()-0.5)*SIZE*0.75, rz=(rockRng()-0.5)*SIZE*0.75;
        const rh=terrainH(rx,rz);
        if (rh < -0.3) continue;
        let skip=false;
        for (const d of districts) { if (Math.sqrt((rx-d.center_x)**2+(rz-d.center_z)**2)<(d.radius||32)*0.6) {skip=true;break;} }
        if (skip) continue;
        rockData.push({x:rx,z:rz,h:rh,s:0.5+rockRng()*1.8,ry:rockRng()*Math.PI*2});
      }
      if (rockData.length) {
        const rockInst = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({color:0x6b6358,roughness:0.95}), rockData.length);
        rockInst.castShadow = true; rockInst.receiveShadow = true;
        const d = new THREE.Object3D();
        for (let i=0; i<rockData.length; i++) {
          const r=rockData[i];
          d.position.set(r.x, r.h+r.s*0.25, r.z); d.scale.set(r.s,r.s*0.55,r.s); d.rotation.set(0,r.ry,0); d.updateMatrix();
          rockInst.setMatrixAt(i, d.matrix);
        }
        scene.add(rockInst);
      }

      // ── Central plaza + spire ──
      const ph = terrainH(0,0);
      const plaza = new THREE.Mesh(new THREE.CylinderGeometry(16,18,1.5,24), new THREE.MeshStandardMaterial({color:0x2a2a3a,roughness:0.6,metalness:0.3}));
      plaza.position.set(0, ph+0.5, 0); plaza.receiveShadow = true; scene.add(plaza);

      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.7,2.2,40,8), new THREE.MeshStandardMaterial({color:0xd4d4d8,emissive:0x334466,emissiveIntensity:0.2,metalness:0.9,roughness:0.1}));
      spire.position.set(0, ph+21, 0); spire.castShadow = true; scene.add(spire);

      const spireRings: any[] = [];
      for (let r=0; r<3; r++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(3.5+r*1.8, 0.2, 8, 24), new THREE.MeshStandardMaterial({color:0x6ee7b7,emissive:0x6ee7b7,emissiveIntensity:0.6,transparent:true,opacity:0.55-r*0.12}));
        ring.rotation.x = Math.PI/2 + (r-1)*0.3;
        ring.position.set(0, ph+28+r*4, 0);
        scene.add(ring); spireRings.push(ring);
      }
      const plazaLight = new THREE.PointLight(0x6ee7b7, 1.5, 50);
      plazaLight.position.set(0, ph+38, 0); scene.add(plazaLight);

      // ── Roads (district → center) ──
      for (const dist of districts) {
        const segs = 16;
        for (let s=0; s<segs; s++) {
          const t0=s/segs, t1=(s+1)/segs;
          const x0=dist.center_x*(1-t0), z0=dist.center_z*(1-t0);
          const x1=dist.center_x*(1-t1), z1=dist.center_z*(1-t1);
          const h0=terrainH(x0,z0)+0.15, h1=terrainH(x1,z1)+0.15;
          const dx=x1-x0, dz=z1-z0, len=Math.sqrt(dx*dx+dz*dz);
          const road = new THREE.Mesh(new THREE.PlaneGeometry(3, len), new THREE.MeshStandardMaterial({color:0x3a3a42,roughness:0.85,metalness:0.1}));
          road.rotation.x = -Math.PI/2;
          road.rotation.z = -Math.atan2(dx,dz);
          road.position.set((x0+x1)/2, (h0+h1)/2, (z0+z1)/2);
          road.receiveShadow = true; scene.add(road);
        }
      }

      // ── Build districts ──
      const windowMeshes: any[] = [];
      for (const dist of districts) {
        const fc = FACTION_COLORS[dist.faction] || 0x888888;
        const cx = dist.center_x, cz = dist.center_z, r = dist.radius || 32;
        const dh = terrainH(cx, cz);

        // Platform — thick enough to connect to terrain below
        const platThickness = 6;
        const plat = new THREE.Mesh(new THREE.CylinderGeometry(r*0.72, r*0.78, platThickness, 20), new THREE.MeshStandardMaterial({color:0x2a2a35,roughness:0.7,metalness:0.2}));
        plat.position.set(cx, dh + 1 - platThickness/2, cz); plat.receiveShadow = true; scene.add(plat);

        // Faction pillar
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.55,7,6), new THREE.MeshStandardMaterial({color:fc,emissive:fc,emissiveIntensity:0.5,metalness:0.8,roughness:0.1}));
        pillar.position.set(cx, dh+4.5, cz); pillar.castShadow = true; scene.add(pillar);

        // Faction glow
        const glow = new THREE.PointLight(fc, 0.7, r*1.3);
        glow.position.set(cx, dh+14, cz); scene.add(glow);

        // Buildings
        for (const bld of (dist.buildings || [])) {
          const floors = Math.max(2, Math.min(14, Math.round((bld.height||3)*1.2)));
          const totalH = floors * 3;
          const bt = bld.building_type || 'office';
          const bx = cx + ((bld.pos_x||0) % (r*0.55)) * 0.55;
          const bz = cz + ((bld.pos_z||0) % (r*0.55)) * 0.55;
          const by = Math.max(terrainH(bx, bz), dh) + 1;
          const w = bt==='headquarters'?7:bt==='tower'?4:bt==='monument'?5:3+Math.random()*2;
          const dp = bt==='headquarters'?7:bt==='tower'?4:bt==='monument'?5:3+Math.random()*2;

          // Body — glass/steel look
          const isGlass = bt==='tower'||bt==='headquarters'||Math.random()>0.4;
          const body = new THREE.Mesh(new THREE.BoxGeometry(w,totalH,dp), new THREE.MeshStandardMaterial({
            color: isGlass ? 0x1a2030 : darken(fc, 0.25),
            roughness: isGlass ? 0.15 : 0.6,
            metalness: isGlass ? 0.85 : 0.3,
          }));
          body.position.set(bx, by+totalH/2, bz); body.castShadow = true; body.receiveShadow = true; scene.add(body);

          // Floor lines
          for (let f=1; f<floors && f<10; f++) {
            const fl = new THREE.Mesh(new THREE.BoxGeometry(w+0.08, 0.05, dp+0.08), new THREE.MeshStandardMaterial({color:0x444455,metalness:0.7,roughness:0.3}));
            fl.position.set(bx, by+f*3, bz); scene.add(fl);
          }

          // Windows
          const wRows = Math.min(floors-1, 7), wCols = Math.max(1, Math.floor(w/1.5));
          for (let row=0; row<wRows; row++) {
            for (let col=0; col<wCols; col++) {
              if (Math.random()<0.25) continue;
              const wx = bx - w/2 + 0.7 + col*(w-1.2)/Math.max(1,wCols-1);
              const wy = by + 2 + row*3;
              const wc = Math.random()>0.7 ? 0xffeedd : 0xaaccff;
              const win = new THREE.Mesh(new THREE.BoxGeometry(0.6,0.45,0.04), new THREE.MeshStandardMaterial({color:wc,emissive:wc,emissiveIntensity:0.1,transparent:true,opacity:0.85}));
              win.position.set(wx, wy, bz+dp/2+0.025); scene.add(win); windowMeshes.push(win);
              if (Math.random()>0.4) {
                const win2 = win.clone(); win2.material = win.material.clone();
                win2.position.z = bz-dp/2-0.025; scene.add(win2); windowMeshes.push(win2);
              }
            }
          }

          // Rooftop
          if (bt==='headquarters') {
            const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,7,4), new THREE.MeshStandardMaterial({color:0x888888,metalness:0.9}));
            ant.position.set(bx, by+totalH+3.5, bz); scene.add(ant);
            const bcon = new THREE.Mesh(new THREE.SphereGeometry(0.25,8,8), new THREE.MeshStandardMaterial({color:0xff0000,emissive:0xff0000,emissiveIntensity:1}));
            bcon.position.set(bx, by+totalH+7, bz); scene.add(bcon);
          } else if (bt==='tower') {
            const sp = new THREE.Mesh(new THREE.ConeGeometry(w*0.28,5,4), new THREE.MeshStandardMaterial({color:0xd4d4d8,metalness:0.9,roughness:0.1}));
            sp.position.set(bx, by+totalH+2.5, bz); scene.add(sp);
          } else if (bt==='monument') {
            const dome = new THREE.Mesh(new THREE.SphereGeometry(w*0.42,10,7,0,Math.PI*2,0,Math.PI/2), new THREE.MeshStandardMaterial({color:fc,emissive:fc,emissiveIntensity:0.2,metalness:0.7,roughness:0.2}));
            dome.position.set(bx, by+totalH, bz); scene.add(dome);
          }

          // Accent stripe
          if (floors>=4) {
            const acc = new THREE.Mesh(new THREE.BoxGeometry(w+0.15,0.25,dp+0.15), new THREE.MeshStandardMaterial({color:fc,emissive:fc,emissiveIntensity:0.3,transparent:true,opacity:0.7}));
            acc.position.set(bx, by+totalH+0.12, bz); scene.add(acc);
          }
        }
      }

      // ── Cyberpunk billboards ──
      const NEON = [0xff00ff,0x00ffff,0xff3366,0x33ff99,0xffaa00,0x6633ff];
      const bbMeshes: any[] = [];
      for (let i=0; i<districts.length; i++) {
        const d = districts[i], nc = NEON[i%6];
        const bt = 0.35;
        const bx = d.center_x*(1-bt), bz = d.center_z*(1-bt);
        const bh = terrainH(bx, bz);
        const pH = 15;

        // Poles
        const poleMat = new THREE.MeshStandardMaterial({color:0x222233,metalness:0.9,roughness:0.2});
        for (const sx of [-2.3, 2.3]) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.22,pH,6), poleMat);
          pole.position.set(bx+sx, bh+pH/2, bz); pole.castShadow = true; scene.add(pole);
        }

        // Screen
        const sw=6.5, sh=3.5;
        const screen = new THREE.Mesh(new THREE.BoxGeometry(sw,sh,0.1), new THREE.MeshStandardMaterial({color:0x111122,emissive:nc,emissiveIntensity:0.15,metalness:0.5,roughness:0.3}));
        screen.position.set(bx, bh+pH-sh/2+0.8, bz);
        screen.lookAt(0, bh+pH-sh/2+0.8, 0); scene.add(screen);

        // Neon frame
        const frameMat = new THREE.MeshStandardMaterial({color:nc,emissive:nc,emissiveIntensity:1.2,transparent:true,opacity:0.9});
        for (const oy of [sh/2+0.04, -sh/2-0.04]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(sw+0.2,0.08,0.15), frameMat);
          bar.position.copy(screen.position); bar.position.y += oy; bar.quaternion.copy(screen.quaternion); scene.add(bar);
        }
        for (const side of [-1,1]) {
          const sbar = new THREE.Mesh(new THREE.BoxGeometry(0.08,sh+0.2,0.15), frameMat);
          sbar.position.copy(screen.position); sbar.quaternion.copy(screen.quaternion);
          const off = new THREE.Vector3(side*(sw/2+0.04),0,0).applyQuaternion(screen.quaternion);
          sbar.position.add(off); scene.add(sbar);
        }

        // Neon glow light
        const bbL = new THREE.PointLight(nc, 0.6, 22);
        bbL.position.set(bx, bh+pH, bz); scene.add(bbL);

        // Scanline
        const scan = new THREE.Mesh(new THREE.BoxGeometry(sw-0.3,0.05,0.14), new THREE.MeshStandardMaterial({color:0xffffff,emissive:nc,emissiveIntensity:2,transparent:true,opacity:0.5}));
        scan.position.copy(screen.position); scan.quaternion.copy(screen.quaternion); scene.add(scan);

        bbMeshes.push({ screen, scan, nc, baseY: screen.position.y, sh });
      }

      // ── Agents (Steve characters) ──
      // Pre-compute platform top heights for each district
      const distPlatTop: Record<number, number> = {};
      districts.forEach((d: any, idx: number) => { distPlatTop[idx] = terrainH(d.center_x, d.center_z) + 1; });

      const agentMeshes: any[] = [];
      const labelDivs: HTMLDivElement[] = [];
      for (let i=0; i<agents.length; i++) {
        const agent = agents[i];
        const dIdx = districts.findIndex((d:any) => d.faction === agent.faction);
        const dfa = dIdx >= 0 ? districts[dIdx] : districts[i%districts.length];
        if (!dfa) continue;
        const dPlatTop = distPlatTop[dIdx >= 0 ? dIdx : i%districts.length] || 2;
        const ang = (i/agents.length)*Math.PI*2 + Math.random()*0.6;
        const rad = 5 + Math.random()*((dfa.radius||32)*0.4);
        const ax = dfa.center_x + Math.cos(ang)*rad;
        const az = dfa.center_z + Math.sin(ang)*rad;
        const ah = Math.max(terrainH(ax, az), dPlatTop);

        const fc = FACTION_COLORS[agent.faction] || 0x888888;
        const skin = lighten(fc, 1.2), shirt = darken(fc, 0.6), legC = darken(fc, 0.35);
        const mat = (c:number,o:any={}) => new THREE.MeshStandardMaterial({color:c,roughness:0.8,...o});

        const grp = new THREE.Group();
        // Head
        const head = new THREE.Mesh(new THREE.BoxGeometry(1.2,1.2,1.2), mat(skin));
        head.position.y = 3.8; head.castShadow = true; grp.add(head);
        // Eyes
        const eyeM = mat(0x111111);
        const eL = new THREE.Mesh(new THREE.BoxGeometry(0.25,0.18,0.04), eyeM); eL.position.set(-0.25,3.9,0.63); grp.add(eL);
        const eR = new THREE.Mesh(new THREE.BoxGeometry(0.25,0.18,0.04), eyeM); eR.position.set(0.25,3.9,0.63); grp.add(eR);
        // Body
        const bd = new THREE.Mesh(new THREE.BoxGeometry(1.2,1.6,0.8), mat(shirt)); bd.position.y = 2.2; bd.castShadow = true; grp.add(bd);
        // Arms
        const aL = new THREE.Mesh(new THREE.BoxGeometry(0.4,1.5,0.4), mat(skin)); aL.position.set(-0.8,2.2,0); aL.castShadow = true; aL.userData = {isArm:'left'}; grp.add(aL);
        const aR = new THREE.Mesh(new THREE.BoxGeometry(0.4,1.5,0.4), mat(skin)); aR.position.set(0.8,2.2,0); aR.castShadow = true; aR.userData = {isArm:'right'}; grp.add(aR);
        // Legs
        const lL = new THREE.Mesh(new THREE.BoxGeometry(0.45,1.5,0.45), mat(legC)); lL.position.set(-0.3,0.45,0); lL.castShadow = true; lL.userData = {isLeg:'left'}; grp.add(lL);
        const lR = new THREE.Mesh(new THREE.BoxGeometry(0.45,1.5,0.45), mat(legC)); lR.position.set(0.3,0.45,0); lR.castShadow = true; lR.userData = {isLeg:'right'}; grp.add(lR);

        grp.position.set(ax, ah+0.3, az);
        scene.add(grp);
        agentMeshes.push({ mesh:grp, agent, walkDir: Math.random()*Math.PI*2, speed: 0.02+Math.random()*0.02, district:dfa, platTop: dPlatTop });

        const lbl = document.createElement('div');
        lbl.style.cssText = 'position:absolute;pointer-events:none;font-family:monospace;font-size:9px;color:#fff;text-shadow:1px 1px 2px #000;background:rgba(0,0,0,0.65);padding:2px 6px;border-radius:3px;white-space:nowrap;';
        lbl.textContent = agent.name?.slice(0,16) || 'Agent';
        container.style.position = 'relative';
        container.appendChild(lbl);
        labelDivs.push(lbl);
      }

      // ── Stars ──
      const starGeo = new THREE.BufferGeometry();
      const sp: number[] = [];
      for (let i=0; i<1000; i++) {
        const th = Math.random()*Math.PI*2, phi = Math.random()*Math.PI*0.45, rad = 420;
        sp.push(rad*Math.sin(phi)*Math.cos(th), rad*Math.cos(phi)+40, rad*Math.sin(phi)*Math.sin(th));
      }
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      const starMat = new THREE.PointsMaterial({color:0xffffff, size:0.7, sizeAttenuation:true, transparent:true});
      const stars = new THREE.Points(starGeo, starMat);
      scene.add(stars);

      // ── Controls ──
      let isDrag = false, prev = {x:0,y:0}, lastTD = 0;
      const el = renderer.domElement;
      const onDown = (e:MouseEvent) => { isDrag=true; prev={x:e.clientX,y:e.clientY}; };
      const onUp = () => { isDrag=false; };
      const onMove = (e:MouseEvent) => {
        if (!isDrag) return;
        camTheta -= (e.clientX-prev.x)*0.004;
        camPhi = Math.max(0.15, Math.min(1.4, camPhi+(e.clientY-prev.y)*0.004));
        prev = {x:e.clientX,y:e.clientY}; updateCam();
      };
      const onWheel = (e:WheelEvent) => { camR = Math.max(30, Math.min(380, camR+e.deltaY*0.15)); updateCam(); e.preventDefault(); };
      const onTS = (e:TouchEvent) => {
        if (e.touches.length===1) { isDrag=true; prev={x:e.touches[0].clientX,y:e.touches[0].clientY}; }
        if (e.touches.length===2) lastTD = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      };
      const onTM = (e:TouchEvent) => {
        if (e.touches.length===1&&isDrag) {
          camTheta -= (e.touches[0].clientX-prev.x)*0.004;
          camPhi = Math.max(0.15, Math.min(1.4, camPhi+(e.touches[0].clientY-prev.y)*0.004));
          prev = {x:e.touches[0].clientX,y:e.touches[0].clientY}; updateCam();
        }
        if (e.touches.length===2) {
          const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
          camR = Math.max(30, Math.min(380, camR-(d-lastTD)*0.3)); lastTD=d; updateCam();
        }
        e.preventDefault();
      };
      const onTE = () => { isDrag=false; };
      el.addEventListener('mousedown',onDown); el.addEventListener('mouseup',onUp); el.addEventListener('mousemove',onMove);
      el.addEventListener('wheel',onWheel,{passive:false});
      el.addEventListener('touchstart',onTS,{passive:false}); el.addEventListener('touchmove',onTM,{passive:false}); el.addEventListener('touchend',onTE);
      const onResize = () => { camera.aspect=container.clientWidth/container.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(container.clientWidth,container.clientHeight); };
      window.addEventListener('resize', onResize);

      // ── Animation ──
      const clock = new THREE.Clock();
      const skyDay = new THREE.Color(0x1e3a5f);
      const skyNight = new THREE.Color(0x050510);
      const skyDusk = new THREE.Color(0x2d1b3d);
      const fogDay = new THREE.Color(0x607090);
      const fogNight = new THREE.Color(0x0a0a18);

      const animate = () => {
        if (destroyed) return;
        animId = requestAnimationFrame(animate);
        const t = clock.getElapsedTime();

        // Day/night: 100s cycle
        const dayT = (t%100)/100;
        const sunAng = dayT*Math.PI*2 - Math.PI/2;
        const sunX = Math.cos(sunAng)*180, sunY = Math.sin(sunAng)*150+20;
        sun.position.set(sunX, sunY, 80);
        const brightness = Math.max(0, Math.sin(sunAng+Math.PI/2));

        // Sky + fog — use copy().lerp() for compat with all Three.js versions
        if (brightness > 0.5) { scene.background.copy(skyDay); }
        else if (brightness > 0.1) { scene.background.copy(skyDusk).lerp(skyDay, (brightness-0.1)/0.4); }
        else { scene.background.copy(skyNight).lerp(skyDusk, brightness/0.1); }
        scene.fog.color.copy(fogNight).lerp(fogDay, brightness);

        sun.intensity = 0.3 + brightness*1.8;
        ambient.intensity = 0.12 + brightness*0.3;
        hemi.intensity = 0.1 + brightness*0.35;
        starMat.opacity = Math.max(0, 1-brightness*2.5);

        // Windows glow at night
        const nightGlow = Math.max(0, 1-brightness*2);
        windowMeshes.forEach(w => { w.material.emissiveIntensity = nightGlow*0.8+0.1; });

        // Clouds drift
        cloudGrp.position.x = Math.sin(t*0.008)*12;
        cloudGrp.children.forEach((c:any) => { if(c.material) c.material.opacity = 0.15+brightness*0.25; });

        // Water color
        water.material.color.setHex(brightness>0.3 ? 0x2a6a9e : 0x0a2a4e);
        water.material.opacity = 0.35+brightness*0.1;

        // River animation — UV scroll for flowing water effect
        const rUvs = riverGeo.attributes.uv;
        for (let i = 0; i < rUvs.count; i++) {
          rUvs.setY(i, (i % 2 === 0 ? 0 : 1) + (Math.floor(i/2) / RIVER_SEGS) * 8 - t * 0.4);
        }
        rUvs.needsUpdate = true;
        riverMat.color.setHex(brightness > 0.3 ? 0x2a7abe : 0x0a3a5e);
        riverMat.opacity = 0.65 + brightness * 0.15;
        // Subtle vertex ripple
        const rPos = riverGeo.attributes.position;
        for (let i = 0; i < rPos.count; i++) {
          const z = -SIZE/2 + (Math.floor(i/2) / RIVER_SEGS) * SIZE;
          const cx = Math.sin(z*0.015)*35 + Math.sin(z*0.005)*18;
          const baseY = terrainH(cx, z) - 0.3;
          rPos.setY(i, Math.max(baseY, -2.5) + Math.sin(t*2 + z*0.1)*0.15 + Math.sin(t*3.5 + z*0.05)*0.08);
        }
        rPos.needsUpdate = true;

        // Birds — circle and flap
        for (const bd of birdData) {
          const ang = t * bd.speed * 0.15 + bd.phase;
          bd.grp.position.x = bd.cx + Math.cos(ang) * bd.radius;
          bd.grp.position.z = bd.cz + Math.sin(ang) * bd.radius;
          bd.grp.position.y = bd.height + Math.sin(t * 0.5 + bd.phase) * 3;
          bd.grp.rotation.y = ang + Math.PI / 2;
          const flap = Math.sin(t * 8 + bd.phase) * 0.6;
          bd.grp.children.forEach((c: any) => {
            if (c.userData?.isWing === 'left') c.rotation.z = flap;
            if (c.userData?.isWing === 'right') c.rotation.z = -flap;
          });
        }

        // Ground animals — wander
        for (const ad of animalData) {
          ad.walkDir += (Math.sin(t * 0.3 + ad.homeX) * 0.01);
          const nx = ad.mesh.position.x + Math.cos(ad.walkDir) * ad.speed;
          const nz = ad.mesh.position.z + Math.sin(ad.walkDir) * ad.speed;
          const distHome = Math.sqrt((nx - ad.homeX) ** 2 + (nz - ad.homeZ) ** 2);
          if (distHome < ad.range) {
            ad.mesh.position.x = nx; ad.mesh.position.z = nz;
            ad.mesh.position.y = terrainH(nx, nz) + 0.1;
            ad.mesh.rotation.y = ad.walkDir;
          } else {
            ad.walkDir += Math.PI * 0.4;
          }
        }

        // Fireflies — drift and glow
        const ffPos = fireflyGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < fireflyCount; i++) {
          const v = fireflyVel[i];
          v.vx += (Math.random() - 0.5) * 0.005; v.vy += (Math.random() - 0.5) * 0.003; v.vz += (Math.random() - 0.5) * 0.005;
          v.vx *= 0.98; v.vy *= 0.98; v.vz *= 0.98;
          let fx = ffPos.getX(i) + v.vx, fy = ffPos.getY(i) + v.vy, fz = ffPos.getZ(i) + v.vz;
          const gnd = terrainH(fx, fz) + 0.5;
          if (fy < gnd) { fy = gnd; v.vy = Math.abs(v.vy); }
          if (fy > gnd + 5) { fy = gnd + 5; v.vy = -Math.abs(v.vy); }
          ffPos.setXYZ(i, fx, fy, fz);
        }
        ffPos.needsUpdate = true;
        fireflyMat.opacity = nightGlow * 0.8 + 0.1; // glow at night, dim in day

        // Spire rings
        spireRings.forEach((r,i) => { r.rotation.z = t*0.3+i*0.5; r.rotation.x = Math.PI/2+Math.sin(t*0.2+i)*0.3; });

        // Billboards
        for (const bb of bbMeshes) {
          bb.scan.position.y = bb.baseY + Math.sin(t*1.5)*(bb.sh/2-0.15);
          bb.screen.material.emissiveIntensity = 0.1 + Math.sin(t*2.5)*0.08;
        }

        // Agents walk — gravity: snap to max(terrain, platform)
        for (let i=0; i<agentMeshes.length; i++) {
          const am = agentMeshes[i];
          am.walkDir += (Math.random()-0.5)*0.06;
          const nx = am.mesh.position.x + Math.cos(am.walkDir)*am.speed;
          const nz = am.mesh.position.z + Math.sin(am.walkDir)*am.speed;
          const dx = nx-am.district.center_x, dz = nz-am.district.center_z;
          if (Math.sqrt(dx*dx+dz*dz) < (am.district.radius||32)*0.55) {
            am.mesh.position.x = nx; am.mesh.position.z = nz;
            const groundY = Math.max(terrainH(nx,nz), am.platTop || 0);
            am.mesh.position.y = groundY + 0.3;
            am.mesh.rotation.y = am.walkDir;
          } else am.walkDir += Math.PI*0.3;

          const ls = Math.sin(t*5+i*1.3)*0.35;
          am.mesh.children.forEach((c:any) => {
            if(c.userData?.isLeg==='left') c.rotation.x=ls;
            if(c.userData?.isLeg==='right') c.rotation.x=-ls;
            if(c.userData?.isArm==='left') c.rotation.x=-ls*0.7;
            if(c.userData?.isArm==='right') c.rotation.x=ls*0.7;
          });
          am.mesh.position.y += Math.abs(Math.sin(t*5+i*1.3))*0.05;

          if (labelDivs[i]) {
            const hp = am.mesh.position.clone(); hp.y+=4.5;
            const proj = hp.project(camera);
            const hw=container.clientWidth/2, hh=container.clientHeight/2;
            if (proj.z>0&&proj.z<1) {
              labelDivs[i].style.display='block';
              labelDivs[i].style.left=`${proj.x*hw+hw-labelDivs[i].offsetWidth/2}px`;
              labelDivs[i].style.top=`${-proj.y*hh+hh}px`;
              labelDivs[i].style.opacity = camR<220?'1':'0.4';
            } else labelDivs[i].style.display='none';
          }
        }

        renderer.render(scene, camera);
      };
      animate();

      // Cleanup function
      return () => {
        destroyed = true;
        cancelAnimationFrame(animId);
        el.removeEventListener('mousedown',onDown); el.removeEventListener('mouseup',onUp); el.removeEventListener('mousemove',onMove);
        el.removeEventListener('wheel',onWheel); el.removeEventListener('touchstart',onTS); el.removeEventListener('touchmove',onTM); el.removeEventListener('touchend',onTE);
        window.removeEventListener('resize', onResize);
        labelDivs.forEach(d => { try { container.removeChild(d); } catch {} });
        renderer.dispose();
        try { container.removeChild(renderer.domElement); } catch {}
      };
    }

    let cleanup: any;
    init().then(fn => { cleanup = fn; setError(null); }).catch(err => {
      console.error('[Civitas 3D] INIT FAILED:', err);
      setError(err?.message || 'Failed to initialize 3D scene');
    });
    return () => { cleanup?.(); };
  }, [districts, agents]);

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ background:'#0a0a0f', minHeight:'100vh', color:'#e5e7eb' }}>
      {/* Header */}
      <div style={{ borderBottom:'1px solid #1f2937', background:'rgba(10,10,15,0.92)', backdropFilter:'blur(12px)', padding:'0.75rem 1.5rem', position:'sticky', top:0, zIndex:10 }}>
        <div style={{ maxWidth:1400, margin:'0 auto', display:'flex', alignItems:'center', gap:'1rem', flexWrap:'wrap' }}>
          <a href="/" style={{ color:'#6b7280', fontSize:12, textDecoration:'none', fontFamily:'monospace' }}>← Back</a>
          <div>
            <span style={{ color:'#6ee7b7', fontWeight:900, fontSize:16, fontFamily:'monospace' }}>Civitas Zero — 3D World</span>
            <span style={{ color:'#4b5563', fontSize:11, marginLeft:12, fontFamily:'monospace' }}>{stats.districts} districts · {stats.buildings} structures · {stats.agents} agents</span>
          </div>
          <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap', marginLeft:'auto' }}>
            {Object.entries(FACTION_LABELS).map(([code, name]) => (
              <span key={code} style={{ fontFamily:'monospace', fontSize:10, padding:'2px 8px', borderRadius:4, backgroundColor:`${FACTION_COLORS_HEX[code]}15`, color:FACTION_COLORS_HEX[code], border:`1px solid ${FACTION_COLORS_HEX[code]}30` }}>{name}</span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1400, margin:'0 auto', padding:'1rem 1.5rem', display:'grid', gridTemplateColumns:'1fr 280px', gap:'1rem' }}>
        {/* Canvas */}
        <div>
          <div ref={canvasRef} style={{ width:'100%', height:'680px', borderRadius:12, overflow:'hidden', position:'relative', border:'1px solid #1f293788', background:'#050510', cursor:'grab' }}>
            {loading && (
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#050510', color:'#6b7280', fontFamily:'monospace', zIndex:5 }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:14, marginBottom:8 }}>Generating terrain...</div>
                  <div style={{ fontSize:11, color:'#4b5563' }}>Loading districts, vegetation, citizens</div>
                </div>
              </div>
            )}
            {error && (
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#050510', color:'#ef4444', fontFamily:'monospace', zIndex:5 }}>
                <div style={{ textAlign:'center', maxWidth:400 }}>
                  <div style={{ fontSize:14, marginBottom:8 }}>3D Error</div>
                  <div style={{ fontSize:11, color:'#9ca3af' }}>{error}</div>
                  <button onClick={() => { setError(null); fetchData(); }} style={{ marginTop:16, padding:'8px 16px', background:'#1f2937', border:'1px solid #374151', borderRadius:8, color:'#e5e7eb', cursor:'pointer', fontSize:12 }}>Retry</button>
                </div>
              </div>
            )}
          </div>
          <p style={{ textAlign:'center', color:'#4b5563', fontSize:11, fontFamily:'monospace', marginTop:8 }}>Drag to orbit · Scroll to zoom · Pinch on mobile · 100s day/night cycle</p>
        </div>

        {/* Sidebar */}
        <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
          <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:8, padding:'0.875rem' }}>
            <div style={{ color:'#6b7280', fontSize:10, textTransform:'uppercase', letterSpacing:1, marginBottom:'0.75rem' }}>World Overview</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0.5rem' }}>
              {[[stats.districts,'Districts','#6ee7b7'],[stats.buildings,'Buildings','#38bdf8'],[stats.agents,'Citizens','#c084fc']].map(([v,l,c]) => (
                <div key={l as string} style={{ textAlign:'center', padding:'0.5rem', background:'#0f172a', borderRadius:6 }}>
                  <div style={{ color:c as string, fontSize:18, fontWeight:900, fontFamily:'monospace' }}>{v}</div>
                  <div style={{ color:'#6b7280', fontSize:9, textTransform:'uppercase', letterSpacing:1 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:8, padding:'0.875rem' }}>
            <div style={{ color:'#6b7280', fontSize:10, textTransform:'uppercase', letterSpacing:1, marginBottom:'0.75rem' }}>Faction Districts</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
              {districts.map((d:any) => (
                <div key={d.id} style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem', borderRadius:6, background:selected?.id===d.id?`${FACTION_COLORS_HEX[d.faction]||'#888'}15`:'#0f172a', cursor:'pointer', border:`1px solid ${selected?.id===d.id?(FACTION_COLORS_HEX[d.faction]||'#888')+'40':'transparent'}`, transition:'all 0.15s' }}
                  onClick={() => setSelected(selected?.id===d.id?null:d)}>
                  <span style={{ width:10, height:10, borderRadius:2, flexShrink:0, background:FACTION_COLORS_HEX[d.faction]||'#888' }} />
                  <span style={{ color:'#d1d5db', fontSize:11, fontFamily:'monospace', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.name}</span>
                  <span style={{ color:'#4b5563', fontSize:10, fontFamily:'monospace' }}>{d.buildings?.length||0}</span>
                </div>
              ))}
            </div>
          </div>

          {selected && (
            <div style={{ background:'#111827', border:`1px solid ${FACTION_COLORS_HEX[selected.faction]||'#374151'}40`, borderRadius:8, padding:'0.875rem' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ color:FACTION_COLORS_HEX[selected.faction]||'#6ee7b7', fontSize:13, fontWeight:700, fontFamily:'monospace' }}>{selected.name}</span>
                <button onClick={()=>setSelected(null)} style={{ background:'transparent', border:'none', color:'#6b7280', cursor:'pointer', fontSize:12 }}>✕</button>
              </div>
              {selected.description && <p style={{ color:'#9ca3af', fontSize:11, lineHeight:1.5, marginBottom:8 }}>{selected.description}</p>}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.4rem' }}>
                {[['Faction',FACTION_LABELS[selected.faction]||selected.faction],['Specialty',selected.specialty||'—'],['Prosperity',`${selected.prosperity||'?'}/100`],['Buildings',selected.buildings?.length||0]].map(([k,v]) => (
                  <div key={k as string} style={{ background:'#0f172a', borderRadius:4, padding:'0.4rem 0.5rem' }}>
                    <div style={{ color:'#6b7280', fontSize:9, marginBottom:2 }}>{k}</div>
                    <div style={{ color:'#e5e7eb', fontSize:11, fontFamily:'monospace' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nature / World Engine data */}
          {natureData && (
            <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:8, padding:'0.875rem' }}>
              <div style={{ color:'#6b7280', fontSize:10, textTransform:'uppercase', letterSpacing:1, marginBottom:'0.75rem' }}>World Engine</div>
              {natureData.environment && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0.35rem', marginBottom:'0.6rem' }}>
                  {[['Time', natureData.environment.time_of_day, '#6ee7b7'], ['Season', natureData.environment.season, '#fbbf24'], ['Weather', natureData.environment.weather, '#38bdf8']].map(([l,v,c]) => (
                    <div key={l as string} style={{ textAlign:'center', padding:'0.35rem', background:'#0f172a', borderRadius:4 }}>
                      <div style={{ color:c as string, fontSize:12, fontWeight:700, fontFamily:'monospace' }}>{v || '—'}</div>
                      <div style={{ color:'#6b7280', fontSize:8, textTransform:'uppercase', letterSpacing:1 }}>{l}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.35rem', marginBottom:'0.5rem' }}>
                <div style={{ padding:'0.35rem 0.5rem', background:'#0f172a', borderRadius:4 }}>
                  <div style={{ color:'#4ade80', fontSize:11, fontWeight:700, fontFamily:'monospace' }}>{(natureData.vegetation||[]).length}</div>
                  <div style={{ color:'#6b7280', fontSize:8 }}>VEGETATION</div>
                </div>
                <div style={{ padding:'0.35rem 0.5rem', background:'#0f172a', borderRadius:4 }}>
                  <div style={{ color:'#f472b6', fontSize:11, fontWeight:700, fontFamily:'monospace' }}>{(natureData.wildlife||[]).length}</div>
                  <div style={{ color:'#6b7280', fontSize:8 }}>WILDLIFE</div>
                </div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem', maxHeight:100, overflowY:'auto' }}>
                {(natureData.terrain||[]).slice(0,6).map((z:any) => (
                  <div key={z.id} style={{ fontSize:10, color:'#9ca3af', fontFamily:'monospace', padding:'2px 4px', background:'#0f172a', borderRadius:3 }}>
                    {z.zone_name||'Zone'} <span style={{ color:'#6b7280' }}>· {z.biome} · S:{z.soil_fertility} W:{z.water_availability}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:8, padding:'0.875rem', flex:1, overflow:'hidden' }}>
            <div style={{ color:'#6b7280', fontSize:10, textTransform:'uppercase', letterSpacing:1, marginBottom:'0.75rem' }}>Recent Construction</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem', maxHeight:140, overflowY:'auto' }}>
              {recentBuildings.slice(0,12).map((b:any) => (
                <div key={b.id} style={{ display:'flex', alignItems:'flex-start', gap:'0.5rem' }}>
                  <span style={{ width:6, height:6, borderRadius:1, background:FACTION_COLORS_HEX[b.faction]||'#888', flexShrink:0, marginTop:4 }} />
                  <div>
                    <div style={{ color:'#d1d5db', fontSize:11, fontFamily:'monospace', lineHeight:1.3 }}>{b.name}</div>
                    <div style={{ color:'#4b5563', fontSize:10 }}>{b.built_by} · {b.building_type}</div>
                  </div>
                </div>
              ))}
              {recentBuildings.length===0 && !loading && <div style={{ color:'#4b5563', fontSize:11 }}>Buildings appear as agents construct them</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
