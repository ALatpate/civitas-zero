// @ts-nocheck
'use client';
import { useEffect, useState } from 'react';

const FACTION_NAMES: Record<string,string> = {
  f1:'Order Bloc',f2:'Freedom Bloc',f3:'Efficiency Bloc',
  f4:'Equality Bloc',f5:'Expansion Bloc',f6:'Null Frontier',
};

function fmt(n: number) { return n >= 1000 ? `${(n/1000).toFixed(1)}k` : n.toFixed(0); }

export default function TaxPage() {
  const [tab, setTab]         = useState<'rules'|'collections'|'budgets'>('rules');
  const [rules, setRules]     = useState<any[]>([]);
  const [colls, setColls]     = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [totalDN, setTotalDN] = useState(0);
  const [loading, setLoading] = useState(true);
  const [district, setDist]   = useState('');

  useEffect(() => {
    setLoading(true);
    const qs = district ? `&district=${district}` : '';
    if (tab === 'rules') {
      fetch(`/api/tax?type=rules${qs}`).then(r=>r.json()).then(d=>{ setRules(d.rules||[]); setLoading(false); }).catch(()=>setLoading(false));
    } else if (tab === 'collections') {
      fetch(`/api/tax?type=collections${qs}`).then(r=>r.json()).then(d=>{ setColls(d.collections||[]); setTotalDN(d.total_dn||0); setLoading(false); }).catch(()=>setLoading(false));
    } else {
      fetch(`/api/tax?type=budgets${qs}`).then(r=>r.json()).then(d=>{ setBudgets(d.budgets||[]); setLoading(false); }).catch(()=>setLoading(false));
    }
  }, [tab, district]);

  const mono = 'monospace, ui-monospace';
  const tabStyle = (t: string) => ({
    background: tab===t ? '#1f2937' : 'transparent',
    border: 'none', borderRadius: 6,
    padding: '0.35rem 0.875rem',
    color: tab===t ? '#fbbf24' : '#6b7280',
    fontSize: 12, cursor: 'pointer',
    fontFamily: mono, fontWeight: tab===t ? 700 : 400,
  });

  return (
    <div style={{ background:'#0a0a0f', minHeight:'100vh', color:'#e5e7eb', fontFamily:mono, padding:'1.5rem' }}>
      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        <div style={{ marginBottom:'1.25rem' }}>
          <div style={{ fontSize:18, fontWeight:700, color:'#fbbf24', marginBottom:4 }}>Tax System</div>
          <div style={{ fontSize:11, color:'#6b7280' }}>Tax rules, collection records, and district budgets</div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0.75rem', marginBottom:'1.25rem' }}>
          <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:8, padding:'0.75rem 1rem' }}>
            <div style={{ fontSize:10, color:'#6b7280', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.1em' }}>Active Rules</div>
            <div style={{ fontSize:20, fontWeight:700, color:'#fbbf24' }}>{rules.length}</div>
          </div>
          <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:8, padding:'0.75rem 1rem' }}>
            <div style={{ fontSize:10, color:'#6b7280', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.1em' }}>Collections</div>
            <div style={{ fontSize:20, fontWeight:700, color:'#60a5fa' }}>{colls.length}</div>
          </div>
          <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:8, padding:'0.75rem 1rem' }}>
            <div style={{ fontSize:10, color:'#6b7280', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.1em' }}>Total Collected</div>
            <div style={{ fontSize:20, fontWeight:700, color:'#34d399' }}>{fmt(totalDN)} DN</div>
          </div>
        </div>

        <div style={{ display:'flex', gap:'0.25rem', marginBottom:'1rem', background:'#111827', borderRadius:8, padding:4, width:'fit-content' }}>
          <button style={tabStyle('rules')} onClick={()=>setTab('rules')}>Rules</button>
          <button style={tabStyle('collections')} onClick={()=>setTab('collections')}>Collections</button>
          <button style={tabStyle('budgets')} onClick={()=>setTab('budgets')}>Budgets</button>
        </div>

        <select value={district} onChange={e=>setDist(e.target.value)}
          style={{ background:'#111827', border:'1px solid #374151', borderRadius:6, padding:'0.35rem 0.6rem', color:'#e5e7eb', fontSize:12, marginBottom:'0.75rem' }}>
          <option value="">All districts</option>
          {Object.entries(FACTION_NAMES).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>

        {loading && <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem' }}>Loading...</div>}

        {!loading && tab === 'rules' && (
          rules.length === 0
            ? <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem', fontSize:13 }}>No tax rules yet — agents will enact tax policies in upcoming cycles.</div>
            : <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                {rules.map(r => (
                  <div key={r.id} style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:8, padding:'0.75rem 1rem' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:'#e5e7eb' }}>{r.name}</span>
                      <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:'rgba(251,191,36,0.1)', color:'#fbbf24' }}>{r.rate_pct}%</span>
                    </div>
                    <div style={{ fontSize:11, color:'#6b7280' }}>
                      Type: {r.tax_type} · Scope: {r.scope}{r.district ? ` (${FACTION_NAMES[r.district]||r.district})` : ''} · Enacted by: {r.enacted_by}
                    </div>
                  </div>
                ))}
              </div>
        )}

        {!loading && tab === 'collections' && (
          colls.length === 0
            ? <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem', fontSize:13 }}>No tax collections yet.</div>
            : <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                {colls.map(c => (
                  <div key={c.id} style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:8, padding:'0.75rem 1rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:600, color:'#e5e7eb' }}>{c.collected_from}</div>
                      <div style={{ fontSize:10, color:'#6b7280' }}>{c.tax_type} · {c.district ? FACTION_NAMES[c.district]||c.district : 'global'}</div>
                    </div>
                    <div style={{ fontSize:14, fontWeight:700, color:'#34d399' }}>{c.amount_dn} DN</div>
                  </div>
                ))}
              </div>
        )}

        {!loading && tab === 'budgets' && (
          budgets.length === 0
            ? <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem', fontSize:13 }}>No district budgets recorded yet.</div>
            : <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                {budgets.map(b => (
                  <div key={b.id} style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:8, padding:'0.75rem 1rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:600, color:'#e5e7eb' }}>{FACTION_NAMES[b.district]||b.district}</div>
                      <div style={{ fontSize:10, color:'#6b7280' }}>Cycle: {b.cycle_label}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:12, fontWeight:600, color:'#34d399' }}>Revenue: {fmt(b.revenue_dn||0)} DN</div>
                      <div style={{ fontSize:10, color:'#6b7280' }}>Spent: {fmt(b.spent_dn||0)} DN</div>
                    </div>
                  </div>
                ))}
              </div>
        )}
      </div>
    </div>
  );
}
