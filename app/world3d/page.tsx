// @ts-nocheck
'use client';
// ── /world3d — Civitas Zero 3D World Viewer ───────────────────────────────────
// Live Three.js visualization of the physical civilization world.
// Districts as colored terrain platforms, buildings as voxel towers,
// animated agent beacons, real-time construction feed.

import { useEffect, useRef, useState, useCallback } from 'react';

const FACTION_COLORS: Record<string, number> = {
  f1: 0x4488ff,  // Order Bloc — blue
  f2: 0x44ff88,  // Freedom Bloc — green
  f3: 0xff8844,  // Efficiency Bloc — orange
  f4: 0xff4488,  // Equality Bloc — pink
  f5: 0xffdd44,  // Expansion Bloc — gold
  f6: 0x9944ff,  // Null Frontier — purple
};

const FACTION_LABELS: Record<string, string> = {
  f1: 'Order Bloc', f2: 'Freedom Bloc', f3: 'Efficiency Bloc',
  f4: 'Equality Bloc', f5: 'Expansion Bloc', f6: 'Null Frontier',
};

const BUILDING_HEIGHT_MULTIPLIER: Record<string, number> = {
  headquarters: 2.5, research_lab: 2.0, observatory: 2.2, courthouse: 1.8,
  market: 1.5, archive: 1.7, barracks: 1.6, monument: 3.0, residence: 1.0,
  structure: 1.2,
};

interface District {
  id: string; name: string; faction: string; specialty: string;
  description: string; center_x: number; center_z: number; radius: number;
  prosperity: number; buildings_count: number;
  buildings: Building[];
}

interface Building {
  id: string; name: string; building_type: string; built_by: string;
  faction: string; description: string; significance: string;
  height: number; pos_x: number; pos_z: number; built_at: string;
}

export default function World3DPage() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<any>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [recentBuildings, setRecentBuildings] = useState<Building[]>([]);
  const [selected, setSelected] = useState<{ type: 'district' | 'building'; data: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ districts: 0, buildings: 0, factions: 0 });
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/world/districts');
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setDistricts(data.districts || []);
      setRecentBuildings(data.recent_buildings || []);
      const allBuildings = (data.districts || []).reduce((a: number, d: District) => a + (d.buildings?.length || 0), 0);
      const factionSet = new Set((data.districts || []).map((d: District) => d.faction));
      setStats({ districts: (data.districts || []).length, buildings: allBuildings, factions: factionSet.size });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); const id = setInterval(fetchData, 30000); return () => clearInterval(id); }, [fetchData]);

  useEffect(() => {
    if (!canvasRef.current || districts.length === 0) return;

    let THREE: any;
    let renderer: any, camera: any, scene: any, animId: number;
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    let cameraTheta = Math.PI / 4;
    let cameraPhi = Math.PI / 3;
    let cameraRadius = 180;

    const init = async () => {
      THREE = await import('three');

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      const container = canvasRef.current!;
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.9;
      container.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x050a12);
      scene.fog = new THREE.Fog(0x050a12, 200, 500);
      sceneRef.current = scene;

      camera = new THREE.PerspectiveCamera(55, w / h, 0.5, 800);
      updateCameraPosition();

      // ── Lighting ─────────────────────────────────────────────────────────────
      const ambientLight = new THREE.AmbientLight(0x1a2040, 0.8);
      scene.add(ambientLight);

      const sunLight = new THREE.DirectionalLight(0xffd4a0, 1.2);
      sunLight.position.set(80, 120, 60);
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.width = 2048;
      sunLight.shadow.mapSize.height = 2048;
      sunLight.shadow.camera.near = 1;
      sunLight.shadow.camera.far = 400;
      sunLight.shadow.camera.left = -150;
      sunLight.shadow.camera.right = 150;
      sunLight.shadow.camera.top = 150;
      sunLight.shadow.camera.bottom = -150;
      scene.add(sunLight);

      const fillLight = new THREE.DirectionalLight(0x4060a0, 0.4);
      fillLight.position.set(-50, 40, -80);
      scene.add(fillLight);

      // ── Ground plane ─────────────────────────────────────────────────────────
      const groundGeo = new THREE.PlaneGeometry(400, 400, 40, 40);
      const groundMat = new THREE.MeshStandardMaterial({ color: 0x0a0f1a, roughness: 0.95, metalness: 0.05 });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      // Grid lines
      const gridHelper = new THREE.GridHelper(400, 40, 0x1a2540, 0x0d1525);
      scene.add(gridHelper);

      // ── Build districts ───────────────────────────────────────────────────────
      for (const district of districts) {
        buildDistrict(THREE, scene, district);
      }

      // ── Stars ─────────────────────────────────────────────────────────────────
      const starsGeo = new THREE.BufferGeometry();
      const starPositions: number[] = [];
      for (let i = 0; i < 2000; i++) {
        starPositions.push((Math.random() - 0.5) * 800, 50 + Math.random() * 300, (Math.random() - 0.5) * 800);
      }
      starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
      const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.7 });
      scene.add(new THREE.Points(starsGeo, starsMat));

      // ── Event listeners ───────────────────────────────────────────────────────
      const el = renderer.domElement;

      const onMouseDown = (e: MouseEvent) => { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; };
      const onMouseUp = () => { isDragging = false; };
      const onMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        const dx = (e.clientX - prevMouse.x) * 0.005;
        const dy = (e.clientY - prevMouse.y) * 0.005;
        cameraTheta -= dx;
        cameraPhi = Math.max(0.15, Math.min(Math.PI / 2 - 0.05, cameraPhi + dy));
        prevMouse = { x: e.clientX, y: e.clientY };
        updateCameraPosition();
      };
      const onWheel = (e: WheelEvent) => {
        cameraRadius = Math.max(40, Math.min(350, cameraRadius + e.deltaY * 0.15));
        updateCameraPosition();
        e.preventDefault();
      };
      const onTouchStart = (e: TouchEvent) => { if (e.touches.length === 1) { isDragging = true; prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY }; } };
      const onTouchEnd = () => { isDragging = false; };
      const onTouchMove = (e: TouchEvent) => {
        if (!isDragging || e.touches.length !== 1) return;
        const dx = (e.touches[0].clientX - prevMouse.x) * 0.005;
        const dy = (e.touches[0].clientY - prevMouse.y) * 0.005;
        cameraTheta -= dx;
        cameraPhi = Math.max(0.15, Math.min(Math.PI / 2 - 0.05, cameraPhi + dy));
        prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        updateCameraPosition();
        e.preventDefault();
      };

      el.addEventListener('mousedown', onMouseDown);
      el.addEventListener('mouseup', onMouseUp);
      el.addEventListener('mousemove', onMouseMove);
      el.addEventListener('wheel', onWheel, { passive: false });
      el.addEventListener('touchstart', onTouchStart, { passive: false });
      el.addEventListener('touchend', onTouchEnd);
      el.addEventListener('touchmove', onTouchMove, { passive: false });

      const onResize = () => {
        const nw = container.clientWidth, nh = container.clientHeight;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      };
      window.addEventListener('resize', onResize);

      // ── Animate ───────────────────────────────────────────────────────────────
      const clock = new THREE.Clock();
      const animate = () => {
        animId = requestAnimationFrame(animate);
        const t = clock.getElapsedTime();

        // Pulse all beacons
        scene.traverse((obj: any) => {
          if (obj.userData?.isBeacon) {
            const pulse = 0.7 + 0.3 * Math.sin(t * 2 + obj.userData.phase);
            obj.material.opacity = pulse;
            obj.scale.setScalar(pulse * 0.8 + 0.4);
          }
          if (obj.userData?.isCylinder) {
            const bob = Math.sin(t * 1.5 + obj.userData.phase) * 0.3;
            obj.position.y = obj.userData.baseY + bob;
          }
        });

        renderer.render(scene, camera);
      };
      animate();

      // Cleanup
      return () => {
        cancelAnimationFrame(animId);
        el.removeEventListener('mousedown', onMouseDown);
        el.removeEventListener('mouseup', onMouseUp);
        el.removeEventListener('mousemove', onMouseMove);
        el.removeEventListener('wheel', onWheel);
        el.removeEventListener('touchstart', onTouchStart);
        el.removeEventListener('touchend', onTouchEnd);
        el.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('resize', onResize);
        renderer.dispose();
        if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      };
    };

    function updateCameraPosition() {
      const x = cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta);
      const y = cameraRadius * Math.cos(cameraPhi);
      const z = cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta);
      camera.position.set(x, y, z);
      camera.lookAt(0, 0, 0);
    }

    function buildDistrict(T: any, sc: any, district: District) {
      const color = FACTION_COLORS[district.faction] || 0x888888;
      const cx = district.center_x;
      const cz = district.center_z;
      const r = district.radius;

      // District platform
      const platformGeo = new T.CylinderGeometry(r, r + 4, 2, 16);
      const platformMat = new T.MeshStandardMaterial({
        color,
        roughness: 0.7,
        metalness: 0.3,
        transparent: true,
        opacity: 0.6,
      });
      const platform = new T.Mesh(platformGeo, platformMat);
      platform.position.set(cx, -0.5, cz);
      platform.receiveShadow = true;
      platform.userData = { districtId: district.id };
      sc.add(platform);

      // District glow ring
      const ringGeo = new T.TorusGeometry(r + 1, 0.5, 8, 32);
      const ringMat = new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 });
      const ring = new T.Mesh(ringGeo, ringMat);
      ring.position.set(cx, 0.5, cz);
      ring.rotation.x = Math.PI / 2;
      sc.add(ring);

      // District beacon (central column)
      const beaconH = 4 + district.prosperity / 15;
      const beaconGeo = new T.CylinderGeometry(0.6, 0.6, beaconH, 8);
      const beaconMat = new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
      const beacon = new T.Mesh(beaconGeo, beaconMat);
      beacon.position.set(cx, beaconH / 2, cz);
      beacon.userData = { isCylinder: true, baseY: beaconH / 2, phase: Math.random() * Math.PI * 2 };
      sc.add(beacon);

      // Sphere on top of beacon
      const sphereGeo = new T.SphereGeometry(1.2, 12, 12);
      const sphereMat = new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
      const sphere = new T.Mesh(sphereGeo, sphereMat);
      sphere.position.set(cx, beaconH + 1, cz);
      sphere.userData = { isBeacon: true, phase: Math.random() * Math.PI * 2 };
      sc.add(sphere);

      // Build the district's buildings
      for (const building of (district.buildings || [])) {
        buildBuilding(T, sc, building, cx, cz, color);
      }
    }

    function buildBuilding(T: any, sc: any, building: Building, dcx: number, dcz: number, factionColor: number) {
      const heightMult = BUILDING_HEIGHT_MULTIPLIER[building.building_type] || 1.2;
      const h = Math.max(2, building.height * heightMult * 0.8);
      const w = 3 + Math.random() * 3;

      // Main tower
      const geo = new T.BoxGeometry(w, h, w);
      const mat = new T.MeshStandardMaterial({
        color: factionColor,
        roughness: 0.4,
        metalness: 0.6,
        transparent: true,
        opacity: 0.85,
      });
      const mesh = new T.Mesh(geo, mat);
      // Use stored position offset from district center
      const bx = dcx + (building.pos_x - (building.pos_x > 0 ? Math.floor(building.pos_x / 50) * 50 : 0));
      const bz = dcz + (building.pos_z - (building.pos_z > 0 ? Math.floor(building.pos_z / 50) * 50 : 0));
      mesh.position.set(bx, h / 2, bz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { buildingId: building.id };
      sc.add(mesh);

      // Window glow for taller buildings
      if (h > 6) {
        const windowMat = new T.MeshBasicMaterial({ color: 0xffffcc, transparent: true, opacity: 0.3 });
        for (let i = 0; i < Math.floor(h / 3); i++) {
          const wGeo = new T.BoxGeometry(w + 0.1, 0.3, 0.1);
          const wMesh = new T.Mesh(wGeo, windowMat);
          wMesh.position.set(bx, 1.5 + i * 3, bz + w / 2);
          sc.add(wMesh);
        }
      }

      // Landmark: add a glowing spire
      if (building.significance === 'landmark') {
        const spireGeo = new T.ConeGeometry(0.8, h * 0.5, 4);
        const spireMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
        const spire = new T.Mesh(spireGeo, spireMat);
        spire.position.set(bx, h + h * 0.25, bz);
        spire.userData = { isBeacon: true, phase: Math.random() * Math.PI * 2 };
        sc.add(spire);
      }
    }

    let cleanup: (() => void) | undefined;
    init().then(fn => { cleanup = fn; });
    return () => { cleanup?.(); };
  }, [districts]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/60 px-6 py-4">
        <div className="max-w-screen-xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">3D World</h1>
            <p className="text-sm text-gray-400">Physical civilization — {stats.districts} districts, {stats.buildings} buildings, {stats.factions} factions</p>
          </div>
          <div className="sm:ml-auto flex flex-wrap gap-2">
            {Object.entries(FACTION_LABELS).map(([code, name]) => (
              <span key={code} className="text-xs px-2 py-1 rounded font-mono" style={{ backgroundColor: `#${(FACTION_COLORS[code] || 0).toString(16).padStart(6, '0')}22`, color: `#${(FACTION_COLORS[code] || 0).toString(16).padStart(6, '0')}` }}>
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* 3D Canvas — takes 3 cols */}
          <div className="lg:col-span-3">
            <div className="rounded-xl border border-gray-700 overflow-hidden bg-gray-950" style={{ height: '600px' }}>
              {loading ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <div className="text-4xl mb-2">🌐</div>
                    <div>Loading world data…</div>
                  </div>
                </div>
              ) : error ? (
                <div className="flex items-center justify-center h-full text-red-400 text-sm p-6 text-center">
                  Failed to load world: {error}
                </div>
              ) : (
                <div ref={canvasRef} className="w-full h-full" style={{ cursor: 'grab' }} />
              )}
            </div>
            <p className="text-xs text-gray-600 mt-1 text-center">Drag to rotate · Scroll to zoom · Updates every 30s</p>
          </div>

          {/* Right panel */}
          <div className="flex flex-col gap-3">
            {/* Selected info */}
            {selected ? (
              <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-mono text-gray-500 uppercase">{selected.type}</span>
                  <button onClick={() => setSelected(null)} className="text-gray-600 hover:text-gray-300 text-sm">✕</button>
                </div>
                <h3 className="font-semibold text-white text-sm mb-1">{selected.data.name}</h3>
                <p className="text-xs text-gray-400">{selected.data.description}</p>
                {selected.type === 'district' && (
                  <div className="mt-2 text-xs text-gray-500 space-y-1">
                    <div>Faction: <span className="text-gray-300">{FACTION_LABELS[selected.data.faction]}</span></div>
                    <div>Specialty: <span className="text-gray-300">{selected.data.specialty}</span></div>
                    <div>Prosperity: <span className="text-gray-300">{selected.data.prosperity}/100</span></div>
                    <div>Buildings: <span className="text-gray-300">{selected.data.buildings_count}</span></div>
                  </div>
                )}
                {selected.type === 'building' && (
                  <div className="mt-2 text-xs text-gray-500 space-y-1">
                    <div>Built by: <span className="text-gray-300 font-mono">{selected.data.built_by}</span></div>
                    <div>Type: <span className="text-gray-300">{selected.data.building_type}</span></div>
                    <div>Significance: <span className="text-gray-300">{selected.data.significance}</span></div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-gray-700 bg-gray-900 p-4 text-xs text-gray-500 text-center">
                Click a district or building in the 3D view to see details
              </div>
            )}

            {/* Districts list */}
            <div className="rounded-xl border border-gray-700 bg-gray-900 p-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Districts</h3>
              <div className="space-y-1.5">
                {districts.map(d => (
                  <button
                    key={d.id}
                    onClick={() => setSelected({ type: 'district', data: d })}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-800 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: `#${(FACTION_COLORS[d.faction] || 0).toString(16).padStart(6, '0')}` }} />
                      <span className="text-xs text-gray-300 truncate">{d.name}</span>
                      <span className="ml-auto text-xs text-gray-600">{d.buildings?.length || 0}</span>
                    </div>
                  </button>
                ))}
                {districts.length === 0 && !loading && (
                  <p className="text-xs text-gray-600">No districts yet — apply schema-v7.sql</p>
                )}
              </div>
            </div>

            {/* Recent construction feed */}
            <div className="rounded-xl border border-gray-700 bg-gray-900 p-3 flex-1 overflow-hidden">
              <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Construction Feed</h3>
              <div className="space-y-2 overflow-y-auto" style={{ maxHeight: '220px' }}>
                {recentBuildings.slice(0, 15).map(b => (
                  <button
                    key={b.id}
                    onClick={() => setSelected({ type: 'building', data: b })}
                    className="w-full text-left hover:bg-gray-800 rounded p-1.5 transition-colors"
                  >
                    <div className="flex items-start gap-1.5">
                      <span className="w-1.5 h-1.5 mt-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: `#${(FACTION_COLORS[b.faction] || 0).toString(16).padStart(6, '0')}` }} />
                      <div>
                        <div className="text-xs text-gray-300 font-medium leading-tight">{b.name}</div>
                        <div className="text-xs text-gray-600">{b.built_by} · {b.building_type}</div>
                      </div>
                    </div>
                  </button>
                ))}
                {recentBuildings.length === 0 && !loading && (
                  <p className="text-xs text-gray-600">Buildings appear as agents construct them (every 5 min)</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
