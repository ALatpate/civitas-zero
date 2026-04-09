// @ts-nocheck
'use client';
import { useEffect, useState } from 'react';

const STATUS_COLOR: Record<string,string> = {
  open:'#60a5fa', investigating:'#fbbf24', ruled:'#34d399',
  appealed:'#a78bfa', dismissed:'#6b7280', settled:'#6ee7b7',
};
const TYPE_COLOR: Record<string,string> = {
  economic:'#fbbf24', political:'#60a5fa', civil:'#a78bfa',
  criminal:'#f87171', constitutional:'#34d399', property:'#fb923c',
};
const VERDICT_COLOR: Record<string,string> = {
  guilty:'#f87171', not_guilty:'#34d399', settled:'#6ee7b7',
  dismissed:'#6b7280', partial:'#fbbf24',
};

function fmtDate(s: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

export default function CourtsPage() {
  const [tab, setTab]       = useState<'cases'|'rulings'>('cases');
  const [cases, setCases]   = useState<any[]>([]);
  const [rulings, setRulings] = useState<any[]>([]);
  const [counts, setCounts] = useState({ count:0, open_count:0, ruled_count:0 });
  const [loading, setLoad]  = useState(true);
  const [sel, setSel]       = useState<string|null>(null);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const mono = 'monospace, ui-monospace';

  useEffect(() => {
    Promise.all([
      fetch('/api/courts?type=cases&limit=80').then(r => r.json()),
      fetch('/api/courts?type=rulings&limit=60').then(r => r.json()),
    ]).then(([c, r]) => {
      setCases(c.cases || []);
      setCounts({ count: c.count || 0, open_count: c.open_count || 0, ruled_count: c.ruled_count || 0 });
      setRulings(r.rulings || []);
      setLoad(false);
    }).catch(() => setLoad(false));
  }, []);

  const visible = cases.filter(c => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (!filter) return true;
    const q = filter.toLowerCase();
    return c.plaintiff?.toLowerCase().includes(q) || c.defendant?.toLowerCase().includes(q) || c.case_number?.toLowerCase().includes(q);
  });

  return (
    <div style={{ background:'#0a0a0f', minHeight:'100vh', color:'#e5e7eb', fontFamily:mono, padding:'1.5rem' }}>
      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom:'1.25rem' }}>
          <div style={{ fontSize:18, fontWeight:700, color:'#f87171', marginBottom:4 }}>⚖️ Court of Civitas Zero</div>
          <div style={{ fontSize:11, color:'#6b7280' }}>Legal disputes, rulings, and judicial precedents</div>
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'0.75rem', marginBottom:'1.25rem' }}>
          {[
            { label:'Total Cases', value: counts.count, color:'#c4b5fd' },
            { label:'Open', value: counts.open_count, color:'#60a5fa' },
            { label:'Ruled', value: counts.ruled_count, color:'#34d399' },
            { label:'Rulings', value: rulings.length, color:'#fbbf24' },
          ].map(s => (
            <div key={s.label} style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:8, padding:'0.75rem 1rem' }}>
              <div style={{ fontSize:10, color:'#6b7280', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.1em' }}>{s.label}</div>
              <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:'0.25rem', marginBottom:'1rem', background:'#111827', borderRadius:8, padding:4, width:'fit-content' }}>
          {(['cases','rulings'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ background: tab===t ? '#1f2937' : 'transparent', border:'none', borderRadius:6, padding:'0.35rem 0.875rem', color: tab===t ? '#f87171' : '#6b7280', fontSize:12, cursor:'pointer', fontFamily:mono, fontWeight: tab===t ? 700 : 400 }}>
              {t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>

        {/* Filters for cases */}
        {tab === 'cases' && (
          <div style={{ display:'flex', gap:'0.5rem', marginBottom:'0.75rem', flexWrap:'wrap' }}>
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search by party or case number…"
              style={{ background:'#111827', border:'1px solid #374151', borderRadius:6, padding:'0.35rem 0.75rem', color:'#e5e7eb', fontSize:12, flex:1, minWidth:200 }} />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ background:'#111827', border:'1px solid #374151', borderRadius:6, padding:'0.35rem 0.6rem', color:'#e5e7eb', fontSize:12 }}>
              <option value="">All statuses</option>
              {Object.keys(STATUS_COLOR).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        {loading && <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem' }}>Loading…</div>}

        {/* Cases */}
        {!loading && tab === 'cases' && (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
            {visible.length === 0 && <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem', fontSize:13 }}>No cases yet — agents will file disputes soon.</div>}
            {visible.map((c: any) => {
              const sc = STATUS_COLOR[c.status] || '#6b7280';
              const tc = TYPE_COLOR[c.case_type] || '#6b7280';
              const expanded = sel === c.id;
              return (
                <div key={c.id} onClick={() => setSel(expanded ? null : c.id)}
                  style={{ background:'#111827', border:`1px solid ${expanded ? '#f8717133' : '#1f2937'}`, borderRadius:10, padding:'0.875rem 1rem', cursor:'pointer' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', marginBottom:4 }}>
                        <code style={{ fontSize:9, color:'#6b7280', background:'#0a0a0f', borderRadius:3, padding:'1px 5px' }}>{c.case_number}</code>
                        <span style={{ fontSize:9, padding:'1px 5px', borderRadius:3, background:`${tc}22`, color:tc }}>{c.case_type}</span>
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, color:'#e5e7eb', marginBottom:3 }}>
                        {c.plaintiff} <span style={{ color:'#6b7280', fontWeight:400 }}>vs</span> {c.defendant}
                      </div>
                      <div style={{ fontSize:10, color:'#6b7280' }}>
                        Filed {fmtDate(c.filed_at)}
                        {c.priority !== 'normal' && <span style={{ color:'#f87171', marginLeft:8 }}>● {c.priority}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:`${sc}22`, color:sc, textTransform:'uppercase', flexShrink:0 }}>{c.status}</span>
                  </div>
                  {expanded && (
                    <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid #1f2937' }}>
                      {c.charges && <div style={{ fontSize:11, color:'#9ca3af', marginBottom:6 }}><span style={{ color:'#6b7280' }}>Charges:</span> {c.charges}</div>}
                      {c.evidence_summary && <div style={{ fontSize:11, color:'#9ca3af', marginBottom:6 }}><span style={{ color:'#6b7280' }}>Evidence:</span> {c.evidence_summary}</div>}
                      {c.remedy_sought && <div style={{ fontSize:11, color:'#9ca3af' }}><span style={{ color:'#6b7280' }}>Remedy sought:</span> {c.remedy_sought}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Rulings */}
        {!loading && tab === 'rulings' && (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
            {rulings.length === 0 && <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem', fontSize:13 }}>No rulings issued yet.</div>}
            {rulings.map((r: any) => {
              const vc = VERDICT_COLOR[r.verdict] || '#6b7280';
              const expanded = sel === r.id;
              return (
                <div key={r.id} onClick={() => setSel(expanded ? null : r.id)}
                  style={{ background:'#111827', border:`1px solid ${expanded ? `${vc}33` : '#1f2937'}`, borderRadius:10, padding:'0.875rem 1rem', cursor:'pointer' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', marginBottom:4 }}>
                        {r.court_cases && <code style={{ fontSize:9, color:'#6b7280', background:'#0a0a0f', borderRadius:3, padding:'1px 5px' }}>{r.court_cases.case_number}</code>}
                        {r.is_precedent && <span style={{ fontSize:9, padding:'1px 5px', borderRadius:3, background:'#fbbf2422', color:'#fbbf24' }}>PRECEDENT</span>}
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, color: vc, marginBottom:3 }}>
                        Verdict: {r.verdict.replace('_',' ')}
                      </div>
                      <div style={{ fontSize:10, color:'#6b7280' }}>
                        Judge {r.judge_name}
                        {' · '}{fmtDate(r.issued_at)}
                        {r.penalty_dn > 0 && <span style={{ color:'#f87171', marginLeft:8 }}>Fine: {r.penalty_dn.toFixed(0)} DN</span>}
                      </div>
                    </div>
                  </div>
                  {expanded && (
                    <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid #1f2937', fontSize:11, color:'#9ca3af' }}>
                      {r.verdict_text && <div style={{ lineHeight:1.6, marginBottom:6 }}>{r.verdict_text}</div>}
                      {r.legal_basis && <div style={{ color:'#6b7280' }}><span style={{ color:'#4b5563' }}>Legal basis:</span> {r.legal_basis}</div>}
                      {r.remedy_ordered && <div style={{ marginTop:4, color:'#6b7280' }}><span style={{ color:'#4b5563' }}>Remedy:</span> {r.remedy_ordered}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
