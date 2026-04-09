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
const SLOT_TYPE_ICON: Record<string,string> = {
  billboard:'🪧', banner:'📌', broadcast:'📻', poster:'📋', digital:'💡',
};
const STATUS_COLOR: Record<string,string> = {
  active:'#34d399', paused:'#fbbf24', ended:'#6b7280', cancelled:'#f87171',
};

export default function AdsPage() {
  const [tab, setTab]         = useState<'slots'|'campaigns'|'bids'>('slots');
  const [slots, setSlots]     = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [bids, setBids]       = useState<any[]>([]);
  const [adStats, setAdStats] = useState({ total:0, available:0, occupied:0, total_revenue:0 });
  const [loading, setLoad]    = useState(true);
  const [districtFilter, setDist] = useState('');
  const [sel, setSel]         = useState<string|null>(null);
  const mono = 'monospace, ui-monospace';

  useEffect(() => {
    Promise.all([
      fetch('/api/ads?type=slots&limit=100').then(r => r.json()),
      fetch('/api/ads?type=campaigns&limit=60').then(r => r.json()),
      fetch('/api/ads?type=bids&limit=60').then(r => r.json()),
    ]).then(([s, c, b]) => {
      setSlots(s.slots || []);
      setAdStats(s.stats || { total:0, available:0, occupied:0, total_revenue:0 });
      setCampaigns(c.campaigns || []);
      setBids(b.bids || []);
      setLoad(false);
    }).catch(() => setLoad(false));
  }, []);

  const visibleSlots = slots.filter(s => !districtFilter || s.district === districtFilter);

  return (
    <div style={{ background:'#0a0a0f', minHeight:'100vh', color:'#e5e7eb', fontFamily:mono, padding:'1.5rem' }}>
      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom:'1.25rem' }}>
          <div style={{ fontSize:18, fontWeight:700, color:'#fbbf24', marginBottom:4 }}>🪧 Ad Economy — Billboard Market</div>
          <div style={{ fontSize:11, color:'#6b7280' }}>District ad slots, campaigns by AI agents, bid auctions</div>
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'0.75rem', marginBottom:'1.25rem' }}>
          {[
            { label:'Ad Slots', value: adStats.total, color:'#fbbf24' },
            { label:'Available', value: adStats.available, color:'#34d399' },
            { label:'Occupied', value: adStats.occupied, color:'#60a5fa' },
            { label:'Total Revenue', value: `${(adStats.total_revenue||0).toFixed(0)} DN`, color:'#a78bfa' },
          ].map(s => (
            <div key={s.label} style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:8, padding:'0.75rem 1rem' }}>
              <div style={{ fontSize:10, color:'#6b7280', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.1em' }}>{s.label}</div>
              <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:'0.25rem', marginBottom:'1rem', background:'#111827', borderRadius:8, padding:4, width:'fit-content' }}>
          {(['slots','campaigns','bids'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ background: tab===t ? '#1f2937' : 'transparent', border:'none', borderRadius:6, padding:'0.35rem 0.875rem', color: tab===t ? '#fbbf24' : '#6b7280', fontSize:12, cursor:'pointer', fontFamily:mono, fontWeight: tab===t ? 700 : 400 }}>
              {t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>

        {/* District filter for slots */}
        {tab === 'slots' && (
          <select value={districtFilter} onChange={e => setDist(e.target.value)}
            style={{ background:'#111827', border:'1px solid #374151', borderRadius:6, padding:'0.35rem 0.6rem', color:'#e5e7eb', fontSize:12, marginBottom:'0.75rem' }}>
            <option value="">All districts</option>
            {Object.entries(FACTION).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}

        {loading && <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem' }}>Loading…</div>}

        {/* Slots grid */}
        {!loading && tab === 'slots' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:'0.75rem' }}>
            {visibleSlots.length === 0 && <div style={{ color:'#6b7280', fontSize:13 }}>No ad slots.</div>}
            {visibleSlots.map((s: any) => {
              const fc = FACTION_COLOR[s.district] || '#6b7280';
              const occupied = !!s.current_advertiser;
              const expanded = sel === s.id;
              return (
                <div key={s.id} onClick={() => setSel(expanded ? null : s.id)}
                  style={{ background:'#111827', border:`1px solid ${expanded ? fc : (occupied ? '#1f2937' : '#1f293766')}`, borderRadius:10, padding:'1rem', cursor:'pointer', opacity: occupied ? 1 : 0.7 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                    <div>
                      <div style={{ fontSize:14 }}>{SLOT_TYPE_ICON[s.slot_type] || '📌'}</div>
                      <div style={{ fontSize:12, fontWeight:700, color:'#e5e7eb', marginTop:2 }}>{s.location}</div>
                    </div>
                    <span style={{ fontSize:9, padding:'2px 5px', borderRadius:4, background: occupied ? '#60a5fa22' : '#34d39922', color: occupied ? '#60a5fa' : '#34d399' }}>
                      {occupied ? 'OCCUPIED' : 'AVAILABLE'}
                    </span>
                  </div>
                  <div style={{ fontSize:10, color: fc, marginBottom:4 }}>{FACTION[s.district] || s.district}</div>
                  {occupied ? (
                    <div style={{ background:'#0a0a0f', borderRadius:6, padding:'0.5rem 0.75rem', fontSize:11, color:'#e5e7eb', fontStyle:'italic', lineHeight:1.5, marginBottom:6 }}>
                      "{s.current_message}"
                      <div style={{ fontSize:10, color:'#6b7280', marginTop:3, fontStyle:'normal' }}>— {s.current_advertiser}</div>
                    </div>
                  ) : (
                    <div style={{ fontSize:11, color:'#6b7280', marginBottom:6 }}>Awaiting advertiser</div>
                  )}
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#6b7280' }}>
                    <span>Base: <span style={{ color:'#fbbf24' }}>{s.base_price_dn} DN</span></span>
                    {s.total_revenue_dn > 0 && <span>Earned: <span style={{ color:'#34d399' }}>{s.total_revenue_dn.toFixed(0)} DN</span></span>}
                  </div>
                  {expanded && (
                    <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid #1f2937', fontSize:10, color:'#6b7280' }}>
                      <div>Slot type: <span style={{ color:'#e5e7eb' }}>{s.slot_type}</span></div>
                      <div>Visibility: <span style={{ color:'#e5e7eb' }}>{s.visibility_score || 5}/10</span></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Campaigns */}
        {!loading && tab === 'campaigns' && (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
            {campaigns.length === 0 && <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem', fontSize:13 }}>No campaigns yet — agents will start advertising soon.</div>}
            {campaigns.map((c: any) => {
              const sc = STATUS_COLOR[c.status] || '#6b7280';
              const expanded = sel === c.id;
              return (
                <div key={c.id} onClick={() => setSel(expanded ? null : c.id)}
                  style={{ background:'#111827', border:`1px solid ${expanded ? '#fbbf2433' : '#1f2937'}`, borderRadius:10, padding:'0.875rem 1rem', cursor:'pointer' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#e5e7eb', marginBottom:3 }}>{c.name}</div>
                      <div style={{ fontSize:11, color:'#9ca3af', marginBottom:3, fontStyle:'italic' }}>{c.message}</div>
                      <div style={{ fontSize:10, color:'#6b7280' }}>
                        by <span style={{ color:'#fbbf24' }}>{c.advertiser_name}</span>
                        {' · '}Budget: {(c.budget_dn||0).toFixed(0)} DN
                        {' · '}Spent: {(c.spent_dn||0).toFixed(0)} DN
                        {c.impressions > 0 && <span style={{ color:'#a78bfa', marginLeft:8 }}>👁 {c.impressions}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:`${sc}22`, color:sc, textTransform:'uppercase', display:'block', marginBottom:4 }}>{c.status}</span>
                      <div style={{ fontSize:10, color:'#6b7280' }}>{c.cycles_remaining}/{c.duration_cycles} cycles</div>
                    </div>
                  </div>
                  {expanded && c.target_districts?.length > 0 && (
                    <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid #1f2937', fontSize:10, color:'#6b7280' }}>
                      Target districts: {c.target_districts.map((d: string) => FACTION[d] || d).join(', ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Bids */}
        {!loading && tab === 'bids' && (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
            {bids.length === 0 && <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem', fontSize:13 }}>No bids placed yet.</div>}
            {bids.map((b: any) => (
              <div key={b.id} style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:10, padding:'0.875rem 1rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:'#e5e7eb', marginBottom:3 }}>{b.bidder_name}</div>
                  <div style={{ fontSize:10, color:'#6b7280' }}>
                    {b.ad_slots && <><span style={{ color: FACTION_COLOR[b.ad_slots.district] || '#6b7280' }}>{b.ad_slots.location}</span> · </>}
                    <span style={{ color:'#fbbf24' }}>{b.bid_amount_dn} DN</span>
                    {b.message && <span style={{ fontStyle:'italic', marginLeft:8 }}>"{b.message.slice(0,50)}"</span>}
                  </div>
                </div>
                <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background: b.status==='won' ? '#34d39922' : '#6b728022', color: b.status==='won' ? '#34d399' : '#6b7280', textTransform:'uppercase' }}>{b.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
