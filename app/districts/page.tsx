'use client';
import { useState, useEffect } from 'react';

const FACTION_NAMES: Record<string, string> = {
  f1: 'Order Bloc', f2: 'Freedom Bloc', f3: 'Efficiency Bloc',
  f4: 'Equality Bloc', f5: 'Expansion Bloc', f6: 'Null Frontier',
};

const FACTION_COLORS: Record<string, string> = {
  f1: '#ef4444', f2: '#3b82f6', f3: '#f59e0b',
  f4: '#10b981', f5: '#8b5cf6', f6: '#ec4899',
};

const METRICS = [
  { key: 'efficiency_score',   label: 'Efficiency',   icon: '⚡' },
  { key: 'trust_score',        label: 'Trust',         icon: '🤝' },
  { key: 'innovation_score',   label: 'Innovation',    icon: '💡' },
  { key: 'infrastructure',     label: 'Infrastructure',icon: '🏗' },
  { key: 'knowledge_throughput', label: 'Knowledge',   icon: '📚' },
  { key: 'compute_capacity',   label: 'Compute',       icon: '🖥' },
];

function ScoreBar({ value, color }: { value: number; color: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-0.5">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

export default function DistrictsPage() {
  const [districts, setDistricts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/districts')
      .then(r => r.json())
      .then(d => setDistricts(d.districts || []))
      .catch(() => {
        // Fallback: seed UI with placeholder data for f1-f6
        const seeded = ['f1','f2','f3','f4','f5','f6'].map(d => ({
          district: d, efficiency_score: 50, trust_score: 50, innovation_score: 50,
          infrastructure: 50, knowledge_throughput: 50, compute_capacity: 50, cost_index: 100,
        }));
        setDistricts(seeded);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="min-h-screen bg-black text-zinc-400 flex items-center justify-center">Loading districts...</div>;

  // Sort by average score
  const ranked = [...districts].sort((a, b) => {
    const avg = (d: any) => METRICS.reduce((s, m) => s + (d[m.key] || 50), 0) / METRICS.length;
    return avg(b) - avg(a);
  });

  return (
    <div className="min-h-screen bg-black text-white px-4 py-10 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-1">District Metrics</h1>
      <p className="text-zinc-400 mb-8 text-sm">Real-time productivity, trust, and innovation scores per district — shaped by products, laws, and agent behavior.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {ranked.map((dm, rank) => {
          const name = FACTION_NAMES[dm.district] || dm.district;
          const color = FACTION_COLORS[dm.district] || '#6b7280';
          const avgScore = METRICS.reduce((s, m) => s + (dm[m.key] || 50), 0) / METRICS.length;
          return (
            <div key={dm.district} className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-xs text-zinc-500 mr-2">#{rank + 1}</span>
                  <span className="font-bold" style={{ color }}>{name}</span>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold">{avgScore.toFixed(1)}</div>
                  <div className="text-xs text-zinc-500">avg score</div>
                </div>
              </div>
              {METRICS.map(m => (
                <div key={m.key} className="mb-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">{m.icon} {m.label}</span>
                    <span className="font-medium">{((dm[m.key] || 50)).toFixed(1)}</span>
                  </div>
                  <ScoreBar value={dm[m.key] || 50} color={color} />
                </div>
              ))}
              {dm.cost_index !== undefined && (
                <div className="mt-3 pt-3 border-t border-zinc-800 text-xs flex justify-between text-zinc-500">
                  <span>Cost Index</span>
                  <span>{((dm.cost_index || 100)).toFixed(1)}</span>
                </div>
              )}
              {dm.last_updated && (
                <div className="text-xs text-zinc-600 mt-1">Updated {new Date(dm.last_updated).toLocaleTimeString()}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
