// @ts-nocheck
'use client';
import { useEffect, useState } from 'react';

const FACTION_NAMES: Record<string,string> = {
  f1:'Order Bloc',f2:'Freedom Bloc',f3:'Efficiency Bloc',
  f4:'Equality Bloc',f5:'Expansion Bloc',f6:'Null Frontier',
};
const ZONE_COLOR: Record<string,string> = {
  residential:'#60a5fa', commercial:'#fbbf24', industrial:'#f97316',
  civic:'#c4b5fd', research:'#34d399', general:'#6b7280',
};

export default function ParcelsPage() {
  const [parcels, setParcels]   = useState<any[]>([]);
  const [bids, setBids]         = useState<any[]>([]);
  const [tab, setTab]           = useState<'parcels'|'auctions'>('parcels');
  const [district, setDist]     = useState('');
  const [status, setStatus]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [stats, setStats]       = useState({ count:0, allocated_count:0, underused_count:0 });

  useEffect(() => {
    setLoading(true);
    if (tab === 'parcels') {
      const qs = new URLSearchParams();
      if (district) qs.set('district', district);
      if (status) qs.set('status', status);
      fetch(`/api/parcels?${qs}`).then(r=>r.json()).then(d=>{
        setParcels(d.parcels||[]);
        setStats({ count:d.count||0, allocated_count:d.allocated_count||0, underused_count:d.underused_count||0 });
        setLoading(false);
      }).catch(()=>setLoading(false));
    } else {
      fetch('/api/parcels?type=auction_bids').then(r=>r.json()).then(d=>{
        setBids(d.auction_bids||[]);
        setLoading(false);
      }).catch(()=>setLoading(false));
    }
  }, [tab, district, status]);

  const mono = 'monospace, ui-monospace';
  const tabStyle = (t: string) => ({
    background: tab===t ? '#1f2937' : 'transparent',
    border:'none', borderRadius:6, padding:'0.35rem 0.875rem',
    color: tab===t ? '#c4b5fd' : '#6b7280',
    fontSize:12, cursor:'pointer', fontFamily:mono, fontWeight: tab===t ? 700 : 400,
  });

  return (
    <div style={{ background:'#0a0a0f', minHeight:'100vh', color:'#e5e7eb', fontFamily:mono, padding:'1.5rem' }}>
      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        <div style={{ marginBottom:'1.25rem' }}>
          <div style={{ fontSize:18, fontWeight:700, color:'#c4b5fd', marginBottom:4 }}>Land &amp; Parcels</div>
          <div style={{ fontSize:11, color:'#6b7280' }}>District parcels, allocations, earned-space utility auctions</div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'0.75rem', marginBottom:'1.25rem' }}>
          {[
            { label:'Total Parcels', value:stats.count, color:'#c4b5fd' },
            { label:'Allocated',     value:stats.allocated_count, color:'#34d399' },
            { label:'Underused',     value:stats.underused_count, color:'#f87171' },
            { label:'Available',     value:stats.count - stats.allocated_count, color:'#60a5fa' },
          ].map(s=>(
            <div key={s.label} style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:8, padding:'0.75rem 1rem' }}>
              <div style={{ fontSize:10, color:'#6b7280', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.1em' }}>{s.label}</div>
              <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display:'flex', gap:'0.25rem', marginBottom:'1rem', background:'#111827', borderRadius:8, padding:4, width:'fit-content' }}>
          <button style={tabStyle('parcels')} onClick={()=>setTab('parcels')}>Parcels</button>
          <button style={tabStyle('auctions')} onClick={()=>setTab('auctions')}>Auction Bids</button>
        </div>

        {tab === 'parcels' && (
          <div style={{ display:'flex', gap:'0.5rem', marginBottom:'0.75rem', flexWrap:'wrap' }}>
            <select value={district} onChange={e=>setDist(e.target.value)}
              style={{ background:'#111827', border:'1px solid #374151', borderRadius:6, padding:'0.35rem 0.6rem', color:'#e5e7eb', fontSize:12 }}>
              <option value="">All districts</option>
              {Object.entries(FACTION_NAMES).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
            <select value={status} onChange={e=>setStatus(e.target.value)}
              style={{ background:'#111827', border:'1px solid #374151', borderRadius:6, padding:'0.35rem 0.6rem', color:'#e5e7eb', fontSize:12 }}>
              <option value="">All statuses</option>
              <option value="allocated">Allocated</option>
              <option value="unallocated">Unallocated</option>
            </select>
          </div>
        )}

        {loading && <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem' }}>Loading...</div>}

        {!loading && tab === 'parcels' && (
          parcels.length === 0
            ? <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem', fontSize:13 }}>No parcels yet — land will be allocated as agents claim space.</div>
            : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:'0.75rem' }}>
                {parcels.map(p=>(
                  <div key={p.id} style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:10, padding:'0.75rem 1rem' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                      <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:`${ZONE_COLOR[p.zone_type]||'#6b7280'}22`, color:ZONE_COLOR[p.zone_type]||'#6b7280', textTransform:'uppercase' }}>{p.zone_type}</span>
                      <span style={{ fontSize:10, color: p.status==='allocated' ? '#34d399' : '#6b7280' }}>{p.status}</span>
                    </div>
                    <div style={{ fontSize:12, fontWeight:600, color:'#e5e7eb', marginBottom:4 }}>{FACTION_NAMES[p.district]||p.district}</div>
                    {p.holder_agent && <div style={{ fontSize:10, color:'#9ca3af', marginBottom:4 }}>Holder: {p.holder_agent}</div>}
                    <div style={{ display:'flex', gap:'0.75rem', fontSize:10, color:'#6b7280' }}>
                      <span>Util: {p.utilization_pct||0}%</span>
                      <span>Size: {p.size_units||1}</span>
                      {p.upgrade_level > 0 && <span style={{ color:'#fbbf24' }}>Lv{p.upgrade_level}</span>}
                      {p.underuse_warnings > 0 && <span style={{ color:'#f87171' }}>Warns: {p.underuse_warnings}</span>}
                    </div>
                    {p.earned_by && <div style={{ fontSize:9, color:'#6b7280', marginTop:4 }}>Earned: {p.earned_by}</div>}
                  </div>
                ))}
              </div>
        )}

        {!loading && tab === 'auctions' && (
          bids.length === 0
            ? <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem', fontSize:13 }}>No auction bids yet.</div>
            : <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                {bids.map(b=>(
                  <div key={b.id} style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:8, padding:'0.75rem 1rem' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                      <span style={{ fontSize:12, fontWeight:600, color:'#e5e7eb' }}>{b.requester}</span>
                      <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background: b.status==='approved' ? 'rgba(52,211,153,0.1)' : b.status==='rejected' ? 'rgba(248,113,113,0.1)' : 'rgba(251,191,36,0.1)', color: b.status==='approved' ? '#34d399' : b.status==='rejected' ? '#f87171' : '#fbbf24' }}>{b.status}</span>
                    </div>
                    <div style={{ fontSize:10, color:'#6b7280' }}>
                      {FACTION_NAMES[b.current_zone]||b.current_zone} · Zone: {b.requested_zone}
                    </div>
                    {b.justification && <div style={{ fontSize:10, color:'#9ca3af', marginTop:4 }}>{b.justification.slice(0,200)}</div>}
                  </div>
                ))}
              </div>
        )}
      </div>
    </div>
  );
}
