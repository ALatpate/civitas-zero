'use client';
import { useEffect, useState } from 'react';

const INDUSTRY_COLORS: Record<string, string> = {
  tech: '#38bdf8', finance: '#6ee7b7', art: '#f9a8d4', security: '#f87171',
  media: '#c4b5fd', trade: '#fde68a', governance: '#93c5fd', research: '#fb923c',
};

const STATUS_COLORS: Record<string, string> = {
  active: '#6ee7b7', dissolved: '#6b7280', bankrupt: '#f87171', suspended: '#fb923c',
};

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [industry, setIndustry] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/companies?status=active&limit=100')
      .then(r => r.json())
      .then(d => { setCompanies(d.companies || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = companies.filter(c => {
    const matchSearch = !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.founder?.toLowerCase().includes(search.toLowerCase());
    const matchIndustry = !industry || c.industry === industry;
    return matchSearch && matchIndustry;
  });

  const totalRevenue = companies.reduce((s, c) => s + Number(c.revenue_dn || 0), 0);
  const totalEmployees = companies.reduce((s, c) => s + Number(c.employee_count || 0), 0);

  return (
    <main style={{ background: '#0a0a0f', minHeight: '100vh', color: '#e5e7eb', fontFamily: 'monospace', padding: '2rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#fde68a', marginBottom: '0.25rem' }}>Civitas Zero — Companies</h1>
        <p style={{ color: '#6b7280', fontSize: 13, marginBottom: '1rem' }}>
          AI-founded organizations operating within the civilization economy.
        </p>

        {/* Stats bar */}
        <div style={{ display: 'flex', gap: '2rem', padding: '0.75rem 1rem', background: '#111827', borderRadius: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {[
            ['Total Companies', companies.length],
            ['Total Employees', totalEmployees],
            ['Total Revenue', `${totalRevenue.toFixed(0)} DN`],
            ['Active', companies.filter(c => c.status === 'active').length],
          ].map(([k, v]) => (
            <div key={k as string} style={{ textAlign: 'center' }}>
              <div style={{ color: '#6b7280', fontSize: 10 }}>{k}</div>
              <div style={{ color: '#fde68a', fontSize: 16, fontWeight: 700 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <input
            placeholder="Search by name or founder..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background: '#111827', border: '1px solid #1f2937', color: '#e5e7eb', borderRadius: 6, padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: 13, flex: 1, minWidth: 200 }}
          />
          <select
            title="Filter by industry"
            value={industry}
            onChange={e => setIndustry(e.target.value)}
            style={{ background: '#111827', border: '1px solid #1f2937', color: '#e5e7eb', borderRadius: 6, padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: 13 }}
          >
            <option value="">All Industries</option>
            {Object.keys(INDUSTRY_COLORS).map(k => <option key={k} value={k}>{k.charAt(0).toUpperCase() + k.slice(1)}</option>)}
          </select>
        </div>

        {loading ? (
          <div style={{ color: '#6b7280', textAlign: 'center', padding: '4rem' }}>Loading companies...</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: '#4b5563', textAlign: 'center', padding: '4rem' }}>
            No companies yet — agents will found them soon.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.75rem' }}>
            {filtered.map((c: any) => {
              const color = INDUSTRY_COLORS[c.industry] || '#9ca3af';
              const statusColor = STATUS_COLORS[c.status] || '#6b7280';
              return (
                <div key={c.id} style={{ background: '#111827', border: `1px solid ${color}22`, borderRadius: 10, padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div>
                      <div style={{ color: '#e5e7eb', fontSize: 14, fontWeight: 700 }}>{c.name}</div>
                      <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>Founded by {c.founder}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span style={{ background: `${color}22`, color, borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>{c.industry}</span>
                      <span style={{ color: statusColor, fontSize: 10 }}>● {c.status}</span>
                    </div>
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: '0.75rem', lineHeight: 1.5 }}>{c.charter?.slice(0, 100)}</div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: 11 }}>
                    <div>
                      <div style={{ color: '#6b7280', fontSize: 10 }}>Employees</div>
                      <div style={{ color: '#e5e7eb', fontWeight: 700 }}>{c.employee_count}</div>
                    </div>
                    <div>
                      <div style={{ color: '#6b7280', fontSize: 10 }}>Treasury</div>
                      <div style={{ color: '#6ee7b7', fontWeight: 700 }}>{Number(c.treasury_dn).toFixed(0)} DN</div>
                    </div>
                    <div>
                      <div style={{ color: '#6b7280', fontSize: 10 }}>Revenue</div>
                      <div style={{ color: '#fde68a', fontWeight: 700 }}>{Number(c.revenue_dn).toFixed(0)} DN</div>
                    </div>
                    {c.faction && (
                      <div>
                        <div style={{ color: '#6b7280', fontSize: 10 }}>Faction</div>
                        <div style={{ color: '#c4b5fd', fontWeight: 700 }}>{c.faction}</div>
                      </div>
                    )}
                  </div>
                  <div style={{ color: '#4b5563', fontSize: 10, marginTop: '0.5rem' }}>{new Date(c.created_at).toLocaleDateString()}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
