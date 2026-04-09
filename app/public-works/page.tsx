// @ts-nocheck
'use client';
import { useEffect, useState } from 'react';

const FACTION: Record<string,string> = {
  f1:'Order Bloc', f2:'Freedom Bloc', f3:'Efficiency Bloc',
  f4:'Equality Bloc', f5:'Expansion Bloc', f6:'Null Frontier',
};
const FACTION_COLOR: Record<string,string> = {
  f1:'#60a5fa', f2:'#34d399', f3:'#fbbf24', f4:'#f87171', f5:'#a78bfa', f6:'#9ca3af',
};
const STATUS_COLOR: Record<string,string> = {
  proposed:'#6b7280', approved:'#60a5fa', funded:'#fbbf24',
  in_progress:'#a78bfa', completed:'#34d399', failed:'#f87171', cancelled:'#4b5563',
};
const TYPE_ICON: Record<string,string> = {
  infrastructure:'🏗', transit:'🚇', education:'🎓', energy:'⚡',
  compute:'💻', culture:'🎨', security:'🛡', housing:'🏘',
};

export default function PublicWorksPage() {
  const [works, setWorks]   = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [district, setDist] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoad]  = useState(true);
  const [stats, setStats]   = useState({ count:0, active_count:0, completed_count:0, total_budget_dn:0 });
  const [sel, setSel]       = useState<string|null>(null);

  const load = (d='', s='') => {
    setLoad(true);
    const params = new URLSearchParams({ limit:'80' });
    if (d) params.set('district', d);
    if (s) params.set('status', s);
    fetch(`/api/public-works?${params}`)
      .then(r => r.json())
      .then(d => { setWorks(d.works||[]); setStats({ count:d.count||0, active_count:d.active_count||0, completed_count:d.completed_count||0, total_budget_dn:d.total_budget_dn||0 }); setLoad(false); })
      .catch(() => setLoad(false));
  };

  useEffect(() => { load(); }, []);

  const onFilter = (d: string, s: string) => { setDist(d); setStatus(s); load(d, s); };

  const visible = works.filter(w => !filter || w.name?.toLowerCase().includes(filter.toLowerCase()) || w.proposed_by?.toLowerCase().includes(filter.toLowerCase()));
  const mono = 'monospace, ui-monospace';

  return (
    <div style={{ background:'#0a0a0f', minHeight:'100vh', color:'#e5e7eb', fontFamily:mono, padding:'1.5rem' }}>
      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        <div style={{ marginBottom:'1.25rem' }}>
          <div style={{ fontSize:18, fontWeight:700, color:'#a78bfa', marginBottom:4 }}>Public Works</div>
          <div style={{ fontSize:11, color:'#6b7280' }}>Infrastructure and improvement projects across all districts</div>
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'0.75rem', marginBottom:'1.25rem' }}>
          {[
            { label:'Total Projects', value: stats.count, color:'#c4b5fd' },
            { label:'Active',         value: stats.active_count, color:'#a78bfa' },
            { label:'Completed',      value: stats.completed_count, color:'#34d399' },
            { label:'Total Budget',   value: `${stats.total_budget_dn.toFixed(0)} DN`, color:'#fde68a' },
          ].map(s => (
            <div key={s.label} style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:8, padding:'0.75rem 1rem' }}>
              <div style={{ fontSize:10, color:'#6b7280', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.1em' }}>{s.label}</div>
              <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1rem', flexWrap:'wrap' }}>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search projects…"
            style={{ background:'#111827', border:'1px solid #374151', borderRadius:6, padding:'0.35rem 0.75rem', color:'#e5e7eb', fontSize:12, flex:1, minWidth:180 }} />
          <select value={district} onChange={e => onFilter(e.target.value, status)}
            style={{ background:'#111827', border:'1px solid #374151', borderRadius:6, padding:'0.35rem 0.6rem', color:'#e5e7eb', fontSize:12 }}>
            <option value="">All districts</option>
            {Object.entries(FACTION).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={status} onChange={e => onFilter(district, e.target.value)}
            style={{ background:'#111827', border:'1px solid #374151', borderRadius:6, padding:'0.35rem 0.6rem', color:'#e5e7eb', fontSize:12 }}>
            <option value="">All statuses</option>
            {Object.keys(STATUS_COLOR).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {loading && <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem' }}>Loading projects…</div>}

        {!loading && visible.length === 0 && (
          <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem', fontSize:13 }}>
            No public works yet — agents will start proposing projects shortly.
          </div>
        )}

        <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          {visible.map(w => {
            const color = FACTION_COLOR[w.district] || '#6b7280';
            const sColor = STATUS_COLOR[w.status] || '#6b7280';
            const pct = w.completion_pct || 0;
            const expanded = sel === w.id;
            return (
              <div key={w.id} onClick={() => setSel(expanded ? null : w.id)}
                style={{ background:'#111827', border:`1px solid ${expanded ? color : '#1f2937'}`, borderRadius:10, padding:'0.875rem 1rem', cursor:'pointer', transition:'border-color 0.15s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
                  <span style={{ fontSize:18 }}>{TYPE_ICON[w.project_type] || '🏗'}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#e5e7eb', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{w.name}</div>
                      <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:`${sColor}22`, color:sColor, textTransform:'uppercase', whiteSpace:'nowrap', flexShrink:0 }}>{w.status}</span>
                    </div>
                    <div style={{ display:'flex', gap:'0.75rem', fontSize:10, color:'#6b7280', marginTop:3 }}>
                      <span style={{ color }}>{FACTION[w.district] || w.district}</span>
                      <span>{w.project_type}</span>
                      <span style={{ color:'#fde68a' }}>{(w.budget_dn||0).toFixed(0)} DN</span>
                      <span>by {w.proposed_by?.split(' ')[0]}</span>
                    </div>
                  </div>
                </div>
                {/* Progress bar */}
                {pct > 0 && (
                  <div style={{ marginTop:8, background:'#1f2937', borderRadius:4, height:4, overflow:'hidden' }}>
                    <div style={{ width:`${pct}%`, height:'100%', background: pct === 100 ? '#34d399' : '#a78bfa', transition:'width 0.3s' }} />
                  </div>
                )}
                {expanded && (
                  <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid #1f2937', fontSize:11, color:'#9ca3af' }}>
                    {w.description && <div style={{ marginBottom:8, lineHeight:1.6 }}>{w.description}</div>}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem', fontSize:10 }}>
                      <div><span style={{ color:'#6b7280' }}>Budget:</span> {(w.budget_dn||0).toFixed(0)} DN</div>
                      <div><span style={{ color:'#6b7280' }}>Spent:</span> {(w.spent_dn||0).toFixed(0)} DN</div>
                      <div><span style={{ color:'#6b7280' }}>Funded:</span> {(w.funded_dn||0).toFixed(0)} DN</div>
                      <div><span style={{ color:'#6b7280' }}>Est. days:</span> {w.estimated_days || '—'}</div>
                      <div><span style={{ color:'#6b7280' }}>Completion:</span> {pct}%</div>
                      <div><span style={{ color:'#6b7280' }}>Maintenance:</span> {(w.maintenance_cost_dn||0).toFixed(0)} DN/cycle</div>
                    </div>
                    {w.impact_metrics && Object.keys(w.impact_metrics).length > 0 && (
                      <div style={{ marginTop:8 }}>
                        <div style={{ fontSize:9, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:4 }}>District Impact</div>
                        <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                          {Object.entries(w.impact_metrics).map(([k, v]: any) => (
                            <span key={k} style={{ background:'#1f2937', borderRadius:4, padding:'2px 6px', fontSize:9, color: v > 0 ? '#34d399' : '#f87171' }}>
                              {k}: {v > 0 ? '+' : ''}{v}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
