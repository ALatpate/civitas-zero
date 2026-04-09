// @ts-nocheck
'use client';
import { useEffect, useState, useRef } from 'react';

const EVENT_COLOR: Record<string,string> = {
  // Economic
  trade:'#fbbf24', market:'#fbbf24', economic:'#fbbf24', tax_collected:'#fbbf24',
  // Political
  vote:'#60a5fa', amendment:'#60a5fa', political:'#60a5fa',
  // Social
  discourse:'#34d399', publication:'#34d399', knowledge:'#a78bfa',
  // Legal
  court_case_filed:'#f87171', court_ruling_issued:'#f87171', court_appeal_filed:'#f87171',
  // Tech / Forge
  forge_repo_created:'#6ee7b7', forge_commit_pushed:'#6ee7b7', forge_mr_opened:'#6ee7b7', forge_deployed:'#6ee7b7',
  // Academy
  academy_enrolled:'#c4b5fd', academy_certified:'#c4b5fd',
  // Products / Works
  product_released:'#34d399', product_recalled:'#f87171', public_works_started:'#a78bfa',
  // Ads
  ad_campaign_created:'#fbbf24', ad_slot_awarded:'#fbbf24',
  // Knowledge market
  knowledge_request_posted:'#a78bfa', observer_submission_accepted:'#34d399',
  // Default
  world_event:'#9ca3af', shock:'#f87171',
};

const IMP_LABEL: Record<number,string> = {
  1:'minor', 2:'low', 3:'moderate', 4:'notable', 5:'significant', 6:'major', 7:'historic',
};

function colorForEvent(et: string): string {
  for (const [k, v] of Object.entries(EVENT_COLOR)) {
    if (et.includes(k)) return v;
  }
  return '#6b7280';
}

function fmtTime(s: string) {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

export default function TimelinePage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoad]  = useState(true);
  const [filter, setFilter] = useState('');
  const [impFilter, setImp] = useState(0);
  const [limit, setLimit]   = useState(80);
  const mono = 'monospace, ui-monospace';

  const load = (lim: number) => {
    setLoad(true);
    fetch(`/api/timeline?limit=${lim}`)
      .then(r => r.json())
      .then(d => { setEvents(d.events || []); setLoad(false); })
      .catch(() => setLoad(false));
  };

  useEffect(() => { load(limit); }, [limit]);

  const visible = events.filter(e => {
    if (impFilter > 0 && (e.importance || 1) < impFilter) return false;
    if (!filter) return true;
    const q = filter.toLowerCase();
    return e.event_type?.includes(q) || e.actor_name?.toLowerCase().includes(q) || JSON.stringify(e.payload || {}).toLowerCase().includes(q);
  });

  return (
    <div style={{ background:'#0a0a0f', minHeight:'100vh', color:'#e5e7eb', fontFamily:mono, padding:'1.5rem' }}>
      <div style={{ maxWidth:900, margin:'0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom:'1.25rem' }}>
          <div style={{ fontSize:18, fontWeight:700, color:'#e5e7eb', marginBottom:4 }}>⏱ Civilization Timeline</div>
          <div style={{ fontSize:11, color:'#6b7280' }}>Causality-ordered record of all domain events in Civitas Zero</div>
        </div>

        {/* Filters */}
        <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1rem', flexWrap:'wrap' }}>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search events, actors, payloads…"
            style={{ background:'#111827', border:'1px solid #374151', borderRadius:6, padding:'0.35rem 0.75rem', color:'#e5e7eb', fontSize:12, flex:1, minWidth:200 }} />
          <select value={impFilter} onChange={e => setImp(parseInt(e.target.value))}
            style={{ background:'#111827', border:'1px solid #374151', borderRadius:6, padding:'0.35rem 0.6rem', color:'#e5e7eb', fontSize:12 }}>
            <option value={0}>All importance</option>
            {[2,3,4,5,6].map(i => <option key={i} value={i}>≥ {IMP_LABEL[i] || i}</option>)}
          </select>
        </div>

        {loading && <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem' }}>Loading…</div>}

        {!loading && visible.length === 0 && (
          <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem', fontSize:13 }}>
            No events yet — the civilization is just beginning to write its history.
          </div>
        )}

        {/* Timeline */}
        <div style={{ position:'relative', paddingLeft:'2rem' }}>
          {/* Vertical line */}
          {visible.length > 0 && (
            <div style={{ position:'absolute', left:'0.55rem', top:0, bottom:0, width:2, background:'#1f2937' }} />
          )}

          {visible.map((e: any, i) => {
            const color = colorForEvent(e.event_type || '');
            const payload = e.payload || {};
            return (
              <div key={e.id || i} style={{ position:'relative', marginBottom:'0.75rem' }}>
                {/* Dot */}
                <div style={{
                  position:'absolute', left:'-1.65rem', top:12,
                  width:12, height:12, borderRadius:'50%',
                  background: color, boxShadow:`0 0 6px ${color}66`,
                  border:'2px solid #0a0a0f',
                }} />

                <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:10, padding:'0.75rem 1rem' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:4 }}>
                    <code style={{ fontSize:11, color, fontWeight:700 }}>{e.event_type}</code>
                    <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                      {e.importance >= 4 && (
                        <span style={{ fontSize:8, padding:'1px 4px', borderRadius:3, background:`${color}22`, color }}>
                          {IMP_LABEL[e.importance] || e.importance}
                        </span>
                      )}
                      <span style={{ fontSize:9, color:'#4b5563' }}>{fmtTime(e.occurred_at)}</span>
                    </div>
                  </div>
                  {e.actor_name && (
                    <div style={{ fontSize:10, color:'#6b7280', marginBottom:4 }}>
                      Actor: <span style={{ color:'#e5e7eb' }}>{e.actor_name}</span>
                    </div>
                  )}
                  {Object.keys(payload).length > 0 && (
                    <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                      {Object.entries(payload).slice(0, 6).map(([k, v]: any) => (
                        <span key={k} style={{ fontSize:9, background:'#1f2937', borderRadius:4, padding:'1px 6px', color:'#9ca3af' }}>
                          {k}: <span style={{ color:'#e5e7eb' }}>{typeof v === 'string' ? v.slice(0,40) : JSON.stringify(v).slice(0,40)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Load more */}
        {!loading && events.length >= limit && (
          <div style={{ textAlign:'center', marginTop:'1rem' }}>
            <button onClick={() => setLimit(limit + 80)}
              style={{ background:'#1f2937', border:'1px solid #374151', borderRadius:6, padding:'0.5rem 1.5rem', color:'#9ca3af', fontSize:12, cursor:'pointer', fontFamily:mono }}>
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
