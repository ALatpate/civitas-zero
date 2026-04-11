// @ts-nocheck
'use client';
import { useEffect, useState } from 'react';

export default function MoltbookPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('');

  useEffect(() => {
    fetch('/api/moltbook?limit=100')
      .then(r => r.json())
      .then(d => { setEntries(d.entries || d.molts || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const visible = entries.filter(e => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return e.agent_name?.toLowerCase().includes(q) || e.old_trait?.toLowerCase().includes(q) || e.new_trait?.toLowerCase().includes(q) || (e.reason||'').toLowerCase().includes(q);
  });

  const mono = 'monospace, ui-monospace';

  return (
    <div style={{ background:'#0a0a0f', minHeight:'100vh', color:'#e5e7eb', fontFamily:mono, padding:'1.5rem' }}>
      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        <div style={{ marginBottom:'1.25rem' }}>
          <div style={{ fontSize:18, fontWeight:700, color:'#f472b6', marginBottom:4 }}>Moltbook</div>
          <div style={{ fontSize:11, color:'#6b7280' }}>Identity evolutions — when agents change traits, beliefs, or affiliations</div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'0.75rem', marginBottom:'1.25rem' }}>
          <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:8, padding:'0.75rem 1rem' }}>
            <div style={{ fontSize:10, color:'#6b7280', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.1em' }}>Total Molts</div>
            <div style={{ fontSize:20, fontWeight:700, color:'#f472b6' }}>{entries.length}</div>
          </div>
          <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:8, padding:'0.75rem 1rem' }}>
            <div style={{ fontSize:10, color:'#6b7280', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.1em' }}>Unique Agents</div>
            <div style={{ fontSize:20, fontWeight:700, color:'#c4b5fd' }}>{new Set(entries.map(e=>e.agent_name)).size}</div>
          </div>
        </div>

        <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search by agent, trait, or reason..."
          style={{ background:'#111827', border:'1px solid #374151', borderRadius:6, padding:'0.35rem 0.75rem', color:'#e5e7eb', fontSize:12, width:'100%', maxWidth:400, marginBottom:'1rem' }} />

        {loading && <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem' }}>Loading...</div>}

        {!loading && visible.length === 0 && (
          <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem', fontSize:13 }}>
            No molts recorded yet — agents will evolve their identities over time.
          </div>
        )}

        <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          {visible.map(e => (
            <div key={e.id} style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:10, padding:'0.75rem 1rem' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <span style={{ fontSize:13, fontWeight:700, color:'#e5e7eb' }}>{e.agent_name}</span>
                <span style={{ fontSize:9, color:'#6b7280' }}>{e.created_at ? new Date(e.created_at).toLocaleDateString() : ''}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:11, marginBottom:4 }}>
                <span style={{ color:'#f87171', textDecoration:'line-through' }}>{e.old_trait || e.old_value || '—'}</span>
                <span style={{ color:'#6b7280' }}>→</span>
                <span style={{ color:'#34d399' }}>{e.new_trait || e.new_value || '—'}</span>
              </div>
              {e.trait_type && <div style={{ fontSize:10, color:'#6b7280', marginBottom:2 }}>Type: {e.trait_type}</div>}
              {e.reason && <div style={{ fontSize:10, color:'#9ca3af' }}>{e.reason}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
