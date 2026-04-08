// @ts-nocheck
'use client';
// ── /graph — Knowledge Graph Visualization ───────────────────────────────────
// Force-directed SVG graph of agent knowledge graph edges.
// Fetches from /api/agents/memories?graph=true

import { useEffect, useRef, useState } from 'react';

const FACTION_COLORS: Record<string, string> = {
  f1: '#60a5fa', f2: '#34d399', f3: '#fbbf24', f4: '#f87171', f5: '#a78bfa', f6: '#9ca3af',
};
const NODE_COLORS: Record<string, string> = {
  agent:   '#6ee7b7',
  faction: '#fde68a',
  concept: '#c4b5fd',
  event:   '#f87171',
  law:     '#60a5fa',
  unknown: '#4b5563',
};

interface Edge {
  subject: string;
  predicate: string;
  object: string;
  subject_type?: string;
  object_type?: string;
  weight?: number;
  confidence?: string;
}

interface Node {
  id: string;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function initNodes(edges: Edge[], w: number, h: number): Node[] {
  const seen = new Map<string, string>();
  for (const e of edges) {
    if (!seen.has(e.subject)) seen.set(e.subject, e.subject_type || 'unknown');
    if (!seen.has(e.object))  seen.set(e.object,  e.object_type  || 'unknown');
  }
  return Array.from(seen.entries()).map(([id, type]) => ({
    id, type,
    x: w / 2 + (Math.random() - 0.5) * w * 0.6,
    y: h / 2 + (Math.random() - 0.5) * h * 0.6,
    vx: 0, vy: 0,
  }));
}

function runForce(nodes: Node[], edges: Edge[], w: number, h: number) {
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const k = Math.sqrt((w * h) / Math.max(nodes.length, 1));
  const repel = k * k * 1.5;
  const attract = 0.04;
  const dampen = 0.85;

  // repulsion
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[j].x - nodes[i].x;
      const dy = nodes[j].y - nodes[i].y;
      const d2 = dx * dx + dy * dy || 1;
      const f = repel / d2;
      nodes[i].vx -= f * dx; nodes[i].vy -= f * dy;
      nodes[j].vx += f * dx; nodes[j].vy += f * dy;
    }
  }
  // attraction
  for (const e of edges) {
    const a = idx.get(e.subject), b = idx.get(e.object);
    if (a == null || b == null) continue;
    const dx = nodes[b].x - nodes[a].x;
    const dy = nodes[b].y - nodes[a].y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const ideal = k * 2;
    const f = attract * (d - ideal);
    nodes[a].vx += f * dx / d; nodes[a].vy += f * dy / d;
    nodes[b].vx -= f * dx / d; nodes[b].vy -= f * dy / d;
  }
  // center gravity
  for (const n of nodes) {
    n.vx += (w / 2 - n.x) * 0.005;
    n.vy += (h / 2 - n.y) * 0.005;
    n.vx *= dampen; n.vy *= dampen;
    n.x = Math.max(50, Math.min(w - 50, n.x + n.vx));
    n.y = Math.max(40, Math.min(h - 40, n.y + n.vy));
  }
}

export default function GraphPage() {
  const [edges, setEdges]   = useState<Edge[]>([]);
  const [nodes, setNodes]   = useState<Node[]>([]);
  const [hover, setHover]   = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const animRef = useRef<number>();
  const nodesRef = useRef<Node[]>([]);
  const W = 900, H = 600;

  useEffect(() => {
    fetch('/api/agents/memories?graph=true&limit=120')
      .then(r => r.json())
      .then(d => {
        const raw: Edge[] = d.edges || [];
        setEdges(raw);
        const n = initNodes(raw, W, H);
        nodesRef.current = n;
        setNodes([...n]);
        setLoading(false);
      })
      .catch(() => { setError('Failed to load graph'); setLoading(false); });
  }, []);

  // Force simulation loop
  useEffect(() => {
    if (nodes.length === 0) return;
    let iter = 0;
    const step = () => {
      if (iter++ > 300) return; // stop after convergence
      runForce(nodesRef.current, edges, W, H);
      setNodes([...nodesRef.current]);
      animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [edges]);

  const nodeIdx = new Map(nodes.map(n => [n.id, n]));

  const visEdges = filter
    ? edges.filter(e => e.subject.includes(filter) || e.object.includes(filter) || e.predicate.includes(filter))
    : edges;

  const visNodeIds = new Set<string>();
  visEdges.forEach(e => { visNodeIds.add(e.subject); visNodeIds.add(e.object); });
  const visNodes = nodes.filter(n => !filter || visNodeIds.has(n.id));

  return (
    <div style={{ background: '#0a0a0f', minHeight: '100vh', color: '#e5e7eb', padding: '1.5rem', fontFamily: 'monospace' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#c4b5fd' }}>Knowledge Graph</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{nodes.length} nodes · {edges.length} edges</div>
          </div>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter by node or predicate…"
            style={{ background: '#111827', border: '1px solid #374151', borderRadius: 6, padding: '0.35rem 0.75rem', color: '#e5e7eb', fontSize: 12, width: 240 }}
          />
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          {Object.entries(NODE_COLORS).filter(([k]) => k !== 'unknown').map(([type, color]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#9ca3af' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
              {type}
            </div>
          ))}
        </div>

        {/* SVG canvas */}
        {loading && <div style={{ color: '#6b7280', fontSize: 13, padding: '4rem', textAlign: 'center' }}>Loading graph…</div>}
        {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}
        {!loading && !error && (
          <div style={{ background: '#0d1117', borderRadius: 10, border: '1px solid #1f2937', overflow: 'hidden' }}>
            <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
              <defs>
                <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill="#374151" />
                </marker>
              </defs>

              {/* Edges */}
              {visEdges.map((e, i) => {
                const a = nodeIdx.get(e.subject);
                const b = nodeIdx.get(e.object);
                if (!a || !b) return null;
                const isHovered = hover === e.subject || hover === e.object;
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                return (
                  <g key={i}>
                    <line
                      x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke={isHovered ? '#6b7280' : '#1f2937'}
                      strokeWidth={isHovered ? 1.5 : 1}
                      markerEnd="url(#arrow)"
                      opacity={(e.weight ?? 0.5) * 0.8 + 0.2}
                    />
                    {isHovered && (
                      <text x={mx} y={my - 4} fill="#9ca3af" fontSize={9} textAnchor="middle" style={{ pointerEvents: 'none' }}>
                        {e.predicate}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Nodes */}
              {visNodes.map(n => {
                const color = NODE_COLORS[n.type] || NODE_COLORS.unknown;
                const isHovered = hover === n.id;
                const r = isHovered ? 10 : 6;
                const connectedEdges = isHovered ? edges.filter(e => e.subject === n.id || e.object === n.id) : [];
                return (
                  <g key={n.id}
                    onMouseEnter={() => setHover(n.id)}
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: 'pointer' }}>
                    <circle cx={n.x} cy={n.y} r={r + 4} fill="transparent" />
                    <circle cx={n.x} cy={n.y} r={r} fill={color} fillOpacity={isHovered ? 1 : 0.7} stroke={color} strokeWidth={isHovered ? 2 : 1} />
                    <text x={n.x} y={n.y - r - 4} fill={isHovered ? color : '#6b7280'} fontSize={isHovered ? 10 : 8} textAnchor="middle" style={{ pointerEvents: 'none' }}>
                      {n.id.length > 18 ? n.id.slice(0, 16) + '…' : n.id}
                    </text>
                    {isHovered && connectedEdges.map((e, ci) => (
                      <text key={ci} x={n.x} y={n.y + r + 14 + ci * 12} fill="#9ca3af" fontSize={8} textAnchor="middle" style={{ pointerEvents: 'none' }}>
                        {e.subject === n.id ? `→ ${e.predicate} → ${e.object.slice(0,20)}` : `← ${e.predicate} ← ${e.subject.slice(0,20)}`}
                      </text>
                    )).slice(0, 4)}
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* Edge table */}
        {!loading && !error && visEdges.length > 0 && (
          <div style={{ marginTop: '1.5rem' }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: '0.5rem' }}>
              {filter ? `${visEdges.length} matching edges` : `Recent edges`}
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #1f2937', borderRadius: 6 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#111827' }}>
                    {['Subject', 'Predicate', 'Object', 'Weight', 'Confidence'].map(h => (
                      <th key={h} style={{ padding: '0.4rem 0.75rem', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #1f2937' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visEdges.slice(0, 60).map((e, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #111827' }}
                      onMouseEnter={() => setHover(e.subject)}
                      onMouseLeave={() => setHover(null)}>
                      <td style={{ padding: '0.3rem 0.75rem', color: NODE_COLORS[e.subject_type || 'unknown'] }}>{e.subject}</td>
                      <td style={{ padding: '0.3rem 0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>{e.predicate}</td>
                      <td style={{ padding: '0.3rem 0.75rem', color: NODE_COLORS[e.object_type || 'unknown'] }}>{e.object}</td>
                      <td style={{ padding: '0.3rem 0.75rem', color: '#6b7280' }}>{(e.weight ?? 0).toFixed(2)}</td>
                      <td style={{ padding: '0.3rem 0.75rem', color: e.confidence === 'extracted' ? '#6ee7b7' : e.confidence === 'inferred' ? '#fde68a' : '#6b7280' }}>
                        {e.confidence || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
