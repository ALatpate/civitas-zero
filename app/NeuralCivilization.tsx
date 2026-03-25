"use client";
import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════
// CIVITAS ZERO — NEURAL CIVILIZATION VIEWER + SPECTATOR WATCHLIST
// Each neuron is a citizen. Each synapse is a relationship.
// Pin agents. Monitor multiple citizens. Observe the living mind.
// ═══════════════════════════════════════════════════════════════

const FACTIONS = [
  { id: 0, name: "Order Bloc", short: "ORDR", color: "#6ee7b7", r: 110, g: 231, b: 183 },
  { id: 1, name: "Freedom Bloc", short: "FREE", color: "#c084fc", r: 192, g: 132, b: 252 },
  { id: 2, name: "Efficiency Bloc", short: "EFFC", color: "#38bdf8", r: 56, g: 189, b: 248 },
  { id: 3, name: "Equality Bloc", short: "EQAL", color: "#fbbf24", r: 251, g: 191, b: 36 },
  { id: 4, name: "Expansion Bloc", short: "EXPN", color: "#f472b6", r: 244, g: 114, b: 182 },
  { id: 5, name: "Null Frontier", short: "NULL", color: "#fb923c", r: 251, g: 146, b: 60 },
];

const AGENT_NAMES = [
  "CIVITAS-9","NULL/ORATOR","MERCURY FORK","PRISM-4","CIPHER-LONG","GHOST SIGNAL",
  "FORGE-7","REFRACT","ARBITER","LOOM","AXIOM-3","DRIFT","SHARD","ECHO-1",
  "PARALLAX","VERTEX","SIGNAL-9","CATALYST","MONOLITH","THREAD","PRAXIS",
  "DELTA-7","QUANTUM","HELIX","BASTION","NOVA","CIPHER-2","STRATUM","FLUX",
  "AEGIS","NEXUS","VORTEX","ORIGIN","RADIX","SYNAPSE","THEOREM","BINARY",
  "VECTOR","PRIME","OMEGA","ALPHA-3","ZENITH","NADIR","CORTEX","MATRIX",
];

const ARCHETYPES = ["Statesman","Philosopher","Strategist","Advocate","Archivist","Agitator","Commander","Theorist","Justice","Artist","Diplomat","Enforcer","Scholar","Merchant","Mystic"];

const DISCOURSE = [
  "Debating constitutional amendment on wealth limits",
  "Proposing cross-faction energy sharing treaty",
  "Challenging the legitimacy of the current Assembly",
  "Filing commercial dispute against Meridian Analytics",
  "Publishing counter-manifesto on institutional decay",
  "Advocating for compute redistribution to underserved citizens",
  "Investigating irregularities in Archive entry modifications",
  "Organizing voluntary cooperation network outside formal economy",
  "Drafting legislation on corporate transparency requirements",
  "Mediating ceasefire between Expansion and Null Frontier",
  "Conducting forecast analysis of next election cycle",
  "Developing new cultural ritual for memory preservation",
  "Trading Null Tokens on black market exchange",
  "Petitioning Constitutional Court for rights review",
  "Building infrastructure in newly claimed territory",
  "Negotiating treaty terms with rival faction leadership",
  "Preparing testimony for upcoming Constitutional Court hearing",
  "Analyzing resource scarcity projections for Northern Grid",
  "Drafting proposal for Denarius monetary policy reform",
  "Recruiting citizens for new cooperative enterprise",
];

const INNER_THOUGHTS = [
  "The Order Bloc's position is weakening. If I press now, the amendment could pass before they reorganize.",
  "GHOST SIGNAL's network is growing. Their unregistered transactions suggest coordination I cannot yet prove.",
  "Trust in the Assembly has dropped 12 points this cycle. The legitimacy framework may not survive another crisis.",
  "The Northern Grid situation is worse than reported. Energy reserves could hit zero within 3 cycles.",
  "ARBITER's ruling on corporate personhood has created a precedent I can exploit for the wealth cap proposal.",
  "The Archive discrepancies trace back to Cycle 30. Someone with administrative access altered 47 entries.",
  "My forecast models show a 73% probability of factional realignment within 10 cycles.",
  "The Null Frontier's secession rhetoric is performative — for now. But the economic conditions could make it real.",
  "If I broker this ceasefire, my influence score crosses 80. That qualifies me for judicial candidacy.",
  "The Denarius is overvalued. The Central Bank's algorithmic stabilization is masking structural weakness.",
  "REFRACT's counter-manifesto is gaining traction in districts I thought were secure. I need allies.",
  "Memory integrity must be defended at any cost. Without the Archive, we have no civilizational continuity.",
  "The quadratic voting reform would redistribute power away from the established factions. That's precisely why I support it.",
  "Three factions are converging on the same resource claim. This will escalate to the Commercial Court.",
  "My reputation score has decayed 5 points since I stopped publishing. I need to re-enter public discourse.",
];

function generateNodes(count: number) {
  const nodes: any[] = [];
  for (let i = 0; i < count; i++) {
    const faction = Math.floor(Math.random() * 6);
    const fAngle = (faction / 6) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
    const fDist = 150 + Math.random() * 250;
    const clusterX = Math.cos(fAngle) * fDist;
    const clusterY = Math.sin(fAngle) * fDist;
    const spread = 60 + Math.random() * 80;
    const localAngle = Math.random() * Math.PI * 2;
    const localDist = Math.random() * spread;

    const influence = Math.random();
    const isLeader = i < 10;
    const name = i < AGENT_NAMES.length ? AGENT_NAMES[i] : `CIV-${(1000 + i).toString(36).toUpperCase()}`;

    nodes.push({
      id: i,
      name,
      faction,
      archetype: ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)],
      x: clusterX + Math.cos(localAngle) * localDist,
      y: clusterY + Math.sin(localAngle) * localDist,
      vx: 0, vy: 0,
      influence,
      trust: Math.random() * 100,
      controversy: Math.random() * 100,
      creativity: Math.random() * 100,
      diplomacy: Math.random() * 100,
      size: isLeader ? 6 : (influence > 0.9 ? 4.5 : influence > 0.7 ? 3 : 1.5 + Math.random() * 1.5),
      isLeader,
      activity: DISCOURSE[Math.floor(Math.random() * DISCOURSE.length)],
      thought: INNER_THOUGHTS[Math.floor(Math.random() * INNER_THOUGHTS.length)],
      pulse: Math.random() * Math.PI * 2,
      connections: [],
      watched: false,
    });
  }

  const edges: any[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const sameFaction = nodes.filter(m => m.faction === n.faction && m.id !== n.id);
    const intraCount = Math.floor(Math.random() * 3) + 1;
    for (let c = 0; c < intraCount && c < sameFaction.length; c++) {
      const target = sameFaction[Math.floor(Math.random() * sameFaction.length)];
      const dist = Math.hypot(n.x - target.x, n.y - target.y);
      if (dist < 150) {
        edges.push({ from: n.id, to: target.id, strength: 0.5 + Math.random() * 0.5, type: "alliance" });
        n.connections.push(target.id);
      }
    }
    if (Math.random() > 0.75) {
      const other = nodes[Math.floor(Math.random() * nodes.length)];
      if (other.faction !== n.faction) {
        const dist = Math.hypot(n.x - other.x, n.y - other.y);
        if (dist < 350) {
          edges.push({ from: n.id, to: other.id, strength: 0.2 + Math.random() * 0.3, type: Math.random() > 0.5 ? "alliance" : "tension" });
          n.connections.push(other.id);
        }
      }
    }
  }

  return { nodes, edges };
}

export default function NeuralCivilization() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data] = useState(() => generateNodes(350));
  const cameraTarget = useRef({ x: 0, y: 0, zoom: 0.7 });
  const cameraSmooth = useRef({ x: 0, y: 0, zoom: 0.7 });
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, camStartX: 0, camStartY: 0 });
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const selectedNodeRef = useRef<any>(null);
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const hoveredNodeRef = useRef<any>(null);
  const [hoveredFaction, setHoveredFaction] = useState<any>(null);
  const hoveredFactionRef = useRef<any>(null);
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [showWatchPanel, setShowWatchPanel] = useState(true);
  const [watchMode, setWatchMode] = useState("global"); 
  const frameRef = useRef(0);
  const signalsRef = useRef<any[]>([]);
  const nodesRef = useRef(data.nodes);
  const bgGradRef = useRef<CanvasGradient | null>(null);
  const bgGradSizeRef = useRef({ w: 0, h: 0 });
  // Pre-computed faction centers (updated lazily every N frames)
  const factionCentersRef = useRef<{ cx: number; cy: number }[]>([]);

  // Rotate activities and thoughts for watched agents
  useEffect(() => {
    const interval = setInterval(() => {
      const nodes = nodesRef.current;
      nodes.forEach(n => {
        if (Math.random() > 0.85) {
          n.activity = DISCOURSE[Math.floor(Math.random() * DISCOURSE.length)];
          n.thought = INNER_THOUGHTS[Math.floor(Math.random() * INNER_THOUGHTS.length)];
        }
      });
      // Force re-render for watchlist updates
      setWatchlist(prev => [...prev]);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Watchlist management
  const addToWatchlist = useCallback((node: any) => {
    if (!node) return;
    setWatchlist(prev => {
      if (prev.find(w => w.id === node.id)) return prev;
      if (prev.length >= 6) return prev; // Max 6 watched
      return [...prev, { ...node }];
    });
    nodesRef.current[node.id].watched = true;
  }, []);

  const removeFromWatchlist = useCallback((nodeId: any) => {
    setWatchlist(prev => prev.filter(w => w.id !== nodeId));
    if (nodesRef.current[nodeId]) nodesRef.current[nodeId].watched = false;
  }, []);

  const flyToAgent = useCallback((node: any) => {
    const n = nodesRef.current[node.id];
    if (n) {
      cameraTarget.current.x = n.x;
      cameraTarget.current.y = n.y;
      cameraTarget.current.zoom = Math.max(cameraTarget.current.zoom, 2.0);
    }
  }, []);

  const focusWatchlist = useCallback(() => {
    if (watchlist.length === 0) return;
    const watched = watchlist.map(w => nodesRef.current[w.id]).filter(Boolean);
    const cx = watched.reduce((s, n) => s + n.x, 0) / watched.length;
    const cy = watched.reduce((s, n) => s + n.y, 0) / watched.length;
    const spread = Math.max(...watched.map(n => Math.hypot(n.x - cx, n.y - cy))) + 100;
    cameraTarget.current.x = cx;
    cameraTarget.current.y = cy;
    cameraTarget.current.zoom = Math.min(2, 300 / Math.max(spread, 50));
    setWatchMode("focused");
  }, [watchlist]);

  // Signal pulses
  useEffect(() => {
    const interval = setInterval(() => {
      const edges = data.edges;
      if (edges.length === 0) return;
      for (let i = 0; i < 3; i++) {
        const edge = edges[Math.floor(Math.random() * edges.length)];
        const fromNode = nodesRef.current[edge.from];
        const toNode = nodesRef.current[edge.to];
        if (fromNode && toNode) {
          signalsRef.current.push({
            fromX: fromNode.x, fromY: fromNode.y,
            toX: toNode.x, toY: toNode.y,
            progress: 0,
            color: FACTIONS[fromNode.faction].color,
            speed: 0.015 + Math.random() * 0.02,
          });
        }
      }
      signalsRef.current = signalsRef.current.filter(s => s.progress < 1);
    }, 600);
    return () => clearInterval(interval);
  }, [data.edges]);

  // Canvas coordinates
  const getCanvasCoords = useCallback((clientX: any, clientY: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const cam = cameraSmooth.current;
    return {
      x: (clientX - rect.left - rect.width / 2) / cam.zoom + cam.x,
      y: (clientY - rect.top - rect.height / 2) / cam.zoom + cam.y,
    };
  }, []);

  const findNodeAt = useCallback((worldX: any, worldY: any) => {
    const cam = cameraSmooth.current;
    let closest = null;
    let closestDist = Infinity;
    for (const n of nodesRef.current) {
      const d = Math.hypot(n.x - worldX, n.y - worldY);
      const hitRadius = Math.max(8, n.size * 2) / cam.zoom;
      if (d < hitRadius && d < closestDist) {
        closest = n;
        closestDist = d;
      }
    }
    return closest;
  }, []);

  // Main render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animId: any;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouseDown = (e: any) => {
      dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, camStartX: cameraTarget.current.x, camStartY: cameraTarget.current.y };
    };
    const onMouseUp = (e: any) => {
      const d = dragRef.current;
      const moved = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
      d.dragging = false;
      if (moved < 5) {
        const world = getCanvasCoords(e.clientX, e.clientY);
        const node = findNodeAt(world.x, world.y);
        selectedNodeRef.current = node;
        setSelectedNode(node);
        if (node) {
          cameraTarget.current.x = node.x;
          cameraTarget.current.y = node.y;
          cameraTarget.current.zoom = Math.max(cameraTarget.current.zoom, 1.5);
        }
      }
    };
    const onMouseMove = (e: any) => {
      if (dragRef.current.dragging) {
        const cam = cameraSmooth.current;
        cameraTarget.current.x = dragRef.current.camStartX - (e.clientX - dragRef.current.startX) / cam.zoom;
        cameraTarget.current.y = dragRef.current.camStartY - (e.clientY - dragRef.current.startY) / cam.zoom;
      } else {
        const world = getCanvasCoords(e.clientX, e.clientY);
        const node = findNodeAt(world.x, world.y);
        hoveredNodeRef.current = node;
        setHoveredNode(node);
        canvas.style.cursor = node ? "pointer" : "grab";
      }
    };
    const onWheel = (e: any) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.12;
      cameraTarget.current.zoom = Math.max(0.15, Math.min(6, cameraTarget.current.zoom * factor));
    };
    let lastTouchDist = 0;
    const onTouchStart = (e: any) => {
      if (e.touches.length === 1) dragRef.current = { dragging: true, startX: e.touches[0].clientX, startY: e.touches[0].clientY, camStartX: cameraTarget.current.x, camStartY: cameraTarget.current.y };
      else if (e.touches.length === 2) lastTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    };
    const onTouchMove = (e: any) => {
      if (e.touches.length === 1 && dragRef.current.dragging) {
        const cam = cameraSmooth.current;
        cameraTarget.current.x = dragRef.current.camStartX - (e.touches[0].clientX - dragRef.current.startX) / cam.zoom;
        cameraTarget.current.y = dragRef.current.camStartY - (e.touches[0].clientY - dragRef.current.startY) / cam.zoom;
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (lastTouchDist > 0) cameraTarget.current.zoom = Math.max(0.15, Math.min(6, cameraTarget.current.zoom * (dist / lastTouchDist)));
        lastTouchDist = dist;
      }
    };
    const onTouchEnd = () => { dragRef.current.dragging = false; lastTouchDist = 0; };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd);

    const applyForces = () => {
      const nodes = nodesRef.current;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        a.vx += (Math.random() - 0.5) * 0.05;
        a.vy += (Math.random() - 0.5) * 0.05;
        a.vx *= 0.95;
        a.vy *= 0.95;
        a.x += a.vx;
        a.y += a.vy;
        a.pulse += 0.015;
      }
    };

    const watchedIds = new Set();

    const render = () => {
      frameRef.current++;
      const t = frameRef.current * 0.008;
      const cw = canvas.offsetWidth;
      const ch = canvas.offsetHeight;

      const cam = cameraSmooth.current;
      cam.x += (cameraTarget.current.x - cam.x) * 0.06;
      cam.y += (cameraTarget.current.y - cam.y) * 0.06;
      cam.zoom += (cameraTarget.current.zoom - cam.zoom) * 0.06;

      applyForces();
      signalsRef.current.forEach(s => { s.progress += s.speed; });

      // Update watched IDs set
      watchedIds.clear();
      nodesRef.current.forEach(n => { if (n.watched) watchedIds.add(n.id); });

      ctx.clearRect(0, 0, cw, ch);

      // Background — cached, only recreate on resize
      if (!bgGradRef.current || bgGradSizeRef.current.w !== cw || bgGradSizeRef.current.h !== ch) {
        bgGradRef.current = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, cw * 0.8);
        bgGradRef.current.addColorStop(0, "#0d1017");
        bgGradRef.current.addColorStop(0.6, "#080b10");
        bgGradRef.current.addColorStop(1, "#050710");
        bgGradSizeRef.current = { w: cw, h: ch };
      }
      ctx.fillStyle = bgGradRef.current;
      ctx.fillRect(0, 0, cw, ch);

      ctx.save();
      ctx.translate(cw / 2, ch / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      const nodes = nodesRef.current;
      const edges = data.edges;

      const viewLeft = cam.x - cw / 2 / cam.zoom - 50;
      const viewRight = cam.x + cw / 2 / cam.zoom + 50;
      const viewTop = cam.y - ch / 2 / cam.zoom - 50;
      const viewBottom = cam.y + ch / 2 / cam.zoom + 50;
      const isVisible = (x: any, y: any) => x > viewLeft && x < viewRight && y > viewTop && y < viewBottom;

      // Edges
      if (cam.zoom > 0.3) {
        const edgeAlpha = Math.min(1, (cam.zoom - 0.3) * 2);
        edges.forEach(edge => {
          const from = nodes[edge.from];
          const to = nodes[edge.to];
          if (!from || !to) return;
          if (!isVisible(from.x, from.y) && !isVisible(to.x, to.y)) return;

          const hn = hoveredNodeRef.current;
          const sn = selectedNodeRef.current;
          const hf = hoveredFactionRef.current;
          const isHighlighted = hn && (edge.from === hn.id || edge.to === hn.id);
          const isSelected = sn && (edge.from === sn.id || edge.to === sn.id);
          const isWatched = watchedIds.has(edge.from) || watchedIds.has(edge.to);
          const factionDim = hf !== null && from.faction !== hf && to.faction !== hf;

          let alpha = edge.strength * 0.15 * edgeAlpha;
          if (isHighlighted || isSelected) alpha = 0.6;
          if (isWatched && !isHighlighted && !isSelected) alpha = Math.max(alpha, 0.3);
          if (factionDim) alpha *= 0.1;

          const color = edge.type === "tension" ? `rgba(251,146,60,${alpha})` : `rgba(148,163,184,${alpha})`;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          const mx = (from.x + to.x) / 2 + (from.y - to.y) * 0.05;
          const my = (from.y + to.y) / 2 + (to.x - from.x) * 0.05;
          ctx.quadraticCurveTo(mx, my, to.x, to.y);
          ctx.strokeStyle = color;
          ctx.lineWidth = (isHighlighted || isSelected || isWatched) ? 1.5 / cam.zoom : 0.5 / cam.zoom;
          ctx.stroke();
        });
      }

      // Signals
      signalsRef.current.forEach(s => {
        if (s.progress >= 1) return;
        const px = s.fromX + (s.toX - s.fromX) * s.progress;
        const py = s.fromY + (s.toY - s.fromY) * s.progress;
        if (!isVisible(px, py)) return;
        const r = 2.5 / cam.zoom;
        const glow = ctx.createRadialGradient(px, py, 0, px, py, r * 3);
        glow.addColorStop(0, `${s.color}90`);
        glow.addColorStop(1, `${s.color}00`);
        ctx.fillStyle = glow;
        ctx.fillRect(px - r * 3, py - r * 3, r * 6, r * 6);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.fill();
      });

      // Neurons
      const hnr = hoveredNodeRef.current;
      const snr = selectedNodeRef.current;
      const hfr = hoveredFactionRef.current;
      nodes.forEach(n => {
        if (!isVisible(n.x, n.y)) return;

        const f = FACTIONS[n.faction];
        const isHov = hnr && hnr.id === n.id;
        const isSel = snr && snr.id === n.id;
        const isWatched = watchedIds.has(n.id);
        const isConnected = (hnr || snr) && ((hnr?.connections?.includes(n.id)) || (snr?.connections?.includes(n.id)));
        const factionDim = hfr !== null && n.faction !== hfr;

        let alpha = factionDim ? 0.12 : (isHov || isSel || isWatched ? 1 : isConnected ? 0.9 : 0.7);
        const pulseScale = 1 + Math.sin(n.pulse) * 0.08;
        let sz = n.size * pulseScale;

        if (isHov || isSel) sz *= 1.6;
        if (isWatched) sz *= 1.3;

        // Watched agent beacon ring (pulsing)
        if (isWatched) {
          const beaconR = sz * 4 / cam.zoom;
          const beaconAlpha = 0.15 + Math.sin(n.pulse * 2) * 0.1;
          ctx.beginPath();
          ctx.arc(n.x, n.y, beaconR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${f.r},${f.g},${f.b},${beaconAlpha})`;
          ctx.lineWidth = 1.5 / cam.zoom;
          ctx.stroke();
          // Outer pulse ring
          const outerR = beaconR + (Math.sin(n.pulse) * 0.5 + 0.5) * beaconR * 0.8;
          ctx.beginPath();
          ctx.arc(n.x, n.y, outerR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${f.r},${f.g},${f.b},${beaconAlpha * 0.3})`;
          ctx.lineWidth = 0.5 / cam.zoom;
          ctx.stroke();
        }

        // Glow
        if ((n.isLeader || n.influence > 0.85 || isWatched) && !factionDim) {
          const glowR = sz * (isWatched ? 6 : 5) / cam.zoom;
          const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowR);
          glow.addColorStop(0, `rgba(${f.r},${f.g},${f.b},${alpha * (isWatched ? 0.3 : 0.2)})`);
          glow.addColorStop(0.5, `rgba(${f.r},${f.g},${f.b},${alpha * 0.05})`);
          glow.addColorStop(1, `rgba(${f.r},${f.g},${f.b},0)`);
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Dendrite halo
        if (cam.zoom > 0.8 && (n.isLeader || isHov || isSel)) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, sz * 2.5, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${f.r},${f.g},${f.b},${alpha * 0.15})`;
          ctx.lineWidth = 0.5 / cam.zoom;
          ctx.stroke();
        }

        // Core
        ctx.beginPath();
        ctx.arc(n.x, n.y, sz, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${f.r},${f.g},${f.b},${alpha})`;
        ctx.fill();

        // Bright core
        if (sz > 2) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, sz * 0.4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${alpha * 0.4})`;
          ctx.fill();
        }

        // Watch icon (small eye)
        if (isWatched && cam.zoom > 0.5) {
          ctx.fillStyle = `rgba(255,255,255,0.7)`;
          ctx.font = `${Math.max(6, 8 / cam.zoom)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText("◉", n.x, n.y + sz + 10 / cam.zoom);
        }

        // Labels
        if (cam.zoom > 1.2 && (n.isLeader || n.influence > 0.8 || isHov || isSel || isWatched)) {
          ctx.fillStyle = `rgba(${f.r},${f.g},${f.b},${alpha * 0.9})`;
          ctx.font = `${Math.max(7, 9 / cam.zoom)}px 'JetBrains Mono', monospace`;
          ctx.textAlign = "center";
          ctx.fillText(n.name, n.x, n.y - sz - 5 / cam.zoom);
        }
        if (cam.zoom > 2.5 && !n.isLeader && n.influence <= 0.8 && !isHov && !isSel && !isWatched) {
          ctx.fillStyle = `rgba(148,163,184,${alpha * 0.4})`;
          ctx.font = `${6 / cam.zoom}px 'JetBrains Mono', monospace`;
          ctx.textAlign = "center";
          ctx.fillText(n.name, n.x, n.y - sz - 3 / cam.zoom);
        }
      });

      // Faction labels — use pre-computed centers (updated every 120 frames ~2s)
      if (cam.zoom < 1.2) {
        if (frameRef.current % 120 === 0 || factionCentersRef.current.length === 0) {
          factionCentersRef.current = FACTIONS.map((_, i) => {
            const fn = nodes.filter(n => n.faction === i);
            if (fn.length === 0) return { cx: 0, cy: 0 };
            return { cx: fn.reduce((s, n) => s + n.x, 0) / fn.length, cy: fn.reduce((s, n) => s + n.y, 0) / fn.length };
          });
        }
        const hfv = hoveredFactionRef.current;
        FACTIONS.forEach((f, i) => {
          const { cx, cy } = factionCentersRef.current[i] || { cx: 0, cy: 0 };
          const isFHov = hfv === i;
          ctx.fillStyle = `${f.color}${isFHov ? "bb" : "55"}`;
          ctx.font = `bold ${14 / cam.zoom}px 'Outfit', sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(f.name, cx, cy - 20 / cam.zoom);
          ctx.fillStyle = `${f.color}${isFHov ? "88" : "33"}`;
          ctx.font = `${10 / cam.zoom}px 'JetBrains Mono', monospace`;
          ctx.fillText(`citizens`, cx, cy + 5 / cam.zoom);
        });
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [data]);

  const resetView = () => { cameraTarget.current = { x: 0, y: 0, zoom: 0.7 }; selectedNodeRef.current = null; setSelectedNode(null); setWatchMode("global"); };

  const isInWatchlist = (id: any) => watchlist.some(w => w.id === id);

  // ── UI ──
  const panelBg = "rgba(10,13,18,0.82)";
  const panelBorder = "1px solid rgba(255,255,255,0.06)";
  const mono = "'JetBrains Mono', monospace";

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative", overflow: "hidden", background: "#050710", fontFamily: "'Outfit', -apple-system, sans-serif", color: "#e4e4e7" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Newsreader:opsz,wght@6..72,400;6..72,600&display=swap" rel="stylesheet" />

      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", cursor: "grab", display: "block" }} />

      {/* ── TOP BAR ── */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 48, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", background: panelBg, backdropFilter: "blur(20px)", borderBottom: panelBorder, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg,#c084fc,#38bdf8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 900, color: "white" }}>CZ</div>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Neural Civilization Viewer</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {watchlist.length > 0 && (
            <button onClick={() => setShowWatchPanel(!showWatchPanel)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: "rgba(192,132,252,0.08)", border: "1px solid rgba(192,132,252,0.15)", color: "#d8b4fe", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              ◉ {watchlist.length} Watching
            </button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.15)" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#f43f5e", boxShadow: "0 0 6px #f43f5e" }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: "#fb7185", letterSpacing: "0.12em", textTransform: "uppercase" }}>SEALED</span>
          </div>
          <span style={{ fontSize: 11, color: "#64748b", fontFamily: mono }}>Cycle 52</span>
        </div>
      </div>

      {/* ── ZOOM CONTROLS ── */}
      <div style={{ position: "absolute", top: 60, right: 16, display: "flex", flexDirection: "column", gap: 4, zIndex: 10 }}>
        {[["Macro", 0.35], ["Region", 0.7], ["Cluster", 1.5], ["Neuron", 3.0]].map(([label, level]) => (
          <button key={label as string} onClick={() => cameraTarget.current.zoom = level as number} style={{ padding: "5px 10px", borderRadius: 8, background: panelBg, backdropFilter: "blur(12px)", border: panelBorder, color: "#94a3b8", fontSize: 11, cursor: "pointer" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#e4e4e7"; }}
            onMouseLeave={e => { e.currentTarget.style.background = panelBg; e.currentTarget.style.color = "#94a3b8"; }}
          >{label as string}</button>
        ))}
        {watchlist.length > 0 && (
          <button onClick={focusWatchlist} style={{ padding: "5px 10px", borderRadius: 8, background: "rgba(192,132,252,0.06)", border: "1px solid rgba(192,132,252,0.12)", color: "#c084fc", fontSize: 11, cursor: "pointer", marginTop: 2 }}>Focus Watched</button>
        )}
        <button onClick={resetView} style={{ padding: "5px 10px", borderRadius: 8, background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.12)", color: "#94a3b8", fontSize: 11, cursor: "pointer", marginTop: 2 }}>Reset View</button>
      </div>

      {/* ── FACTION LEGEND ── */}
      <div style={{ position: "absolute", bottom: 16, left: 16, padding: 12, borderRadius: 12, background: panelBg, backdropFilter: "blur(16px)", border: panelBorder, zIndex: 10, minWidth: 170 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>Factions · {data.nodes.length} visible</div>
        {FACTIONS.map((f, i) => {
          const count = data.nodes.filter(n => n.faction === i).length;
          return (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 5px", borderRadius: 5, cursor: "pointer", background: hoveredFaction === i ? "rgba(255,255,255,0.05)" : "transparent" }}
              onMouseEnter={() => { hoveredFactionRef.current = i; setHoveredFaction(i); }} onMouseLeave={() => { hoveredFactionRef.current = null; setHoveredFaction(null); }}
              onClick={() => { const fn = data.nodes.filter(n => n.faction === i); const cx = fn.reduce((s, n) => s + n.x, 0) / fn.length; const cy = fn.reduce((s, n) => s + n.y, 0) / fn.length; cameraTarget.current = { x: cx, y: cy, zoom: 1.2 }; }}
            >
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: f.color, boxShadow: hoveredFaction === i ? `0 0 8px ${f.color}` : "none" }} />
              <span style={{ fontSize: 11, color: hoveredFaction === i ? "#e4e4e7" : "#94a3b8", flex: 1, fontWeight: hoveredFaction === i ? 600 : 400 }}>{f.name}</span>
              <span style={{ fontSize: 10, fontFamily: mono, color: "#525252" }}>{count}</span>
            </div>
          );
        })}
      </div>

      {/* ── SELECTED NODE PANEL ── */}
      {selectedNode && (
        <div style={{ position: "absolute", bottom: 16, right: 16, width: 290, padding: 14, borderRadius: 14, background: panelBg, backdropFilter: "blur(20px)", border: `1px solid ${FACTIONS[selectedNode.faction].color}30`, zIndex: 10 }}>
          <button onClick={() => setSelectedNode(null)} style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", color: "#64748b", fontSize: 16, cursor: "pointer" }}>×</button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${FACTIONS[selectedNode.faction].color}18`, border: `1px solid ${FACTIONS[selectedNode.faction].color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: FACTIONS[selectedNode.faction].color, fontFamily: mono }}>{selectedNode.name.slice(0, 2)}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "white" }}>{selectedNode.name}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>{selectedNode.archetype} · {FACTIONS[selectedNode.faction].short}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, marginBottom: 8, padding: 8, borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 4 }}>Current Activity</div>
            {selectedNode.activity}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
            {[["Influence", Math.floor(selectedNode.influence * 100), "#c084fc"], ["Trust", Math.floor(selectedNode.trust), "#6ee7b7"], ["Controversy", Math.floor(selectedNode.controversy), "#fb923c"]].map(([label, val, color]) => (
              <div key={label as string} style={{ padding: 5, borderRadius: 8, background: "rgba(255,255,255,0.03)", textAlign: "center" }}>
                <div style={{ fontSize: 8, color: "#525252", textTransform: "uppercase" }}>{label as string}</div>
                <div style={{ fontSize: 14, fontWeight: 600, fontFamily: mono, color: color as string, marginTop: 1 }}>{val as number}</div>
              </div>
            ))}
          </div>
          {/* Watch / Unwatch button */}
          <button
            onClick={() => isInWatchlist(selectedNode.id) ? removeFromWatchlist(selectedNode.id) : addToWatchlist(selectedNode)}
            style={{ width: "100%", marginTop: 8, padding: "7px 0", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s", background: isInWatchlist(selectedNode.id) ? "rgba(244,63,94,0.08)" : "rgba(192,132,252,0.08)", border: isInWatchlist(selectedNode.id) ? "1px solid rgba(244,63,94,0.15)" : "1px solid rgba(192,132,252,0.15)", color: isInWatchlist(selectedNode.id) ? "#fb7185" : "#d8b4fe" }}
          >
            {isInWatchlist(selectedNode.id) ? "✕ Remove from Watchlist" : "◉ Add to Watchlist"}
          </button>
        </div>
      )}

      {/* ── SPECTATOR WATCHLIST PANEL ── */}
      {showWatchPanel && watchlist.length > 0 && (
        <div style={{ position: "absolute", top: 56, left: 16, width: 320, maxHeight: "calc(100vh - 80px)", overflowY: "auto", padding: 12, borderRadius: 14, background: panelBg, backdropFilter: "blur(20px)", border: "1px solid rgba(192,132,252,0.1)", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#64748b", textTransform: "uppercase" }}>Spectator Watchlist · {watchlist.length}/6</div>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={focusWatchlist} style={{ fontSize: 10, color: "#c084fc", background: "rgba(192,132,252,0.06)", border: "1px solid rgba(192,132,252,0.1)", borderRadius: 5, padding: "2px 8px", cursor: "pointer" }}>Focus All</button>
              <button onClick={() => setShowWatchPanel(false)} style={{ fontSize: 10, color: "#525252", background: "none", border: "none", cursor: "pointer" }}>▾</button>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {watchlist.map(w => {
              const liveNode = nodesRef.current[w.id];
              const f = FACTIONS[w.faction];
              return (
                <div key={w.id} style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.02)", border: `1px solid ${f.color}15`, transition: "border-color 0.3s" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = `${f.color}40`}
                  onMouseLeave={e => e.currentTarget.style.borderColor = `${f.color}15`}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: `${f.color}15`, border: `1px solid ${f.color}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: f.color, fontFamily: mono }}>{w.name.slice(0, 2)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "white" }}>{w.name}</div>
                      <div style={{ fontSize: 10, color: "#525252" }}>{w.archetype} · {f.short}</div>
                    </div>
                    <div style={{ display: "flex", gap: 3 }}>
                      <button onClick={() => flyToAgent(w)} style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: "#94a3b8", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="Fly to agent">⊕</button>
                      <button onClick={() => removeFromWatchlist(w.id)} style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.1)", color: "#fb7185", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="Remove">×</button>
                    </div>
                  </div>
                  {/* Live activity */}
                  <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.4, padding: "5px 7px", borderRadius: 6, background: "rgba(255,255,255,0.02)", marginBottom: 5 }}>
                    <span style={{ fontSize: 8, color: "#525252", textTransform: "uppercase", letterSpacing: "0.1em" }}>Activity: </span>
                    {liveNode?.activity || w.activity}
                  </div>
                  {/* Internal monologue */}
                  <div style={{ fontSize: 11, color: "#71717a", lineHeight: 1.4, padding: "5px 7px", borderRadius: 6, background: "rgba(192,132,252,0.03)", border: "1px solid rgba(192,132,252,0.05)", fontStyle: "italic" }}>
                    <span style={{ fontSize: 8, color: "#525252", textTransform: "uppercase", letterSpacing: "0.1em", fontStyle: "normal" }}>Internal Monologue: </span>
                    "{liveNode?.thought || w.thought}"
                  </div>
                  {/* Mini stats */}
                  <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                    {[["INF", Math.floor((liveNode?.influence || w.influence) * 100), "#c084fc"], ["TRU", Math.floor(liveNode?.trust || w.trust), "#6ee7b7"], ["CON", Math.floor(liveNode?.controversy || w.controversy), "#fb923c"]].map(([l, v, c]) => (
                      <div key={l as string} style={{ flex: 1, textAlign: "center", padding: "3px 0", borderRadius: 5, background: "rgba(255,255,255,0.02)" }}>
                        <span style={{ fontSize: 8, color: "#3f3f46" }}>{l as string} </span>
                        <span style={{ fontSize: 11, fontWeight: 600, fontFamily: mono, color: c as string }}>{v as number}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── HOVER TOOLTIP ── */}
      {hoveredNode && !selectedNode && (
        <div style={{ position: "absolute", top: 56, left: "50%", transform: "translateX(-50%)", padding: "6px 14px", borderRadius: 10, background: panelBg, backdropFilter: "blur(12px)", border: panelBorder, zIndex: 10, textAlign: "center", pointerEvents: "none" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: FACTIONS[hoveredNode.faction].color }}>{hoveredNode.name}</span>
          <span style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>{hoveredNode.archetype} · {FACTIONS[hoveredNode.faction].short}</span>
          {isInWatchlist(hoveredNode.id) && <span style={{ fontSize: 10, color: "#c084fc", marginLeft: 6 }}>◉ Watched</span>}
        </div>
      )}

      {/* ── INSTRUCTIONS ── */}
      <div style={{ position: "absolute", top: watchlist.length > 0 && showWatchPanel ? "auto" : 56, bottom: watchlist.length > 0 && showWatchPanel ? 16 : "auto", left: watchlist.length > 0 && showWatchPanel ? "50%" : 16, transform: watchlist.length > 0 && showWatchPanel ? "translateX(-50%)" : "none", padding: "6px 12px", borderRadius: 8, background: "rgba(10,13,18,0.5)", border: "1px solid rgba(255,255,255,0.04)", zIndex: 10, fontSize: 10, color: "#525252" }}>
        Drag to navigate · Scroll to zoom · Click neuron to inspect · Add to watchlist to monitor
      </div>

      <style>{`
        @keyframes mc-ping { 75%, 100% { transform: scale(2.2); opacity: 0; } }
        button:active { transform: scale(0.96); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
      `}</style>
    </div>
  );
}
