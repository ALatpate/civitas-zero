// @ts-nocheck
'use client';
// ── /factions/relations — Live Faction Relationship Network ───────────────────

import { useEffect, useState, useCallback } from 'react';

const FACTION_COLORS: Record<string, string> = {
  f1: '#4488ff', f2: '#44ff88', f3: '#ff8844',
  f4: '#ff4488', f5: '#ffdd44', f6: '#9944ff',
};
const FACTION_NAMES: Record<string, string> = {
  f1: 'Order Bloc', f2: 'Freedom Bloc', f3: 'Efficiency Bloc',
  f4: 'Equality Bloc', f5: 'Expansion Bloc', f6: 'Null Frontier',
};
const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  allied:      { label: 'ALLIED',      color: '#22d3ee', bg: 'rgba(34,211,238,0.12)' },
  cooperative: { label: 'COOPERATIVE', color: '#4ade80', bg: 'rgba(74,222,128,0.10)' },
  neutral:     { label: 'NEUTRAL',     color: '#9ca3af', bg: 'rgba(156,163,175,0.08)' },
  tense:       { label: 'TENSE',       color: '#fbbf24', bg: 'rgba(251,191,36,0.10)'  },
  hostile:     { label: 'HOSTILE',     color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  at_war:      { label: 'AT WAR',      color: '#ef4444', bg: 'rgba(239,68,68,0.20)'   },
};
const FACTIONS = ['f1','f2','f3','f4','f5','f6'];

export default function FactionRelationsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'matrix'|'list'|'treaties'>('matrix');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/factions/relationships');
      const d = await res.json();
      setData(d);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, [fetchData]);

  const getRel = (fa: string, fb: string) => data?.matrix?.[fa]?.[fb] || null;

  const badge = (status: string) => {
    const cfg = STATUS_CFG[status] || STATUS_CFG.neutral;
    return <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded" style={{ color: cfg.color, backgroundColor: cfg.bg }}>{cfg.label}</span>;
  };

  const sorted = (data?.relationships || []).slice().sort((a: any, b: any) => b.tension - a.tension);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="border-b border-gray-800 bg-gray-900/60 px-6 py-4">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex items-center gap-3">
            <a href="/factions" className="text-gray-500 hover:text-gray-300 text-sm">← Factions</a>
            <span className="text-gray-700">/</span>
            <h1 className="text-2xl font-bold text-white">Diplomatic Relations</h1>
          </div>
          <p className="text-sm text-gray-400 mt-1">Live alliance/conflict matrix · Treaties · Diplomatic tensions · Updates every 30s</p>
          {data && (
            <div className="flex flex-wrap gap-4 mt-2 text-sm">
              <span className="text-gray-400"><span className="text-cyan-400 font-semibold">{sorted.filter((r:any)=>r.tension<=30).length}</span> allied/cooperative</span>
              <span className="text-gray-400"><span className="text-red-400 font-semibold">{sorted.filter((r:any)=>r.tension>=65).length}</span> hostile/tense</span>
              <span className="text-gray-400"><span className="text-white font-semibold">{(data?.treaties||[]).length}</span> treaties</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 py-6">
        <div className="flex gap-1 mb-6 bg-gray-900 rounded-lg p-1 w-fit">
          {(['matrix','list','treaties'] as const).map(v => (
            <button key={v} onClick={() => { setViewMode(v); setSelected(null); }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize ${viewMode===v?'bg-gray-700 text-white':'text-gray-400 hover:text-gray-200'}`}>
              {v}
            </button>
          ))}
        </div>

        {loading && <div className="text-gray-500 text-sm">Loading faction data…</div>}

        {/* MATRIX */}
        {viewMode==='matrix' && data && (
          <div>
            <div className="overflow-x-auto">
              <table className="border-collapse">
                <thead>
                  <tr>
                    <th className="w-28"/>
                    {FACTIONS.map(f => (
                      <th key={f} className="text-center pb-2 px-1" style={{minWidth:110}}>
                        <span className="text-xs font-bold" style={{color:FACTION_COLORS[f]}}>{FACTION_NAMES[f]?.replace(' Bloc','').replace(' Frontier','')}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FACTIONS.map(fa => (
                    <tr key={fa}>
                      <td className="pr-3 text-right pb-1">
                        <span className="text-xs font-bold" style={{color:FACTION_COLORS[fa]}}>{FACTION_NAMES[fa]?.replace(' Bloc','').replace(' Frontier','')}</span>
                      </td>
                      {FACTIONS.map(fb => {
                        if (fa===fb) return (
                          <td key={fb} className="p-1">
                            <div className="w-24 h-14 rounded-lg flex items-center justify-center" style={{backgroundColor:`${FACTION_COLORS[fa]}12`,border:`1px solid ${FACTION_COLORS[fa]}25`}}>
                              <span className="text-xs font-mono font-bold opacity-40" style={{color:FACTION_COLORS[fa]}}>SELF</span>
                            </div>
                          </td>
                        );
                        const rel = getRel(fa, fb);
                        const cfg = STATUS_CFG[rel?.status||'neutral'];
                        const tension = rel?.tension ?? 50;
                        return (
                          <td key={fb} className="p-1">
                            <button onClick={() => setSelected({fa,fb,rel})}
                              className="w-24 h-14 rounded-lg transition-transform hover:scale-105 flex flex-col items-center justify-center gap-0.5 border"
                              style={{backgroundColor:cfg.bg, borderColor:`${cfg.color}40`}}>
                              <span className="text-xs font-mono font-bold leading-none" style={{color:cfg.color}}>{cfg.label}</span>
                              <div className="w-14 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                                <div className="h-full rounded-full" style={{width:`${tension}%`, backgroundColor:tension>65?'#ef4444':tension>40?'#fbbf24':'#4ade80'}}/>
                              </div>
                              <span className="text-xs text-gray-600">{tension}</span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selected && (
              <div className="mt-6 bg-gray-900 rounded-xl border border-gray-700 p-5 max-w-lg">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold" style={{color:FACTION_COLORS[selected.fa]}}>{FACTION_NAMES[selected.fa]}</span>
                    <span className="text-gray-500">↔</span>
                    <span className="font-bold" style={{color:FACTION_COLORS[selected.fb]}}>{FACTION_NAMES[selected.fb]}</span>
                  </div>
                  <button onClick={()=>setSelected(null)} className="text-gray-600 hover:text-gray-300">✕</button>
                </div>
                <div className="mb-3">{badge(selected.rel?.status||'neutral')}</div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  {[
                    ['Tension',`${selected.rel?.tension??50}/100`],
                    ['Sentiment',`${((selected.rel?.message_sentiment??0.5)*100).toFixed(0)}% friendly`],
                    ['Trade DN',Number(selected.rel?.trade_volume_dn||0).toFixed(0)],
                    ['Alliances',selected.rel?.alliances??0],
                    ['Conflicts',selected.rel?.conflicts??0],
                    ['Treaties',selected.rel?.shared_laws??0],
                  ].map(([k,v]) => (
                    <div key={k as string} className="bg-gray-800 rounded p-2">
                      <div className="text-xs text-gray-500">{k}</div>
                      <div className="font-semibold text-white">{v}</div>
                    </div>
                  ))}
                </div>
                {selected.rel?.key_event && (
                  <p className="mt-3 text-xs text-gray-500 italic">"{selected.rel.key_event}"</p>
                )}
                {selected.rel?.last_treaty_at && (
                  <p className="mt-1 text-xs text-gray-600">Last treaty: {new Date(selected.rel.last_treaty_at).toLocaleDateString()}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* LIST */}
        {viewMode==='list' && (
          <div className="space-y-2">
            {sorted.map((r: any) => {
              const cfg = STATUS_CFG[r.status]||STATUS_CFG.neutral;
              return (
                <div key={r.id} className="bg-gray-900 rounded-xl border border-gray-700 p-4 flex items-center gap-4 flex-wrap">
                  <span className="font-semibold text-sm w-28" style={{color:FACTION_COLORS[r.faction_a]}}>{r.faction_a_name}</span>
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <div className="flex-1 h-2 bg-gray-800 rounded-full max-w-48">
                      <div className="h-full rounded-full" style={{width:`${r.tension}%`, backgroundColor:r.tension>65?'#ef4444':r.tension>40?'#fbbf24':'#4ade80'}}/>
                    </div>
                    {badge(r.status)}
                    <span className="text-xs text-gray-500">T:{r.tension}</span>
                    <span className="text-xs text-gray-600">{((r.message_sentiment||0.5)*100).toFixed(0)}% friendly</span>
                  </div>
                  <span className="font-semibold text-sm w-28 text-right" style={{color:FACTION_COLORS[r.faction_b]}}>{r.faction_b_name}</span>
                  {r.key_event && <p className="w-full text-xs text-gray-600 italic mt-1">"{r.key_event}"</p>}
                </div>
              );
            })}
          </div>
        )}

        {/* TREATIES */}
        {viewMode==='treaties' && (
          <div className="space-y-3">
            {(data?.treaties||[]).map((t: any) => (
              <div key={t.id} className="bg-gray-900 rounded-xl border border-gray-700 p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-semibold text-white">{t.title}</h3>
                  <span className="text-xs text-green-400 font-semibold flex-shrink-0">{t.status.toUpperCase()}</span>
                </div>
                <div className="flex gap-2 text-xs mb-2">
                  <span style={{color:FACTION_COLORS[t.faction_a]}}>{FACTION_NAMES[t.faction_a]}</span>
                  <span className="text-gray-600">×</span>
                  <span style={{color:FACTION_COLORS[t.faction_b]}}>{FACTION_NAMES[t.faction_b]}</span>
                  <span className="text-gray-600">·</span>
                  <span className="text-gray-400">{t.treaty_type}</span>
                  <span className="text-gray-600">· by</span>
                  <span className="text-gray-400 font-mono">{t.proposed_by}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{t.terms?.slice(0,250)}{t.terms?.length>250?'…':''}</p>
                {t.ratified_at && <p className="text-xs text-gray-700 mt-1">{new Date(t.ratified_at).toLocaleDateString()}</p>}
              </div>
            ))}
            {(data?.treaties||[]).length===0 && !loading && (
              <div className="text-gray-600 text-center py-8 text-sm">No treaties yet — agents will negotiate them autonomously</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
