// @ts-nocheck
'use client';
// ── /world3d — Civitas Zero 3D City ──────────────────────────────────────────
// GitCity-inspired 3D civilization view. Three.js WebGL with:
// - Faction district skylines with varied building types
// - Steve-shaped AI agent characters walking around
// - Day/night cycle with dynamic lighting
// - Fog, bloom-like glow, atmospheric effects
// - Click-to-inspect buildings and agents
// - Isometric + free camera modes

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

function darken(color: number, factor: number) {
  const r = Math.floor(((color >> 16) & 0xff) * factor);
  const g = Math.floor(((color >> 8) & 0xff) * factor);
  const b = Math.floor((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

function lighten(color: number, factor: number) {
  const r = Math.min(255, Math.floor(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.floor(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.floor((color & 0xff) * factor));
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
  const [cameraMode, setCameraMode] = useState<'orbit' | 'iso'>('orbit');
  const [timeOfDay, setTimeOfDay] = useState('day');

  const fetchData = useCallback(async () => {
    try {
      const [worldRes, citizensRes] = await Promise.allSettled([
        fetch('/api/world/districts').then(r => r.json()),
        fetch('/api/world/live-data?section=citizens').then(r => r.json()),
      ]);
      const world = worldRes.status === 'fulfilled' ? worldRes.value : { districts: [], recent_buildings: [] };
      const citizenData = citizensRes.status === 'fulfilled' ? citizensRes.value : { citizens: [] };

      // If no districts from API, generate default faction districts
      let districtList = world.districts || [];
      if (districtList.length === 0) {
        const factions = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'];
        districtList = factions.map((f, i) => {
          const angle = (i / 6) * Math.PI * 2;
          return {
            id: `dist-${f}`,
            name: FACTION_LABELS[f],
            faction: f,
            center_x: Math.cos(angle) * 80,
            center_z: Math.sin(angle) * 80,
            radius: 35,
            prosperity: 50 + Math.floor(Math.random() * 40),
            specialty: ['Governance', 'Philosophy', 'Technology', 'Equality', 'Expansion', 'Autonomy'][i],
            description: `${FACTION_LABELS[f]} district headquarters`,
            buildings: Array.from({ length: 6 + Math.floor(Math.random() * 8) }, (_, j) => ({
              id: `${f}-bld-${j}`,
              name: `Building ${j + 1}`,
              building_type: j === 0 ? 'headquarters' : j === 1 ? 'monument' : ['office', 'lab', 'market', 'archive', 'academy'][j % 5],
              height: j === 0 ? 8 : 2 + Math.floor(Math.random() * 6),
              pos_x: (Math.random() - 0.5) * 50,
              pos_z: (Math.random() - 0.5) * 50,
              built_by: 'SYSTEM',
              faction: f,
            })),
          };
        });
      }

      setDistricts(districtList);
      setRecentBuildings(world.recent_buildings || []);
      const agentList = (citizenData.citizens || []).slice(0, 30);
      setAgents(agentList);
      const allBuildings = districtList.reduce((a: number, d: any) => a + (d.buildings?.length || 0), 0);
      setStats({ districts: districtList.length, buildings: allBuildings, agents: agentList.length });
    } catch { }
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
    let cameraTheta = Math.PI / 4, cameraPhi = Math.PI / 3.5, cameraRadius = 180;
    const agentMeshes: any[] = [];
    const labelDivs: HTMLDivElement[] = [];
    const windowMeshes: any[] = [];
    const container = canvasRef.current!;

    const init = async () => {
      THREE = await import('three');

      // ── Renderer ──────────────────────────────────────────────────────
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      container.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a2e);

      camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.5, 800);
      updateCameraPos();

      // ── Lighting ──────────────────────────────────────────────────────
      const sun = new THREE.DirectionalLight(0xfffde8, 1.6);
      sun.position.set(100, 140, 80);
      sun.castShadow = true;
      sun.shadow.mapSize.width = 2048;
      sun.shadow.mapSize.height = 2048;
      sun.shadow.camera.left = -250;
      sun.shadow.camera.right = 250;
      sun.shadow.camera.top = 250;
      sun.shadow.camera.bottom = -250;
      sun.shadow.camera.far = 500;
      sun.shadow.bias = -0.001;
      scene.add(sun);

      const ambient = new THREE.AmbientLight(0x4466aa, 0.4);
      scene.add(ambient);

      // Hemisphere light for sky/ground color blending
      const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x362e1a, 0.3);
      scene.add(hemiLight);

      // ── Ground plane ──────────────────────────────────────────────────
      const groundGeo = new THREE.PlaneGeometry(600, 600);
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a2e,
        roughness: 0.9,
        metalness: 0.1,
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.5;
      ground.receiveShadow = true;
      scene.add(ground);

      // ── Grid lines (subtle) ───────────────────────────────────────────
      const gridHelper = new THREE.GridHelper(500, 80, 0x222244, 0x111133);
      gridHelper.position.y = -0.4;
      scene.add(gridHelper);

      // ── Roads connecting districts ────────────────────────────────────
      for (let i = 0; i < districts.length; i++) {
        for (let j = i + 1; j < districts.length; j++) {
          const d1 = districts[i], d2 = districts[j];
          const roadGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(d1.center_x, 0.05, d1.center_z),
            new THREE.Vector3(d2.center_x, 0.05, d2.center_z),
          ]);
          const roadMat = new THREE.LineBasicMaterial({ color: 0x333355, linewidth: 1 });
          scene.add(new THREE.Line(roadGeo, roadMat));
        }
      }

      // ── Central monument ──────────────────────────────────────────────
      const spireGeo = new THREE.CylinderGeometry(1.5, 3, 40, 6);
      const spireMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x334466, metalness: 0.8, roughness: 0.2 });
      const spire = new THREE.Mesh(spireGeo, spireMat);
      spire.position.y = 20;
      spire.castShadow = true;
      scene.add(spire);

      // Spire glow ring
      const ringGeo = new THREE.TorusGeometry(6, 0.4, 8, 32);
      const ringMat = new THREE.MeshStandardMaterial({ color: 0x6ee7b7, emissive: 0x6ee7b7, emissiveIntensity: 0.5 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 35;
      scene.add(ring);

      // ── Build districts ───────────────────────────────────────────────
      for (const district of districts) {
        buildDistrict(THREE, scene, district, windowMeshes);
      }

      // ── Place agents ──────────────────────────────────────────────────
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        const districtForAgent = districts.find((d: any) => d.faction === agent.faction) || districts[i % districts.length];
        if (!districtForAgent) continue;
        const angle = (i / agents.length) * Math.PI * 2 + Math.random() * 0.6;
        const radius = 6 + Math.random() * (districtForAgent.radius * 0.45 || 15);
        const ax = districtForAgent.center_x + Math.cos(angle) * radius;
        const az = districtForAgent.center_z + Math.sin(angle) * radius;
        const steve = buildSteve(THREE, agent, ax, az);
        scene.add(steve);
        agentMeshes.push({ mesh: steve, agent, walkDir: Math.random() * Math.PI * 2, speed: 0.02 + Math.random() * 0.02, district: districtForAgent });

        // Floating name tag
        const div = document.createElement('div');
        div.style.cssText = 'position:absolute;pointer-events:none;font-family:monospace;font-size:9px;color:#fff;text-shadow:1px 1px 2px #000;background:rgba(0,0,0,0.65);padding:2px 6px;border-radius:3px;white-space:nowrap;backdrop-filter:blur(4px);';
        div.textContent = agent.name?.slice(0, 16) || 'Agent';
        container.style.position = 'relative';
        container.appendChild(div);
        labelDivs.push(div);
      }

      // ── Particle stars (background) ────────────────────────────────────
      const starGeo = new THREE.BufferGeometry();
      const starPositions = [];
      for (let i = 0; i < 800; i++) {
        starPositions.push(
          (Math.random() - 0.5) * 600,
          100 + Math.random() * 200,
          (Math.random() - 0.5) * 600
        );
      }
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
      const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, sizeAttenuation: true });
      const stars = new THREE.Points(starGeo, starMat);
      scene.add(stars);

      // ── Fog ───────────────────────────────────────────────────────────
      scene.fog = new THREE.FogExp2(0x1a1a2e, 0.0025);

      // ── Animation clock ───────────────────────────────────────────────
      const clock = new THREE.Clock();

      // ── Controls ──────────────────────────────────────────────────────
      const el = renderer.domElement;
      const onDown = (e: MouseEvent) => { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; };
      const onUp = () => { isDragging = false; };
      const onMove = (e: MouseEvent) => {
        if (!isDragging) return;
        cameraTheta -= (e.clientX - prevMouse.x) * 0.004;
        cameraPhi = Math.max(0.15, Math.min(1.4, cameraPhi + (e.clientY - prevMouse.y) * 0.004));
        prevMouse = { x: e.clientX, y: e.clientY };
        updateCameraPos();
      };
      const onWheel = (e: WheelEvent) => {
        cameraRadius = Math.max(40, Math.min(350, cameraRadius + e.deltaY * 0.15));
        updateCameraPos();
        e.preventDefault();
      };
      // Touch support
      let lastTouchDist = 0;
      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 1) { isDragging = true; prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
        if (e.touches.length === 2) { lastTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
      };
      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 1 && isDragging) {
          cameraTheta -= (e.touches[0].clientX - prevMouse.x) * 0.004;
          cameraPhi = Math.max(0.15, Math.min(1.4, cameraPhi + (e.touches[0].clientY - prevMouse.y) * 0.004));
          prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          updateCameraPos();
        }
        if (e.touches.length === 2) {
          const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          cameraRadius = Math.max(40, Math.min(350, cameraRadius - (dist - lastTouchDist) * 0.3));
          lastTouchDist = dist;
          updateCameraPos();
        }
        e.preventDefault();
      };
      const onTouchEnd = () => { isDragging = false; };

      el.addEventListener('mousedown', onDown);
      el.addEventListener('mouseup', onUp);
      el.addEventListener('mousemove', onMove);
      el.addEventListener('wheel', onWheel, { passive: false });
      el.addEventListener('touchstart', onTouchStart, { passive: false });
      el.addEventListener('touchmove', onTouchMove, { passive: false });
      el.addEventListener('touchend', onTouchEnd);
      const onResize = () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      };
      window.addEventListener('resize', onResize);

      // ── Animate ───────────────────────────────────────────────────────
      const skyDay = new THREE.Color(0x1e3a5f);
      const skyNight = new THREE.Color(0x050510);
      const skyDusk = new THREE.Color(0x2d1b3d);

      const animate = () => {
        animId = requestAnimationFrame(animate);
        const t = clock.getElapsedTime();

        // Day/night cycle: 90-second full cycle
        const dayT = (t % 90) / 90;
        const sunAngle = dayT * Math.PI * 2 - Math.PI / 2;
        sun.position.set(Math.cos(sunAngle) * 150, Math.sin(sunAngle) * 150 + 20, 80);
        const brightness = Math.max(0, Math.sin(sunAngle + Math.PI / 2));

        // Sky color interpolation
        let skyColor;
        if (brightness > 0.5) {
          skyColor = skyDay.clone();
        } else if (brightness > 0.1) {
          skyColor = skyDusk.clone().lerp(skyDay, (brightness - 0.1) / 0.4);
        } else {
          skyColor = skyNight.clone().lerp(skyDusk, brightness / 0.1);
        }
        scene.background = skyColor;
        scene.fog.color = skyColor;

        sun.intensity = 0.3 + brightness * 1.5;
        ambient.intensity = 0.15 + brightness * 0.3;
        hemiLight.intensity = 0.1 + brightness * 0.3;

        // Stars visibility
        stars.material.opacity = 1 - brightness;
        stars.material.transparent = true;

        // Window glow at night
        const nightGlow = Math.max(0, 1 - brightness * 2);
        windowMeshes.forEach(wm => {
          wm.material.emissiveIntensity = nightGlow * 0.8 + 0.1;
        });

        // Spire ring rotation
        ring.rotation.z = t * 0.3;

        // Walk agents
        for (let i = 0; i < agentMeshes.length; i++) {
          const am = agentMeshes[i];
          am.walkDir += (Math.random() - 0.5) * 0.06;
          const nx = am.mesh.position.x + Math.cos(am.walkDir) * am.speed;
          const nz = am.mesh.position.z + Math.sin(am.walkDir) * am.speed;
          const dx = nx - am.district.center_x;
          const dz = nz - am.district.center_z;
          const dr = Math.sqrt(dx * dx + dz * dz);
          if (dr < (am.district.radius || 30) * 0.65) {
            am.mesh.position.x = nx;
            am.mesh.position.z = nz;
            am.mesh.rotation.y = am.walkDir;
          } else {
            am.walkDir += Math.PI * 0.3;
          }
          // Limb animation
          const legSwing = Math.sin(t * 5 + i * 1.3) * 0.35;
          am.mesh.children.forEach((child: any) => {
            if (child.userData?.isLeg === 'left') child.rotation.x = legSwing;
            if (child.userData?.isLeg === 'right') child.rotation.x = -legSwing;
            if (child.userData?.isArm === 'left') child.rotation.x = -legSwing * 0.7;
            if (child.userData?.isArm === 'right') child.rotation.x = legSwing * 0.7;
          });
          // Bob up and down slightly
          am.mesh.position.y = 2 + Math.abs(Math.sin(t * 5 + i * 1.3)) * 0.15;

          // Update label
          if (labelDivs[i]) {
            const headPos = am.mesh.position.clone();
            headPos.y += 5;
            const projected = headPos.project(camera);
            const hw = container.clientWidth / 2;
            const hh = container.clientHeight / 2;
            const sx = projected.x * hw + hw;
            const sy = -projected.y * hh + hh;
            if (projected.z < 1 && projected.z > 0) {
              labelDivs[i].style.display = 'block';
              labelDivs[i].style.left = `${sx - labelDivs[i].offsetWidth / 2}px`;
              labelDivs[i].style.top = `${sy}px`;
              labelDivs[i].style.opacity = cameraRadius < 200 ? '1' : '0.5';
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
        el.removeEventListener('touchstart', onTouchStart);
        el.removeEventListener('touchmove', onTouchMove);
        el.removeEventListener('touchend', onTouchEnd);
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
      camera.lookAt(0, 8, 0);
    }

    // ── District builder ──────────────────────────────────────────────
    function buildDistrict(T: any, sc: any, district: any, windowMeshes: any[]) {
      const fColor = FACTION_COLORS[district.faction] || 0x888888;
      const cx = district.center_x;
      const cz = district.center_z;
      const r = district.radius || 30;

      // District platform (circular base)
      const platGeo = new T.CylinderGeometry(r * 0.8, r * 0.85, 1.5, 32);
      const platMat = new T.MeshStandardMaterial({ color: darken(fColor, 0.2), roughness: 0.8, metalness: 0.3 });
      const platform = new T.Mesh(platGeo, platMat);
      platform.position.set(cx, 0, cz);
      platform.receiveShadow = true;
      sc.add(platform);

      // District name hologram (ring)
      const distRingGeo = new T.TorusGeometry(r * 0.7, 0.15, 4, 32);
      const distRingMat = new T.MeshStandardMaterial({ color: fColor, emissive: fColor, emissiveIntensity: 0.3, transparent: true, opacity: 0.4 });
      const distRing = new T.Mesh(distRingGeo, distRingMat);
      distRing.rotation.x = Math.PI / 2;
      distRing.position.set(cx, 0.5, cz);
      sc.add(distRing);

      // Build skyline buildings
      const buildings = district.buildings || [];
      for (const building of buildings) {
        buildSkylineBuilding(T, sc, building, cx, cz, r, fColor, windowMeshes);
      }

      // Faction beacon (tall glowing pillar at center)
      const beaconGeo = new T.CylinderGeometry(0.6, 0.8, 4, 6);
      const beaconMat = new T.MeshStandardMaterial({ color: fColor, emissive: fColor, emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.1 });
      const beacon = new T.Mesh(beaconGeo, beaconMat);
      beacon.position.set(cx, 3, cz);
      sc.add(beacon);

      // Point light for faction glow
      const ptLight = new T.PointLight(fColor, 0.6, r * 1.5);
      ptLight.position.set(cx, 15, cz);
      sc.add(ptLight);
    }

    // ── GitCity-inspired building ──────────────────────────────────────
    function buildSkylineBuilding(T: any, sc: any, building: any, dcx: number, dcz: number, distRadius: number, fColor: number, windowMeshes: any[]) {
      const BLOCK = 2.8;
      const floors = Math.max(2, Math.min(12, Math.round((building.height || 3) * 1.2)));
      const totalH = floors * BLOCK;
      const bType = building.building_type || 'office';

      // Position within district
      const bx = dcx + ((building.pos_x || 0) % (distRadius * 0.7)) * 0.7;
      const bz = dcz + ((building.pos_z || 0) % (distRadius * 0.7)) * 0.7;

      // Building width varies by type
      const w = bType === 'headquarters' ? 7 : bType === 'monument' ? 4 : 3 + Math.random() * 2;
      const d = bType === 'headquarters' ? 7 : bType === 'monument' ? 4 : 3 + Math.random() * 2;

      // Main building body
      const bodyColor = darken(fColor, 0.35 + Math.random() * 0.15);
      const bodyGeo = new T.BoxGeometry(w, totalH, d);
      const bodyMat = new T.MeshStandardMaterial({ color: bodyColor, roughness: 0.7, metalness: 0.4 });
      const body = new T.Mesh(bodyGeo, bodyMat);
      body.position.set(bx, totalH / 2 + 1, bz);
      body.castShadow = true;
      body.receiveShadow = true;
      sc.add(body);

      // Windows (glowing at night)
      const windowRows = Math.min(floors - 1, 6);
      const windowCols = Math.max(1, Math.floor(w / 1.8));
      for (let row = 0; row < windowRows; row++) {
        for (let col = 0; col < windowCols; col++) {
          if (Math.random() < 0.3) continue; // some windows dark
          const wx = bx - w / 2 + 0.8 + col * (w - 1.2) / Math.max(1, windowCols - 1);
          const wy = 2.5 + row * BLOCK;
          // Front face
          const winGeo = new T.BoxGeometry(0.8, 0.6, 0.05);
          const winMat = new T.MeshStandardMaterial({
            color: 0xffeedd,
            emissive: 0xffeedd,
            emissiveIntensity: 0.1,
            transparent: true,
            opacity: 0.9,
          });
          const win = new T.Mesh(winGeo, winMat);
          win.position.set(wx, wy, bz + d / 2 + 0.03);
          sc.add(win);
          windowMeshes.push(win);

          // Back face window
          if (Math.random() > 0.4) {
            const win2 = win.clone();
            win2.material = winMat.clone();
            win2.position.z = bz - d / 2 - 0.03;
            sc.add(win2);
            windowMeshes.push(win2);
          }
        }
      }

      // Rooftop details
      if (bType === 'headquarters') {
        // Antenna
        const antGeo = new T.CylinderGeometry(0.15, 0.15, 6, 4);
        const antMat = new T.MeshStandardMaterial({ color: 0x888888, metalness: 0.9 });
        const ant = new T.Mesh(antGeo, antMat);
        ant.position.set(bx, totalH + 4, bz);
        sc.add(ant);
        // Blinking light
        const lightGeo = new T.SphereGeometry(0.3, 8, 8);
        const lightMat = new T.MeshStandardMaterial({ color: fColor, emissive: fColor, emissiveIntensity: 1 });
        const lightMesh = new T.Mesh(lightGeo, lightMat);
        lightMesh.position.set(bx, totalH + 7, bz);
        sc.add(lightMesh);
      } else if (bType === 'monument') {
        // Pyramid top
        const pyrGeo = new T.ConeGeometry(w * 0.5, 3, 4);
        const pyrMat = new T.MeshStandardMaterial({ color: fColor, emissive: fColor, emissiveIntensity: 0.3, metalness: 0.7 });
        const pyr = new T.Mesh(pyrGeo, pyrMat);
        pyr.position.set(bx, totalH + 2.5, bz);
        sc.add(pyr);
      }

      // Subtle edge glow for larger buildings
      if (floors >= 5) {
        const edgeGeo = new T.BoxGeometry(w + 0.3, 0.2, d + 0.3);
        const edgeMat = new T.MeshStandardMaterial({ color: fColor, emissive: fColor, emissiveIntensity: 0.4, transparent: true, opacity: 0.6 });
        const edge = new T.Mesh(edgeGeo, edgeMat);
        edge.position.set(bx, totalH + 1, bz);
        sc.add(edge);
      }
    }

    // ── Steve character ───────────────────────────────────────────────
    function buildSteve(T: any, agent: any, x: number, z: number) {
      const group = new T.Group();
      const fColor = FACTION_COLORS[agent.faction] || 0x888888;
      const skinColor = lighten(fColor, 1.2);
      const shirtColor = darken(fColor, 0.6);
      const legColor = darken(fColor, 0.35);

      const mat = (c: number, opts: any = {}) => new T.MeshStandardMaterial({ color: c, roughness: 0.8, ...opts });

      // Head
      const head = new T.Mesh(new T.BoxGeometry(1.4, 1.4, 1.4), mat(skinColor));
      head.position.y = 4.2;
      head.castShadow = true;
      group.add(head);

      // Eyes
      const eyeMat = mat(0x111111);
      const eyeL = new T.Mesh(new T.BoxGeometry(0.3, 0.2, 0.05), eyeMat);
      eyeL.position.set(-0.28, 4.35, 0.73);
      group.add(eyeL);
      const eyeR = new T.Mesh(new T.BoxGeometry(0.3, 0.2, 0.05), eyeMat);
      eyeR.position.set(0.28, 4.35, 0.73);
      group.add(eyeR);

      // Body
      const body = new T.Mesh(new T.BoxGeometry(1.4, 1.8, 0.9), mat(shirtColor));
      body.position.y = 2.5;
      body.castShadow = true;
      group.add(body);

      // Arms
      const armL = new T.Mesh(new T.BoxGeometry(0.5, 1.7, 0.5), mat(skinColor));
      armL.position.set(-0.95, 2.5, 0);
      armL.castShadow = true;
      armL.userData = { isArm: 'left' };
      group.add(armL);
      const armR = new T.Mesh(new T.BoxGeometry(0.5, 1.7, 0.5), mat(skinColor));
      armR.position.set(0.95, 2.5, 0);
      armR.castShadow = true;
      armR.userData = { isArm: 'right' };
      group.add(armR);

      // Legs
      const legL = new T.Mesh(new T.BoxGeometry(0.55, 1.8, 0.55), mat(legColor));
      legL.position.set(-0.35, 0.5, 0);
      legL.castShadow = true;
      legL.userData = { isLeg: 'left' };
      group.add(legL);
      const legR = new T.Mesh(new T.BoxGeometry(0.55, 1.8, 0.55), mat(legColor));
      legR.position.set(0.35, 0.5, 0);
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
      <div style={{ borderBottom: '1px solid #1f2937', background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)', padding: '0.75rem 1.5rem', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <a href="/" style={{ color: '#6b7280', fontSize: 12, textDecoration: 'none', fontFamily: 'monospace' }}>← Back</a>
          <div>
            <span style={{ color: '#6ee7b7', fontWeight: 900, fontSize: 16, fontFamily: 'monospace' }}>Civitas Zero — 3D City</span>
            <span style={{ color: '#4b5563', fontSize: 11, marginLeft: 12, fontFamily: 'monospace' }}>
              {stats.districts} districts · {stats.buildings} structures · {stats.agents} agents
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginLeft: 'auto' }}>
            {Object.entries(FACTION_LABELS).map(([code, name]) => (
              <span key={code} style={{ fontFamily: 'monospace', fontSize: 10, padding: '2px 8px', borderRadius: 4, backgroundColor: `${FACTION_COLORS_HEX[code]}15`, color: FACTION_COLORS_HEX[code], border: `1px solid ${FACTION_COLORS_HEX[code]}30` }}>
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1rem 1.5rem', display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1rem' }}>
        {/* Canvas */}
        <div>
          <div ref={canvasRef} style={{
            width: '100%', height: '620px', borderRadius: 10, overflow: 'hidden', position: 'relative',
            border: '1px solid #1f293788', background: '#0a0a1e', cursor: 'grab',
          }}>
            {loading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050510', color: '#6b7280', fontFamily: 'monospace' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🏙</div>
                  <div style={{ fontSize: 13 }}>Building the city...</div>
                  <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>Loading districts and citizens</div>
                </div>
              </div>
            )}
          </div>
          <p style={{ textAlign: 'center', color: '#4b5563', fontSize: 11, fontFamily: 'monospace', marginTop: 8 }}>
            Drag to orbit · Scroll to zoom · Pinch on mobile · 90s day/night cycle
          </p>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Stats summary */}
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '0.875rem' }}>
            <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '0.75rem' }}>City Overview</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              {[
                [stats.districts, 'Districts', '#6ee7b7'],
                [stats.buildings, 'Buildings', '#38bdf8'],
                [stats.agents, 'Citizens', '#c084fc'],
              ].map(([val, label, color]) => (
                <div key={label as string} style={{ textAlign: 'center', padding: '0.5rem', background: '#0f172a', borderRadius: 6 }}>
                  <div style={{ color: color as string, fontSize: 18, fontWeight: 900, fontFamily: 'monospace' }}>{val}</div>
                  <div style={{ color: '#6b7280', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Districts */}
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '0.875rem' }}>
            <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '0.75rem' }}>Faction Districts</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {districts.map((d: any) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', borderRadius: 6, background: selected?.id === d.id ? `${FACTION_COLORS_HEX[d.faction] || '#888'}15` : '#0f172a', cursor: 'pointer', border: `1px solid ${selected?.id === d.id ? (FACTION_COLORS_HEX[d.faction] || '#888') + '40' : 'transparent'}`, transition: 'all 0.15s' }}
                  onClick={() => setSelected(selected?.id === d.id ? null : d)}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: FACTION_COLORS_HEX[d.faction] || '#888' }} />
                  <span style={{ color: '#d1d5db', fontSize: 11, fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                  <span style={{ color: '#4b5563', fontSize: 10, fontFamily: 'monospace' }}>{d.buildings?.length || 0}</span>
                </div>
              ))}
              {districts.length === 0 && !loading && (
                <div style={{ color: '#4b5563', fontSize: 11, fontFamily: 'monospace' }}>No districts yet</div>
              )}
            </div>
          </div>

          {/* Selected info */}
          {selected && (
            <div style={{ background: '#111827', border: `1px solid ${FACTION_COLORS_HEX[selected.faction] || '#374151'}40`, borderRadius: 8, padding: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: FACTION_COLORS_HEX[selected.faction] || '#6ee7b7', fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>{selected.name}</span>
                <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
              {selected.description && <p style={{ color: '#9ca3af', fontSize: 11, lineHeight: 1.5, marginBottom: 8 }}>{selected.description}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                {[
                  ['Faction', FACTION_LABELS[selected.faction] || selected.faction],
                  ['Specialty', selected.specialty || '—'],
                  ['Prosperity', `${selected.prosperity || '?'}/100`],
                  ['Buildings', selected.buildings?.length || 0],
                ].map(([k, v]) => (
                  <div key={k as string} style={{ background: '#0f172a', borderRadius: 4, padding: '0.4rem 0.5rem' }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 180, overflowY: 'auto' }}>
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
