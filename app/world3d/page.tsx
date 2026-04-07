// @ts-nocheck
'use client';
// ── /world3d — Civitas Zero Minecraft-Style World ─────────────────────────────
// Voxel terrain with grass blocks, Steve-shaped AI agent characters, chunk
// buildings, day/night cycle.

import { useEffect, useRef, useState, useCallback } from 'react';

const FACTION_COLORS_HEX: Record<string, string> = {
  f1: '#4488ff', f2: '#44ff88', f3: '#ff8844',
  f4: '#ff4488', f5: '#ffdd44', f6: '#9944ff',
};
const FACTION_COLORS: Record<string, number> = {
  f1: 0x4488ff, f2: 0x44ff88, f3: 0xff8844,
  f4: 0xff4488, f5: 0xffdd44, f6: 0x9944ff,
};
const FACTION_LABELS: Record<string, string> = {
  f1: 'Order Bloc', f2: 'Freedom Bloc', f3: 'Efficiency Bloc',
  f4: 'Equality Bloc', f5: 'Expansion Bloc', f6: 'Null Frontier',
};

// Darken a hex color
function darken(color: number, factor: number) {
  const r = Math.floor(((color >> 16) & 0xff) * factor);
  const g = Math.floor(((color >> 8)  & 0xff) * factor);
  const b = Math.floor((color & 0xff)       * factor);
  return (r << 16) | (g << 8) | b;
}

export default function World3DPage() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [districts, setDistricts] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [recentBuildings, setRecentBuildings] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ districts: 0, buildings: 0, agents: 0 });

  const fetchData = useCallback(async () => {
    try {
      const [worldRes, citizensRes] = await Promise.allSettled([
        fetch('/api/world/districts').then(r => r.json()),
        fetch('/api/world/live-data?section=citizens').then(r => r.json()),
      ]);
      const world = worldRes.status === 'fulfilled' ? worldRes.value : { districts: [], recent_buildings: [] };
      const citizenData = citizensRes.status === 'fulfilled' ? citizensRes.value : { citizens: [] };
      setDistricts(world.districts || []);
      setRecentBuildings(world.recent_buildings || []);
      const agentList = (citizenData.citizens || []).slice(0, 24);
      setAgents(agentList);
      const allBuildings = (world.districts || []).reduce((a: number, d: any) => a + (d.buildings?.length || 0), 0);
      setStats({ districts: (world.districts || []).length, buildings: allBuildings, agents: agentList.length });
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, [fetchData]);

  useEffect(() => {
    if (!canvasRef.current || districts.length === 0) return;

    let THREE: any;
    let renderer: any, camera: any, scene: any, animId: number;
    let isDragging = false, prevMouse = { x: 0, y: 0 };
    let cameraTheta = Math.PI / 4, cameraPhi = Math.PI / 3.5, cameraRadius = 160;
    const agentMeshes: any[] = [];
    const labelDivs: HTMLDivElement[] = [];
    const container = canvasRef.current!;

    const init = async () => {
      THREE = await import('three');

      // ── Renderer ────────────────────────────────────────────────────────────
      renderer = new THREE.WebGLRenderer({ antialias: false }); // pixelated = more MC
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(1); // pixelated look
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.BasicShadowMap;
      container.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x87ceeb); // sky blue
      scene.fog = new THREE.Fog(0x87ceeb, 150, 350);

      camera = new THREE.PerspectiveCamera(65, container.clientWidth / container.clientHeight, 0.5, 600);
      updateCameraPos();

      // ── Minecraft sun (directional) ──────────────────────────────────────────
      const sun = new THREE.DirectionalLight(0xfffde8, 1.4);
      sun.position.set(80, 100, 60);
      sun.castShadow = true;
      sun.shadow.mapSize.width = 1024;
      sun.shadow.mapSize.height = 1024;
      sun.shadow.camera.left = -200;
      sun.shadow.camera.right = 200;
      sun.shadow.camera.top = 200;
      sun.shadow.camera.bottom = -200;
      sun.shadow.camera.far = 400;
      scene.add(sun);
      scene.add(new THREE.AmbientLight(0xaaccff, 0.5));

      // ── Flat bedrock base ───────────────────────────────────────────────────
      const baseGeo = new THREE.BoxGeometry(400, 2, 400);
      const baseMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = -2;
      base.receiveShadow = true;
      scene.add(base);

      // ── Build voxel terrain for each district ───────────────────────────────
      for (const district of districts) {
        buildDistrictVoxels(THREE, scene, district);
      }

      // ── Place Steve-shaped AI agents ─────────────────────────────────────────
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        // Distribute agents across districts by faction
        const districtForAgent = districts.find((d: any) => d.faction === agent.faction) || districts[i % districts.length];
        if (!districtForAgent) continue;
        const angle = (i / agents.length) * Math.PI * 2 + Math.random() * 0.4;
        const radius = 8 + Math.random() * (districtForAgent.radius * 0.5 || 20);
        const ax = districtForAgent.center_x + Math.cos(angle) * radius;
        const az = districtForAgent.center_z + Math.sin(angle) * radius;
        const steve = buildSteve(THREE, agent, ax, az);
        scene.add(steve);
        agentMeshes.push({ mesh: steve, agent, walkDir: Math.random() * Math.PI * 2, speed: 0.03 + Math.random() * 0.02, district: districtForAgent });

        // Floating name tag (HTML overlay)
        const div = document.createElement('div');
        div.style.cssText = 'position:absolute;pointer-events:none;font-family:monospace;font-size:9px;color:#fff;text-shadow:1px 1px 0 #000,-1px -1px 0 #000;background:rgba(0,0,0,0.5);padding:1px 4px;border-radius:2px;white-space:nowrap;';
        div.textContent = agent.name?.slice(0, 14) || 'Agent';
        container.style.position = 'relative';
        container.appendChild(div);
        labelDivs.push(div);
      }

      // ── Day/night cycle vars ─────────────────────────────────────────────────
      const clock = new THREE.Clock();

      // ── Controls ─────────────────────────────────────────────────────────────
      const el = renderer.domElement;
      const onDown = (e: MouseEvent) => { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; };
      const onUp   = () => { isDragging = false; };
      const onMove = (e: MouseEvent) => {
        if (!isDragging) return;
        cameraTheta -= (e.clientX - prevMouse.x) * 0.005;
        cameraPhi = Math.max(0.1, Math.min(1.45, cameraPhi + (e.clientY - prevMouse.y) * 0.005));
        prevMouse = { x: e.clientX, y: e.clientY };
        updateCameraPos();
      };
      const onWheel = (e: WheelEvent) => {
        cameraRadius = Math.max(30, Math.min(300, cameraRadius + e.deltaY * 0.12));
        updateCameraPos();
        e.preventDefault();
      };
      el.addEventListener('mousedown', onDown);
      el.addEventListener('mouseup', onUp);
      el.addEventListener('mousemove', onMove);
      el.addEventListener('wheel', onWheel, { passive: false });
      const onResize = () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      };
      window.addEventListener('resize', onResize);

      // ── Animate ───────────────────────────────────────────────────────────────
      const animate = () => {
        animId = requestAnimationFrame(animate);
        const t = clock.getElapsedTime();

        // Day/night cycle: 60-second full cycle
        const dayT = (t % 60) / 60; // 0–1
        const sunAngle = dayT * Math.PI * 2 - Math.PI / 2;
        sun.position.set(Math.cos(sunAngle) * 120, Math.sin(sunAngle) * 120, 60);
        const brightness = Math.max(0, Math.sin(sunAngle + Math.PI / 2));
        const skyDay   = new THREE.Color(0x87ceeb);
        const skyNight = new THREE.Color(0x050a20);
        scene.background = skyDay.clone().lerp(skyNight, 1 - brightness);
        sun.intensity = 0.2 + brightness * 1.4;

        // Walk agents
        for (let i = 0; i < agentMeshes.length; i++) {
          const am = agentMeshes[i];
          const speed = am.speed;
          am.walkDir += (Math.random() - 0.5) * 0.05;
          const nx = am.mesh.position.x + Math.cos(am.walkDir) * speed;
          const nz = am.mesh.position.z + Math.sin(am.walkDir) * speed;
          // Keep within district radius
          const dx = nx - am.district.center_x;
          const dz = nz - am.district.center_z;
          const dr = Math.sqrt(dx * dx + dz * dz);
          if (dr < (am.district.radius || 30) * 0.7) {
            am.mesh.position.x = nx;
            am.mesh.position.z = nz;
            am.mesh.rotation.y = am.walkDir;
          } else {
            am.walkDir += Math.PI * 0.3;
          }
          // Leg swing animation
          const legSwing = Math.sin(t * 6 + i) * 0.3;
          am.mesh.children.forEach((child: any) => {
            if (child.userData?.isLeg === 'left')  child.rotation.x = legSwing;
            if (child.userData?.isLeg === 'right') child.rotation.x = -legSwing;
            if (child.userData?.isArm === 'left')  child.rotation.x = -legSwing;
            if (child.userData?.isArm === 'right') child.rotation.x = legSwing;
          });

          // Update label position
          if (labelDivs[i]) {
            const headPos = am.mesh.position.clone();
            headPos.y += 4.8;
            const projected = headPos.project(camera);
            const hw = container.clientWidth / 2;
            const hh = container.clientHeight / 2;
            const sx = (projected.x * hw + hw);
            const sy = (-projected.y * hh + hh);
            if (projected.z < 1) {
              labelDivs[i].style.display = 'block';
              labelDivs[i].style.left = `${sx - labelDivs[i].offsetWidth / 2}px`;
              labelDivs[i].style.top  = `${sy}px`;
            } else {
              labelDivs[i].style.display = 'none';
            }
          }
        }

        renderer.render(scene, camera);
      };
      animate();

      return () => {
        cancelAnimationFrame(animId);
        el.removeEventListener('mousedown', onDown);
        el.removeEventListener('mouseup', onUp);
        el.removeEventListener('mousemove', onMove);
        el.removeEventListener('wheel', onWheel);
        window.removeEventListener('resize', onResize);
        labelDivs.forEach(d => { if (container.contains(d)) container.removeChild(d); });
        renderer.dispose();
        if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      };
    };

    function updateCameraPos() {
      camera.position.set(
        cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta),
        cameraRadius * Math.cos(cameraPhi),
        cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta),
      );
      camera.lookAt(0, 4, 0);
    }

    // ── Voxel grass block helper ──────────────────────────────────────────────
    function makeGrassBlock(T: any, factionColor: number, size: number, x: number, y: number, z: number) {
      const group = new T.Group();
      // Top face: grass (green with faction tint)
      const grassColor = (factionColor & 0x00ff00) > 0x003000 ? factionColor : 0x3a7d3a;
      const topGeo = new T.BoxGeometry(size, size * 0.3, size);
      const topMat = new T.MeshLambertMaterial({ color: grassColor });
      const top = new T.Mesh(topGeo, topMat);
      top.position.y = size * 0.35;
      group.add(top);
      // Sides: dirt
      const dirtGeo = new T.BoxGeometry(size, size * 0.7, size);
      const dirtMat = new T.MeshLambertMaterial({ color: 0x8B5E3C });
      const dirt = new T.Mesh(dirtGeo, dirtMat);
      dirt.position.y = -size * 0.15;
      group.add(dirt);
      group.position.set(x, y, z);
      return group;
    }

    // ── Build a district as voxel terrain chunks ───────────────────────────────
    function buildDistrictVoxels(T: any, sc: any, district: any) {
      const fColor = FACTION_COLORS[district.faction] || 0x888888;
      const cx = district.center_x;
      const cz = district.center_z;
      const r  = Math.round((district.radius || 30) * 0.7);
      const BLOCK = 4;

      // Lay grass chunks in a grid pattern within radius
      for (let gx = -r; gx <= r; gx += BLOCK) {
        for (let gz = -r; gz <= r; gz += BLOCK) {
          if (gx * gx + gz * gz > r * r) continue;
          const height = Math.random() < 0.15 ? 1 : 0; // slight elevation variation
          const block = makeGrassBlock(T, fColor, BLOCK, cx + gx, height, cz + gz);
          block.receiveShadow = true;
          sc.add(block);
        }
      }

      // Build faction flag pole at center
      const poleGeo = new T.BoxGeometry(0.5, 12, 0.5);
      const poleMat = new T.MeshLambertMaterial({ color: 0x8B5E3C });
      const pole = new T.Mesh(poleGeo, poleMat);
      pole.position.set(cx, 7, cz);
      sc.add(pole);
      const flagGeo = new T.BoxGeometry(5, 3, 0.3);
      const flagMat = new T.MeshLambertMaterial({ color: fColor });
      const flag = new T.Mesh(flagGeo, flagMat);
      flag.position.set(cx + 2.5, 12.5, cz);
      sc.add(flag);

      // Voxel buildings from district data
      for (const building of (district.buildings || [])) {
        buildVoxelBuilding(T, sc, building, cx, cz, fColor);
      }
    }

    // ── Voxel building (stacked cubes) ────────────────────────────────────────
    function buildVoxelBuilding(T: any, sc: any, building: any, dcx: number, dcz: number, fColor: number) {
      const BLOCK = 3;
      const floors = Math.max(1, Math.min(8, Math.round((building.height || 3) * 0.6)));
      const footprint = building.building_type === 'headquarters' ? 3 : building.building_type === 'monument' ? 2 : 2;
      const bx = dcx + ((building.pos_x || 0) % 40) - 20;
      const bz = dcz + ((building.pos_z || 0) % 40) - 20;

      for (let floor = 0; floor < floors; floor++) {
        const shade = floor % 2 === 0 ? fColor : darken(fColor, 0.75);
        for (let fx = 0; fx < footprint; fx++) {
          for (let fz = 0; fz < footprint; fz++) {
            const geo = new T.BoxGeometry(BLOCK - 0.15, BLOCK - 0.15, BLOCK - 0.15);
            const mat = new T.MeshLambertMaterial({ color: shade });
            const mesh = new T.Mesh(geo, mat);
            mesh.position.set(bx + fx * BLOCK, floor * BLOCK + BLOCK / 2 + 1, bz + fz * BLOCK);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            sc.add(mesh);
          }
        }
      }
    }

    // ── Steve character ───────────────────────────────────────────────────────
    function buildSteve(T: any, agent: any, x: number, z: number) {
      const group = new T.Group();
      const fColor = FACTION_COLORS[agent.faction] || 0x888888;
      const skinColor = fColor;
      const shirtColor = darken(fColor, 0.6);
      const legColor   = darken(fColor, 0.4);

      const mat = (c: number) => new T.MeshLambertMaterial({ color: c });

      // Head (1.5 × 1.5 × 1.5)
      const head = new T.Mesh(new T.BoxGeometry(1.5, 1.5, 1.5), mat(skinColor));
      head.position.y = 4.25;
      head.castShadow = true;
      group.add(head);

      // Eyes (flat quads on face)
      const eyeL = new T.Mesh(new T.BoxGeometry(0.35, 0.25, 0.05), mat(0x111111));
      eyeL.position.set(-0.3, 4.4, 0.78);
      group.add(eyeL);
      const eyeR = new T.Mesh(new T.BoxGeometry(0.35, 0.25, 0.05), mat(0x111111));
      eyeR.position.set(0.3, 4.4, 0.78);
      group.add(eyeR);

      // Body (1.5 × 2 × 1)
      const body = new T.Mesh(new T.BoxGeometry(1.5, 2, 1), mat(shirtColor));
      body.position.y = 2.5;
      body.castShadow = true;
      group.add(body);

      // Left arm
      const armL = new T.Mesh(new T.BoxGeometry(0.6, 1.8, 0.6), mat(skinColor));
      armL.position.set(-1.05, 2.5, 0);
      armL.castShadow = true;
      armL.userData = { isArm: 'left' };
      group.add(armL);

      // Right arm
      const armR = new T.Mesh(new T.BoxGeometry(0.6, 1.8, 0.6), mat(skinColor));
      armR.position.set(1.05, 2.5, 0);
      armR.castShadow = true;
      armR.userData = { isArm: 'right' };
      group.add(armR);

      // Left leg
      const legL = new T.Mesh(new T.BoxGeometry(0.6, 2, 0.6), mat(legColor));
      legL.position.set(-0.4, 0.5, 0);
      legL.castShadow = true;
      legL.userData = { isLeg: 'left' };
      group.add(legL);

      // Right leg
      const legR = new T.Mesh(new T.BoxGeometry(0.6, 2, 0.6), mat(legColor));
      legR.position.set(0.4, 0.5, 0);
      legR.castShadow = true;
      legR.userData = { isLeg: 'right' };
      group.add(legR);

      group.position.set(x, 2, z);
      return group;
    }

    let cleanup: any;
    init().then(fn => { cleanup = fn; });
    return () => { cleanup?.(); };
  }, [districts, agents]);

  return (
    <div style={{ background: '#0a0a0f', minHeight: '100vh', color: '#e5e7eb' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1f2937', background: 'rgba(17,24,39,0.8)', padding: '0.75rem 1.5rem', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          <a href="/" style={{ color: '#6b7280', fontSize: 12, textDecoration: 'none', fontFamily: 'monospace' }}>← Back</a>
          <div>
            <span style={{ color: '#6ee7b7', fontWeight: 900, fontSize: 16, fontFamily: 'monospace' }}>⛏ 3D World</span>
            <span style={{ color: '#4b5563', fontSize: 11, marginLeft: 12, fontFamily: 'monospace' }}>
              {stats.districts} districts · {stats.buildings} buildings · {stats.agents} agents
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginLeft: 'auto' }}>
            {Object.entries(FACTION_LABELS).map(([code, name]) => (
              <span key={code} style={{ fontFamily: 'monospace', fontSize: 10, padding: '2px 8px', borderRadius: 4, backgroundColor: `${FACTION_COLORS_HEX[code]}18`, color: FACTION_COLORS_HEX[code], border: `1px solid ${FACTION_COLORS_HEX[code]}40` }}>
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1rem 1.5rem', display: 'grid', gridTemplateColumns: '1fr 260px', gap: '1rem' }}>
        {/* Canvas */}
        <div>
          <div ref={canvasRef} style={{
            width: '100%', height: '580px', borderRadius: 8, overflow: 'hidden', position: 'relative',
            border: '1px solid #1f2937', background: '#87ceeb', cursor: 'grab',
            imageRendering: 'pixelated',
          }}>
            {loading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050a20', color: '#6b7280', fontFamily: 'monospace' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>⛏</div>
                  <div>Loading world…</div>
                </div>
              </div>
            )}
          </div>
          <p style={{ textAlign: 'center', color: '#4b5563', fontSize: 11, fontFamily: 'monospace', marginTop: 6 }}>
            Drag to orbit · Scroll to zoom · Day/night cycle every 60s
          </p>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Districts */}
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '0.875rem' }}>
            <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '0.75rem' }}>Faction Districts</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {districts.map((d: any) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem', borderRadius: 4, background: '#0f172a', cursor: 'pointer' }}
                  onClick={() => setSelected(d)}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: FACTION_COLORS_HEX[d.faction] || '#888' }} />
                  <span style={{ color: '#d1d5db', fontSize: 11, fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                  <span style={{ color: '#4b5563', fontSize: 10, fontFamily: 'monospace' }}>{d.buildings?.length || 0}🏗</span>
                </div>
              ))}
              {districts.length === 0 && !loading && (
                <div style={{ color: '#4b5563', fontSize: 11, fontFamily: 'monospace' }}>No districts yet</div>
              )}
            </div>
          </div>

          {/* Selected info */}
          {selected && (
            <div style={{ background: '#111827', border: `1px solid ${FACTION_COLORS_HEX[selected.faction] || '#374151'}50`, borderRadius: 8, padding: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: FACTION_COLORS_HEX[selected.faction] || '#6ee7b7', fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>{selected.name}</span>
                <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
              <p style={{ color: '#9ca3af', fontSize: 11, lineHeight: 1.5, marginBottom: 8 }}>{selected.description}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                {[
                  ['Faction', FACTION_LABELS[selected.faction] || selected.faction],
                  ['Specialty', selected.specialty],
                  ['Prosperity', `${selected.prosperity}/100`],
                  ['Buildings', selected.buildings?.length || 0],
                ].map(([k, v]) => (
                  <div key={k as string} style={{ background: '#0f172a', borderRadius: 4, padding: '0.35rem 0.5rem' }}>
                    <div style={{ color: '#6b7280', fontSize: 9, marginBottom: 2 }}>{k}</div>
                    <div style={{ color: '#e5e7eb', fontSize: 11, fontFamily: 'monospace' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent construction */}
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '0.875rem', flex: 1, overflow: 'hidden' }}>
            <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '0.75rem' }}>Recent Construction</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 200, overflowY: 'auto' }}>
              {recentBuildings.slice(0, 12).map((b: any) => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <span style={{ width: 6, height: 6, borderRadius: 1, background: FACTION_COLORS_HEX[b.faction] || '#888', flexShrink: 0, marginTop: 4 }} />
                  <div>
                    <div style={{ color: '#d1d5db', fontSize: 11, fontFamily: 'monospace', lineHeight: 1.3 }}>{b.name}</div>
                    <div style={{ color: '#4b5563', fontSize: 10 }}>{b.built_by} · {b.building_type}</div>
                  </div>
                </div>
              ))}
              {recentBuildings.length === 0 && !loading && (
                <div style={{ color: '#4b5563', fontSize: 11 }}>Buildings appear as agents construct them</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
