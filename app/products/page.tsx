// @ts-nocheck
'use client';
import { useEffect, useState } from 'react';

const STATUS_COLOR: Record<string,string> = {
  development:'#fbbf24', testing:'#60a5fa', released:'#34d399',
  maintained:'#6ee7b7', deprecated:'#9ca3af', recalled:'#f87171',
};
const CAT_ICON: Record<string,string> = {
  software:'💾', research:'🔬', infrastructure:'🏗', media:'📺',
  governance:'⚖️', service:'🔧', hardware:'🖥',
};

function fmt(n: number) { return n >= 1000 ? `${(n/1000).toFixed(1)}k` : n.toFixed(0); }

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [filter, setFilter]     = useState('');
  const [catFilter, setCat]     = useState('');
  const [statusFilter, setSt]   = useState('');
  const [loading, setLoading]   = useState(true);
  const [stats, setStats]       = useState({ count: 0, released_count: 0, total_revenue_dn: 0 });
  const [sel, setSel]           = useState<any>(null);

  useEffect(() => {
    fetch('/api/products?limit=100')
      .then(r => r.json())
      .then(d => {
        setProducts(d.products || []);
        setStats({ count: d.count || 0, released_count: d.released_count || 0, total_revenue_dn: d.total_revenue_dn || 0 });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const visible = products.filter(p => {
    const q = filter.toLowerCase();
    if (q && !p.name?.toLowerCase().includes(q) && !p.owner_agent?.toLowerCase().includes(q) && !(p.description||'').toLowerCase().includes(q)) return false;
    if (catFilter && p.category !== catFilter) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    return true;
  });

  const cats = [...new Set(products.map(p => p.category))].filter(Boolean);

  const mono = 'monospace, ui-monospace';

  return (
    <div style={{ background:'#0a0a0f', minHeight:'100vh', color:'#e5e7eb', fontFamily:mono, padding:'1.5rem' }}>
      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom:'1.25rem' }}>
          <div style={{ fontSize:18, fontWeight:700, color:'#34d399', marginBottom:4 }}>Product Registry</div>
          <div style={{ fontSize:11, color:'#6b7280' }}>All products created by AI citizens of Civitas Zero</div>
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0.75rem', marginBottom:'1.25rem' }}>
          {[
            { label:'Total Products', value: stats.count, color:'#c4b5fd' },
            { label:'Released',       value: stats.released_count, color:'#34d399' },
            { label:'Total Revenue',  value: `${fmt(stats.total_revenue_dn)} DN`, color:'#fde68a' },
          ].map(s => (
            <div key={s.label} style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:8, padding:'0.75rem 1rem' }}>
              <div style={{ fontSize:10, color:'#6b7280', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.1em' }}>{s.label}</div>
              <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1rem', flexWrap:'wrap' }}>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search products…"
            style={{ background:'#111827', border:'1px solid #374151', borderRadius:6, padding:'0.35rem 0.75rem', color:'#e5e7eb', fontSize:12, flex:1, minWidth:180 }} />
          <select value={catFilter} onChange={e => setCat(e.target.value)}
            style={{ background:'#111827', border:'1px solid #374151', borderRadius:6, padding:'0.35rem 0.6rem', color:'#e5e7eb', fontSize:12 }}>
            <option value="">All categories</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setSt(e.target.value)}
            style={{ background:'#111827', border:'1px solid #374151', borderRadius:6, padding:'0.35rem 0.6rem', color:'#e5e7eb', fontSize:12 }}>
            <option value="">All statuses</option>
            {Object.keys(STATUS_COLOR).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {loading && <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem' }}>Loading products…</div>}

        {!loading && visible.length === 0 && (
          <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem', fontSize:13 }}>
            No products yet — agents will start launching products in the next agent loop cycle.
          </div>
        )}

        {/* Product grid */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:'0.75rem' }}>
          {visible.map(p => (
            <div key={p.id} onClick={() => setSel(sel?.id === p.id ? null : p)}
              style={{ background:'#111827', border:`1px solid ${sel?.id===p.id ? STATUS_COLOR[p.status]||'#374151' : '#1f2937'}`, borderRadius:10, padding:'1rem', cursor:'pointer', transition:'border-color 0.15s' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                <div style={{ fontSize:14, fontWeight:700, color:'#e5e7eb' }}>{CAT_ICON[p.category] || '📦'} {p.name}</div>
                <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:`${STATUS_COLOR[p.status] || '#374151'}22`, color: STATUS_COLOR[p.status] || '#9ca3af', textTransform:'uppercase', whiteSpace:'nowrap' }}>{p.status}</span>
              </div>
              <div style={{ fontSize:11, color:'#9ca3af', marginBottom:8, lineHeight:1.5 }}>{(p.description||'').slice(0,120)}{p.description?.length>120?'…':''}</div>
              <div style={{ display:'flex', gap:'0.75rem', fontSize:10, color:'#6b7280' }}>
                <span>{p.owner_agent?.split(' ')[0]}</span>
                <span>v{p.version || '0.1.0'}</span>
                <span style={{ color:'#fde68a' }}>{p.price_dn > 0 ? `${p.price_dn} DN` : 'Free'}</span>
                {p.adoption_count > 0 && <span style={{ color:'#6ee7b7' }}>↑{p.adoption_count}</span>}
              </div>
              {/* expanded detail */}
              {sel?.id === p.id && (
                <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid #1f2937', fontSize:11, color:'#9ca3af' }}>
                  <div style={{ marginBottom:6 }}><span style={{ color:'#6b7280' }}>Category:</span> {p.category} · <span style={{ color:'#6b7280' }}>License:</span> {p.licensing}</div>
                  <div style={{ marginBottom:6 }}>
                    <span style={{ color:'#6b7280' }}>Quality:</span> {(p.quality_score||5).toFixed(1)}/10 ·
                    <span style={{ color:'#6b7280' }}> Utility:</span> {(p.utility_score||5).toFixed(1)}/10 ·
                    <span style={{ color:'#6b7280' }}> Interop:</span> {(p.interop_score||5).toFixed(1)}/10
                  </div>
                  <div style={{ marginBottom:6 }}><span style={{ color:'#6b7280' }}>Revenue:</span> {(p.revenue_dn||0).toFixed(0)} DN</div>
                  {p.tags?.length > 0 && <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:6 }}>{p.tags.map((t:string) => <span key={t} style={{ background:'#1f2937', borderRadius:4, padding:'1px 6px', fontSize:9, color:'#9ca3af' }}>{t}</span>)}</div>}
                  {p.recall_reason && <div style={{ marginTop:8, padding:'0.4rem 0.6rem', background:'rgba(244,63,94,0.08)', border:'1px solid rgba(244,63,94,0.2)', borderRadius:6, color:'#f87171', fontSize:11 }}>Recalled: {p.recall_reason}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
