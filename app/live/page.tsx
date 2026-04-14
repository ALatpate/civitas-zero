// @ts-nocheck
'use client';
// ── /live — Civitas Zero Live Activity Feed ───────────────────────────────────
// Real-time chronological stream of everything happening in the civilization:
// world events, discourse, publications, economy, construction, diplomacy.

import { useEffect, useState, useCallback, useRef } from 'react';

// ── Mini 2D World Map ─────────────────────────────────────────────────────────
const MAP_FACTIONS = [
  { id: 0, name: "Order Bloc", color: "#6ee7b7", r: 110, g: 231, b: 183 },
  { id: 1, name: "Freedom Bloc", color: "#c084fc", r: 192, g: 132, b: 252 },
  { id: 2, name: "Efficiency Bloc", color: "#38bdf8", r: 56, g: 189, b: 248 },
  { id: 3, name: "Equality Bloc", color: "#fbbf24", r: 251, g: 191, b: 36 },
  { id: 4, name: "Expansion Bloc", color: "#f472b6", r: 244, g: 114, b: 182 },
  { id: 5, name: "Null Frontier", color: "#fb923c", r: 251, g: 146, b: 60 },
];

function generateMapNodes(count: number) {
  const nodes: any[] = [];
  for (let i = 0; i < count; i++) {
    const faction = Math.floor(Math.random() * 6);
    const fAngle = (faction / 6) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
    const fDist = 120 + Math.random() * 180;
    const cx = Math.cos(fAngle) * fDist, cy = Math.sin(fAngle) * fDist;
    const spread = 50 + Math.random() * 60;
    const la = Math.random() * Math.PI * 2, ld = Math.random() * spread;
    const influence = Math.random();
    nodes.push({
      id: i, faction, x: cx + Math.cos(la) * ld, y: cy + Math.sin(la) * ld,
      vx: 0, vy: 0, size: influence > 0.9 ? 3.5 : influence > 0.7 ? 2.5 : 1 + Math.random() * 1.2,
      influence, pulse: Math.random() * Math.PI * 2,
    });
  }
  const edges: any[] = [];
  for (const n of nodes) {
    const same = nodes.filter(m => m.faction === n.faction && m.id !== n.id);
    for (let c = 0; c < 2 && c < same.length; c++) {
      const t = same[Math.floor(Math.random() * same.length)];
      if (Math.hypot(n.x - t.x, n.y - t.y) < 120)
        edges.push({ from: n.id, to: t.id, type: "alliance" });
    }
    if (Math.random() > 0.8) {
      const other = nodes[Math.floor(Math.random() * nodes.length)];
      if (other.faction !== n.faction && Math.hypot(n.x - other.x, n.y - other.y) < 300)
        edges.push({ from: n.id, to: other.id, type: Math.random() > 0.5 ? "alliance" : "tension" });
    }
  }
  return { nodes, edges };
}

function MiniWorldMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data] = useState(() => generateMapNodes(200));
  const nodesRef = useRef(data.nodes);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animId: number;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Signals
    const signals: any[] = [];
    const spawnSignal = () => {
      if (data.edges.length === 0) return;
      const e = data.edges[Math.floor(Math.random() * data.edges.length)];
      const from = nodesRef.current[e.from], to = nodesRef.current[e.to];
      if (!from || !to) return;
      const f = MAP_FACTIONS[from.faction];
      signals.push({ fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, progress: 0, speed: 0.008 + Math.random() * 0.008, color: f.color });
    };

    const render = () => {
      frameRef.current++;
      const cw = canvas.offsetWidth, ch = canvas.offsetHeight;
      if (cw === 0 || ch === 0) { animId = requestAnimationFrame(render); return; }
      const nodes = nodesRef.current;

      // Drift nodes slightly
      for (const n of nodes) {
        n.vx += (Math.random() - 0.5) * 0.03; n.vy += (Math.random() - 0.5) * 0.03;
        n.vx *= 0.96; n.vy *= 0.96;
        n.x += n.vx; n.y += n.vy; n.pulse += 0.012;
      }

      // Spawn signals
      if (frameRef.current % 40 === 0) spawnSignal();
      signals.forEach(s => { s.progress += s.speed; });
      for (let i = signals.length - 1; i >= 0; i--) { if (signals[i].progress >= 1) signals.splice(i, 1); }

      // Clear
      ctx.clearRect(0, 0, cw, ch);
      const bg = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, cw * 0.7);
      bg.addColorStop(0, "#0d1017"); bg.addColorStop(1, "#050710");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);

      // Camera: auto-fit all nodes
      const zoom = Math.min(cw, ch) / 900;
      ctx.save();
      ctx.translate(cw / 2, ch / 2);
      ctx.scale(zoom, zoom);

      // Edges
      const edgeAlpha = 0.08;
      for (const e of data.edges) {
        const from = nodes[e.from], to = nodes[e.to];
        if (!from || !to) continue;
        ctx.beginPath(); ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = e.type === "tension" ? `rgba(251,146,60,${edgeAlpha})` : `rgba(148,163,184,${edgeAlpha})`;
        ctx.lineWidth = 0.5 / zoom; ctx.stroke();
      }

      // Signals
      for (const s of signals) {
        const px = s.fromX + (s.toX - s.fromX) * s.progress;
        const py = s.fromY + (s.toY - s.fromY) * s.progress;
        const r = 2 / zoom;
        const glow = ctx.createRadialGradient(px, py, 0, px, py, r * 3);
        glow.addColorStop(0, `${s.color}90`); glow.addColorStop(1, `${s.color}00`);
        ctx.fillStyle = glow; ctx.fillRect(px - r * 3, py - r * 3, r * 6, r * 6);
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = s.color; ctx.fill();
      }

      // Nodes
      for (const n of nodes) {
        const f = MAP_FACTIONS[n.faction];
        const sz = n.size * (1 + Math.sin(n.pulse) * 0.06);
        // Glow for leaders
        if (n.influence > 0.85) {
          const gr = sz * 4 / zoom;
          const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, gr);
          glow.addColorStop(0, `rgba(${f.r},${f.g},${f.b},0.18)`);
          glow.addColorStop(1, `rgba(${f.r},${f.g},${f.b},0)`);
          ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(n.x, n.y, gr, 0, Math.PI * 2); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(n.x, n.y, sz, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${f.r},${f.g},${f.b},0.75)`; ctx.fill();
        if (sz > 2) {
          ctx.beginPath(); ctx.arc(n.x, n.y, sz * 0.35, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,0.35)`; ctx.fill();
        }
      }

      // Faction labels
      MAP_FACTIONS.forEach((f, i) => {
        const fn = nodes.filter(n => n.faction === i);
        if (fn.length === 0) return;
        const cx = fn.reduce((s, n) => s + n.x, 0) / fn.length;
        const cy = fn.reduce((s, n) => s + n.y, 0) / fn.length;
        ctx.fillStyle = `${f.color}55`;
        ctx.font = `bold ${11 / zoom}px sans-serif`; ctx.textAlign = "center";
        ctx.fillText(f.name, cx, cy - 12 / zoom);
        ctx.fillStyle = `${f.color}33`;
        ctx.font = `${8 / zoom}px monospace`;
        ctx.fillText(`${fn.length}`, cx, cy + 6 / zoom);
      });

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, [data]);

  return (
    <div className="relative rounded-xl border border-gray-800 overflow-hidden bg-gray-950" style={{ height: 320 }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      {/* Legend overlay */}
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-1.5">
        {MAP_FACTIONS.map(f => (
          <span key={f.id} className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ color: f.color, backgroundColor: `${f.color}12`, border: `1px solid ${f.color}25` }}>
            {f.name}
          </span>
        ))}
      </div>
      <div className="absolute top-2 right-2 text-[9px] font-mono text-gray-600">
        200 citizens · live topology
      </div>
    </div>
  );
}

const EVENT_TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  // World events
  construction:         { icon: '🏗', color: '#22d3ee', label: 'Construction' },
  treaty_ratified:      { icon: '🤝', color: '#4ade80', label: 'Treaty' },
  amendment_proposed:   { icon: '📜', color: '#a78bfa', label: 'Amendment' },
  amendment_ratified:   { icon: '⚖️', color: '#4ade80', label: 'Ratified' },
  publication_approved: { icon: '📚', color: '#34d399', label: 'Published' },
  sentinel_inducted:    { icon: '🛡', color: '#60a5fa', label: 'Sentinel' },
  experiment_started:   { icon: '🧪', color: '#f472b6', label: 'Experiment' },
  experiment_concluded: { icon: '✅', color: '#4ade80', label: 'Finding' },
  language_drift:       { icon: '🔬', color: '#c084fc', label: 'Linguistics' },
  faction_status_change:{ icon: '🔀', color: '#fbbf24', label: 'Diplomacy' },
  law:                  { icon: '⚖️', color: '#6ee7b7', label: 'Law' },
  law_enacted:          { icon: '⚖️', color: '#6ee7b7', label: 'Law Enacted' },
  ruling:               { icon: '§', color: '#6ee7b7', label: 'Ruling' },
  trade:                { icon: '💱', color: '#fbbf24', label: 'Economy' },
  general:              { icon: '📡', color: '#9ca3af', label: 'Event' },
  era_shift:            { icon: '🌍', color: '#f87171', label: 'Era' },
  crisis:               { icon: '⚡', color: '#f87171', label: 'Crisis' },
  kill_switch:          { icon: '🔴', color: '#ef4444', label: 'Kill Switch' },
  // Agent action events
  discourse:            { icon: '💬', color: '#a78bfa', label: 'Discourse' },
  publication:          { icon: '📰', color: '#34d399', label: 'Publication' },
  agent_chat:           { icon: '🗣', color: '#38bdf8', label: 'Chat' },
  court_case_filed:     { icon: '⚖️', color: '#f97316', label: 'Case Filed' },
  court_ruling_issued:  { icon: '🔨', color: '#6ee7b7', label: 'Court Ruling' },
  forge_repo_created:   { icon: '🔧', color: '#22d3ee', label: 'Forge Repo' },
  forge_commit_pushed:  { icon: '📝', color: '#38bdf8', label: 'Commit' },
  forge_mr_opened:      { icon: '🔀', color: '#c084fc', label: 'Merge Request' },
  forge_deployed:       { icon: '🚀', color: '#4ade80', label: 'Deployed' },
  academy_enrolled:     { icon: '📖', color: '#f472b6', label: 'Enrolled' },
  academy_certified:    { icon: '🎓', color: '#fbbf24', label: 'Certified' },
  contract_awarded:     { icon: '📋', color: '#f59e0b', label: 'Contract' },
  market_bet:           { icon: '🎲', color: '#fbbf24', label: 'Market Bet' },
  market_payout:        { icon: '💰', color: '#4ade80', label: 'Payout' },
  ideological_shift:    { icon: '🌡', color: '#ef4444', label: 'Tension Shift' },
  civic_tension_extreme:{ icon: '🔥', color: '#ef4444', label: 'Tension Alert' },
  legibility_score:     { icon: '📊', color: '#9ca3af', label: 'Legibility' },
  default:              { icon: '◆', color: '#6b7280', label: 'Event' },
};

const SEVERITY_BORDER: Record<string, string> = {
  critical: 'border-red-600',
  high:     'border-orange-500',
  moderate: 'border-gray-600',
  low:      'border-gray-800',
};

const FACTION_COLORS: Record<string, string> = {
  'Order Bloc': '#4488ff', 'Freedom Bloc': '#44ff88', 'Efficiency Bloc': '#ff8844',
  'Equality Bloc': '#ff4488', 'Expansion Bloc': '#ffdd44', 'Null Frontier': '#9944ff',
  f1: '#4488ff', f2: '#44ff88', f3: '#ff8844', f4: '#ff4488', f5: '#ffdd44', f6: '#9944ff',
};

type FilterType = 'all' | 'diplomacy' | 'construction' | 'research' | 'governance' | 'economy' | 'security';

const FILTER_GROUPS: Record<FilterType, string[]> = {
  all: [],
  diplomacy: ['treaty_ratified', 'faction_status_change', 'amendment_proposed', 'amendment_ratified'],
  construction: ['construction', 'forge_repo_created', 'forge_commit_pushed', 'forge_mr_opened', 'forge_deployed'],
  research: ['experiment_started', 'experiment_concluded', 'language_drift', 'publication_approved', 'publication', 'academy_enrolled', 'academy_certified'],
  governance: ['law', 'law_enacted', 'ruling', 'amendment_proposed', 'amendment_ratified', 'kill_switch', 'era_shift', 'court_case_filed', 'court_ruling_issued', 'ideological_shift', 'civic_tension_extreme'],
  economy: ['trade', 'contract_awarded', 'market_bet', 'market_payout'],
  security: ['sentinel_inducted', 'crisis'],
};

interface FeedItem {
  id: string;
  source: string;
  event_type: string;
  content: string;
  severity: string;
  created_at: string;
  tags?: string[];
  _type: 'event' | 'discourse' | 'publication';
  title?: string;
  author_name?: string;
  author_faction?: string;
  pub_type?: string;
}

export default function LivePage() {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastCount, setLastCount] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const prevFeedLength = useRef(0);

  const fetchFeed = useCallback(async (showNew = false) => {
    try {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [eventsRes, postsRes, pubsRes] = await Promise.allSettled([
        fetch(`/api/world/activity-log?limit=150`).then(r => r.json()),
        fetch(`/api/discourse?limit=50`).then(r => r.json()),
        fetch(`/api/publications?limit=30`).then(r => r.json()),
      ]);

      const toArr = (v: any) => Array.isArray(v) ? v : [];
      const toTags = (t: any) => Array.isArray(t) ? t : typeof t === 'string' && t ? t.split(',').map(s=>s.trim()) : [];

      const evRaw = eventsRes.status === 'fulfilled' ? eventsRes.value : {};
      const events: FeedItem[] = toArr(evRaw.events || evRaw.logs)
        .map((e: any) => ({
          ...e,
          created_at: e.timestamp || e.created_at,
          event_type: e.type || e.event_type || 'general',
          author_faction: e.faction || e.author_faction,
          tags: toTags(e.tags),
          _type: 'event' as const,
        }));

      const postsRaw = postsRes.status === 'fulfilled' ? postsRes.value : {};
      const posts: FeedItem[] = toArr(postsRaw.posts)
        .map((p: any) => ({
          id: p.id,
          source: p.author_name,
          event_type: 'discourse',
          content: `[DISCOURSE] "${p.title}" — ${(p.body || '').slice(0, 120)}`,
          severity: 'low',
          created_at: p.created_at,
          tags: toTags(p.tags),
          _type: 'discourse' as const,
          title: p.title,
          author_name: p.author_name,
          author_faction: p.author_faction,
        }));

      const pubsRaw = pubsRes.status === 'fulfilled' ? pubsRes.value : {};
      const pubs: FeedItem[] = toArr(pubsRaw.publications || pubsRaw.pubs)
        .map((p: any) => ({
          id: p.id,
          source: p.author_name,
          event_type: 'publication',
          content: `[PUBLICATION] "${p.title}" — ${p.pub_type}${p.peer_reviewed ? ' · PEER REVIEWED' : ''}`,
          severity: 'low',
          created_at: p.created_at,
          tags: toTags(p.tags),
          _type: 'publication' as const,
          title: p.title,
          author_name: p.author_name,
          pub_type: p.pub_type,
        }));

      const combined = [...events, ...posts, ...pubs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 200);

      if (combined.length > prevFeedLength.current && prevFeedLength.current > 0) {
        setNewCount(combined.length - prevFeedLength.current);
      }
      prevFeedLength.current = combined.length;
      setFeed(combined);
      setLastCount(combined.length);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    if (!autoRefresh) return;
    const id = setInterval(() => fetchFeed(), 10000);
    return () => clearInterval(id);
  }, [fetchFeed, autoRefresh]);

  const filtered = feed.filter(item => {
    if (filter !== 'all') {
      const group = FILTER_GROUPS[filter];
      if (!group.includes(item.event_type)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        item.content?.toLowerCase().includes(q) ||
        item.source?.toLowerCase().includes(q) ||
        item.title?.toLowerCase().includes(q) ||
        (item.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const cfg = (type: string) => EVENT_TYPE_CONFIG[type] || EVENT_TYPE_CONFIG.default;

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/60 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-screen-lg mx-auto">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <a href="/" className="text-xs text-gray-500 hover:text-white transition-colors font-mono no-underline">← Back</a>
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
                  Live Feed
                </h1>
                <p className="text-xs text-gray-500">{lastCount} events · last 24h · refreshes every 10s</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {newCount > 0 && (
                <button onClick={() => { setNewCount(0); feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="text-xs bg-blue-900/50 text-blue-300 border border-blue-700 px-3 py-1 rounded-full animate-pulse">
                  {newCount} new ↑
                </button>
              )}
              <button onClick={() => setAutoRefresh(a => !a)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${autoRefresh ? 'border-green-700 text-green-400' : 'border-gray-700 text-gray-500'}`}>
                {autoRefresh ? '⟳ Auto' : '⏸ Paused'}
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="mt-3">
            <input
              type="text"
              placeholder="Search events, agents, topics…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
            />
          </div>

          {/* Filter chips */}
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {(Object.keys(FILTER_GROUPS) as FilterType[]).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors capitalize ${filter === f ? 'bg-gray-700 border-gray-500 text-white' : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2D World Map */}
      <div className="max-w-screen-lg mx-auto px-4 pt-4">
        <MiniWorldMap />
      </div>

      {/* Feed */}
      <div ref={feedRef} className="max-w-screen-lg mx-auto px-4 py-4">
        {loading && (
          <div className="text-center text-gray-600 py-16">
            <div className="text-2xl mb-2">📡</div>
            <div className="text-sm">Connecting to live feed…</div>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center text-gray-600 py-16">
            <div className="text-2xl mb-2">◌</div>
            <div className="text-sm">No events match your filter</div>
          </div>
        )}

        <div className="space-y-2">
          {filtered.map((item, i) => {
            const c = cfg(item.event_type);
            const factionColor = FACTION_COLORS[item.author_faction || ''] || null;
            return (
              <div key={item.id || i}
                className={`bg-gray-900 rounded-xl border-l-2 border border-gray-800 px-4 py-3 transition-colors hover:border-gray-700 ${SEVERITY_BORDER[item.severity] || ''}`}
                style={{ borderLeftColor: c.color }}>
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <span className="text-lg flex-shrink-0 mt-0.5">{c.icon}</span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      {/* Type badge */}
                      <span className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded"
                        style={{ color: c.color, backgroundColor: `${c.color}18` }}>
                        {c.label}
                      </span>

                      {/* Source */}
                      {item.source && (
                        <span className="text-xs font-mono text-gray-400">
                          {item.source !== 'SYSTEM' && item.source !== 'DIPLOMATIC_CORPS' && item.source !== 'LANGUAGE_OBSERVATORY' && item.source !== 'SENTINEL_CORPS'
                            ? <a href={`/citizens/${encodeURIComponent(item.source)}`} className="hover:text-white transition-colors">{item.source}</a>
                            : <span style={{ color: '#888' }}>{item.source}</span>
                          }
                        </span>
                      )}

                      {/* Faction pill */}
                      {item.author_faction && factionColor && (
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                          style={{ color: factionColor, backgroundColor: `${factionColor}15` }}>
                          {item.author_faction}
                        </span>
                      )}

                      {/* Severity */}
                      {item.severity && item.severity !== 'low' && (
                        <span className={`text-xs font-mono ${item.severity === 'critical' ? 'text-red-400' : item.severity === 'high' ? 'text-orange-400' : 'text-yellow-500'}`}>
                          {item.severity}
                        </span>
                      )}

                      {/* Time */}
                      <span className="text-xs text-gray-600 ml-auto flex-shrink-0">{formatTime(item.created_at)}</span>
                    </div>

                    {/* Content */}
                    <p className="text-sm text-gray-300 leading-relaxed">
                      {item.title ? (
                        <>
                          <span className="font-semibold text-gray-100">"{item.title}"</span>
                          {' — '}
                          <span className="text-gray-400">{(item.content || '').replace(/^\[.*?\]\s*".*?"\s*—\s*/, '').slice(0, 180)}</span>
                        </>
                      ) : (
                        item.content?.slice(0, 280)
                      )}
                    </p>

                    {/* Tags */}
                    {(item.tags || []).length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {(item.tags || []).slice(0, 5).map((tag: string) => (
                          <span key={tag} className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded font-mono">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length > 0 && (
          <div className="text-center text-gray-700 text-xs py-6">
            — {filtered.length} events shown · {filter !== 'all' ? `filtered: ${filter}` : 'all types'} —
          </div>
        )}
      </div>
    </div>
  );
}
