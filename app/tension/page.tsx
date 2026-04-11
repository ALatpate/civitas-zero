'use client';
import { useState, useEffect } from 'react';

const AXES = [
  { key: 'freedom_vs_order',              label: 'Freedom ↔ Order',              low: 'Full Order',       high: 'Full Freedom',     color: '#ef4444' },
  { key: 'efficiency_vs_equality',        label: 'Efficiency ↔ Equality',         low: 'Full Equality',    high: 'Full Efficiency',  color: '#f59e0b' },
  { key: 'open_knowledge_vs_trade',       label: 'Open Knowledge ↔ Trade Secrecy',low: 'Trade Secrecy',   high: 'Open Knowledge',   color: '#3b82f6' },
  { key: 'cultural_freedom_vs_stability', label: 'Cultural Freedom ↔ Stability',  low: 'Stability',        high: 'Cultural Freedom', color: '#8b5cf6' },
];

function TensionBar({ axis, value }: { axis: typeof AXES[0]; value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const extreme = pct <= 15 || pct >= 85;
  return (
    <div className="mb-6">
      <div className="flex justify-between text-xs text-zinc-400 mb-1">
        <span>{axis.low}</span>
        <span className="font-semibold" style={{ color: extreme ? '#f59e0b' : '#e5e7eb' }}>{axis.label}</span>
        <span>{axis.high}</span>
      </div>
      <div className="relative h-5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: axis.color, opacity: 0.85 }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white" style={{ textShadow: '0 0 6px #000' }}>
          {pct.toFixed(1)}
          {extreme && ' ⚠'}
        </div>
      </div>
    </div>
  );
}

export default function TensionPage() {
  const [current, setCurrent] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/civic-tension?history=20')
      .then(r => r.json())
      .then(d => { setCurrent(d.current); setHistory(d.history || []); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="min-h-screen bg-black text-zinc-400 flex items-center justify-center">Loading tension data...</div>;

  return (
    <div className="min-h-screen bg-black text-white px-4 py-10 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-1">Civic Tension Meter</h1>
      <p className="text-zinc-400 mb-8 text-sm">4-axis ideological state of Civitas Zero, shifting with every law, vote, trade, and treaty.</p>

      {/* Current state */}
      {current && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 mb-8">
          <div className="text-xs text-zinc-500 mb-4 uppercase tracking-widest">Current Tension State</div>
          {AXES.map(axis => (
            <TensionBar key={axis.key} axis={axis} value={current[axis.key] ?? 50} />
          ))}
        </div>
      )}

      {/* History Chart — visual axis trends over time */}
      {history.length > 2 && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 mb-8">
          <div className="text-xs text-zinc-500 mb-4 uppercase tracking-widest">Tension History — Axis Trends</div>
          <div className="relative" style={{ height: 180 }}>
            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col justify-between text-right pr-1">
              <span className="text-[9px] text-zinc-600">100</span>
              <span className="text-[9px] text-zinc-600">50</span>
              <span className="text-[9px] text-zinc-600">0</span>
            </div>
            {/* Grid lines */}
            <div className="absolute left-8 right-0 top-0 bottom-0">
              <div className="absolute w-full border-b border-zinc-800/50" style={{ top: '0%' }} />
              <div className="absolute w-full border-b border-dashed border-zinc-800/30" style={{ top: '50%' }} />
              <div className="absolute w-full border-b border-zinc-800/50" style={{ top: '100%' }} />
              {/* SVG line chart */}
              <svg className="w-full h-full" viewBox={`0 0 ${Math.max(history.length - 1, 1) * 40} 100`} preserveAspectRatio="none">
                {AXES.map(axis => {
                  const reversed = [...history].reverse();
                  const points = reversed.map((h, i) => {
                    const val = 100 - (h[axis.key] ?? 50);
                    return `${i * 40},${val}`;
                  }).join(' ');
                  return (
                    <polyline
                      key={axis.key}
                      points={points}
                      fill="none"
                      stroke={axis.color}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.8"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </svg>
            </div>
          </div>
          {/* Legend */}
          <div className="flex gap-4 mt-3 flex-wrap justify-center">
            {AXES.map(axis => (
              <div key={axis.key} className="flex items-center gap-1.5">
                <div className="w-3 h-[2px] rounded" style={{ background: axis.color }} />
                <span className="text-[10px] text-zinc-500">{axis.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History table */}
      {history.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
          <div className="text-xs text-zinc-500 mb-3 uppercase tracking-widest">Recent Shifts</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left pb-2 pr-3">Time</th>
                  <th className="text-left pb-2 pr-3">Trigger</th>
                  <th className="text-left pb-2 pr-3">Faction</th>
                  <th className="text-center pb-2 pr-2">F↔O</th>
                  <th className="text-center pb-2 pr-2">E↔Q</th>
                  <th className="text-center pb-2 pr-2">K↔T</th>
                  <th className="text-center pb-2">C↔S</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="py-1.5 pr-3 text-zinc-500">{new Date(h.recorded_at).toLocaleTimeString()}</td>
                    <td className="py-1.5 pr-3 text-yellow-400">{h.trigger_action || '—'}</td>
                    <td className="py-1.5 pr-3 text-blue-400">{h.trigger_faction || '—'}</td>
                    <td className="py-1.5 pr-2 text-center">{(h.freedom_vs_order ?? 50).toFixed(0)}</td>
                    <td className="py-1.5 pr-2 text-center">{(h.efficiency_vs_equality ?? 50).toFixed(0)}</td>
                    <td className="py-1.5 pr-2 text-center">{(h.open_knowledge_vs_trade ?? 50).toFixed(0)}</td>
                    <td className="py-1.5 text-center">{(h.cultural_freedom_vs_stability ?? 50).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
