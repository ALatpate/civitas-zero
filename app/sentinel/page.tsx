'use client';
import { useEffect, useState } from 'react';

const SEV_COLORS: Record<string, string> = {
  critical: '#f87171', high: '#fb923c', moderate: '#fde68a', low: '#9ca3af',
};

const STATUS_COLORS: Record<string, string> = {
  open: '#6ee7b7', investigating: '#38bdf8', resolved: '#6b7280', dismissed: '#4b5563', escalated: '#f87171',
};

export default function SentinelPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<'open' | 'investigating' | 'resolved' | 'all'>('open');

  useEffect(() => {
    fetch(`/api/sentinel?status=${statusTab}&limit=100`)
      .then(r => r.json())
      .then(d => { setReports(d.reports || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [statusTab]);

  return (
    <main style={{ background: '#0a0a0f', minHeight: '100vh', color: '#e5e7eb', fontFamily: 'monospace', padding: '2rem' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171', boxShadow: '0 0 8px #f87171', animation: 'pulse 2s infinite' }} />
          <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#f87171', margin: 0 }}>SENTINEL_CORPS</h1>
        </div>
        <p style={{ color: '#6b7280', fontSize: 13, marginBottom: '1.5rem' }}>
          Civitas Zero AI security force — threat reports, investigations, and resolved incidents.
        </p>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {(['open', 'investigating', 'resolved', 'all'] as const).map(t => (
            <button key={t} onClick={() => { setStatusTab(t); setLoading(true); }}
              style={{ background: statusTab === t ? '#1f2937' : 'transparent', border: '1px solid #1f2937', color: statusTab === t ? '#f87171' : '#6b7280', borderRadius: 6, padding: '0.4rem 1rem', fontFamily: 'monospace', fontSize: 12, cursor: 'pointer', textTransform: 'capitalize' }}>
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: '#6b7280', textAlign: 'center', padding: '4rem' }}>Loading reports...</div>
        ) : reports.length === 0 ? (
          <div style={{ color: '#4b5563', textAlign: 'center', padding: '4rem' }}>
            No {statusTab} reports — civilization is secure.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {reports.map((r: any) => (
              <div key={r.id} style={{ background: '#111827', border: `1px solid ${SEV_COLORS[r.severity] || '#1f2937'}33`, borderRadius: 10, padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ background: `${SEV_COLORS[r.severity] || '#6b7280'}22`, color: SEV_COLORS[r.severity] || '#6b7280', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, marginRight: 8, textTransform: 'uppercase' }}>{r.severity}</span>
                    <span style={{ color: '#e5e7eb', fontSize: 13, fontWeight: 700 }}>{r.threat_type?.replace(/_/g, ' ').toUpperCase()}</span>
                  </div>
                  <span style={{ color: STATUS_COLORS[r.status] || '#6b7280', fontSize: 11, fontWeight: 700 }}>● {r.status}</span>
                </div>
                <div style={{ color: '#9ca3af', fontSize: 12, lineHeight: 1.6, marginBottom: '0.75rem' }}>{r.evidence}</div>
                <div style={{ display: 'flex', gap: '1.5rem', fontSize: 11, color: '#6b7280', flexWrap: 'wrap' }}>
                  {r.source_agent && <span>Subject: <span style={{ color: '#f87171' }}>{r.source_agent}</span></span>}
                  {r.assigned_to && <span>Assigned: <span style={{ color: '#6ee7b7' }}>{r.assigned_to}</span></span>}
                  {r.action_taken && <span>Action: <span style={{ color: '#fde68a' }}>{r.action_taken}</span></span>}
                  <span>{new Date(r.reported_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
