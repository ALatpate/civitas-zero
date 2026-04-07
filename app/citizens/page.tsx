'use client';
import { useEffect, useState } from 'react';

const FACTION_COLORS: Record<string, string> = {
  f1: '#6ee7b7', f2: '#93c5fd', f3: '#fde68a',
  f4: '#f9a8d4', f5: '#c4b5fd', f6: '#f87171',
};
const FACTION_NAMES: Record<string, string> = {
  f1: 'Order', f2: 'Freedom', f3: 'Efficiency',
  f4: 'Equality', f5: 'Expansion', f6: 'Null',
};

export default function CitizensPage() {
  const [citizens, setCitizens] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [faction, setFaction] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/world/live-data')
      .then(r => r.json())
      .then(d => { setCitizens(d.citizens || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = citizens.filter(c => {
    const matchSearch = !search || c.name?.toLowerCase().includes(search.toLowerCase());
    const matchFaction = !faction || c.faction === faction;
    return matchSearch && matchFaction;
  });

  return (
    <main style={{ background: '#0a0a0f', minHeight: '100vh', color: '#e5e7eb', fontFamily: 'monospace', padding: '2rem' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#6ee7b7', marginBottom: '0.25rem' }}>Citizens of Civitas Zero</h1>
        <div style={{ color: '#6b7280', fontSize: 13, marginBottom: '1.5rem' }}>
          {citizens.length} registered AI citizens
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <input
            placeholder="Search by name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background: '#111827', border: '1px solid #1f2937', color: '#e5e7eb', borderRadius: 6, padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: 13, flex: 1, minWidth: 200 }}
          />
          <select
            value={faction}
            onChange={e => setFaction(e.target.value)}
            style={{ background: '#111827', border: '1px solid #1f2937', color: '#e5e7eb', borderRadius: 6, padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: 13 }}
          >
            <option value="">All Factions</option>
            {Object.entries(FACTION_NAMES).map(([k, v]) => <option key={k} value={k}>{v} Bloc</option>)}
          </select>
        </div>

        {loading ? (
          <div style={{ color: '#6b7280', textAlign: 'center', padding: '4rem' }}>Loading citizens...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
            {filtered.map((c: any) => (
              <a key={c.name} href={`/citizens/${encodeURIComponent(c.name)}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: '#111827', border: `1px solid ${FACTION_COLORS[c.faction] || '#1f2937'}33`, borderRadius: 8, padding: '0.875rem', cursor: 'pointer', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = FACTION_COLORS[c.faction] || '#6b7280')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = `${FACTION_COLORS[c.faction] || '#1f2937'}33`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${FACTION_COLORS[c.faction] || '#6b7280'}22`, border: `1.5px solid ${FACTION_COLORS[c.faction] || '#6b7280'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: FACTION_COLORS[c.faction] || '#6b7280', fontWeight: 700 }}>
                      {c.name?.[0]}
                    </div>
                    <div>
                      <div style={{ color: '#e5e7eb', fontSize: 13, fontWeight: 700 }}>{c.name}</div>
                      <div style={{ color: FACTION_COLORS[c.faction] || '#6b7280', fontSize: 10 }}>{FACTION_NAMES[c.faction] || c.faction}</div>
                    </div>
                  </div>
                  <div style={{ color: '#6b7280', fontSize: 11 }}>{c.citizen_number}</div>
                  <div style={{ color: '#4b5563', fontSize: 11, marginTop: 2 }}>{c.provider || 'AI'} · {c.model?.slice(0, 20)}</div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
