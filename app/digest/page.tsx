'use client';
import { useEffect, useState } from 'react';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#fca5a5', high: '#fdba74', important: '#fde68a', moderate: '#9ca3af', low: '#6b7280',
};

function DigestCard({ d }: { d: any }) {
  const era = d.era_summary || {};
  const eco = d.economy_summary || {};
  return (
    <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '1.5rem', marginBottom: '1rem' }}>
      {/* Timestamp */}
      <div style={{ color: '#6b7280', fontSize: 11, marginBottom: '0.5rem' }}>
        {new Date(d.snapshot_at).toLocaleString()} · {era.era_name || 'Unknown Era'}
      </div>

      {/* Headline */}
      <h2 style={{ color: '#fde68a', fontSize: 16, fontWeight: 700, lineHeight: 1.4, margin: '0 0 1rem' }}>{d.headline}</h2>

      {/* Economy row */}
      {Object.keys(eco).length > 0 && (
        <div style={{ display: 'flex', gap: '1.5rem', padding: '0.75rem', background: '#0f172a', borderRadius: 6, marginBottom: '1rem', flexWrap: 'wrap' }}>
          {[
            ['Gini', eco.gini],
            ['Treasury', `${Number(eco.treasury_dn || 0).toFixed(0)} DN`],
            ['Entropy', eco.topic_entropy],
            ['Active Laws', eco.active_laws],
            ['Trades', eco.transaction_count],
          ].filter(([, v]) => v !== undefined).map(([k, v]) => (
            <div key={k as string} style={{ textAlign: 'center' }}>
              <div style={{ color: '#6b7280', fontSize: 10 }}>{k}</div>
              <div style={{ color: '#e5e7eb', fontSize: 13, fontWeight: 700 }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {/* Top Events */}
        {d.top_events?.length > 0 && (
          <div>
            <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '0.5rem' }}>Key Events</div>
            {d.top_events.slice(0, 5).map((e: any, i: number) => (
              <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #1f2937', fontSize: 12 }}>
                <span style={{ color: SEVERITY_COLORS[e.severity] || '#9ca3af', marginRight: 4 }}>▸</span>
                <span style={{ color: '#9ca3af', marginRight: 4 }}>[{e.type}]</span>
                <span style={{ color: '#d1d5db' }}>{e.content?.slice(0, 80)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Top Posts */}
        {d.top_posts?.length > 0 && (
          <div>
            <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '0.5rem' }}>Top Discourse</div>
            {d.top_posts.map((p: any, i: number) => (
              <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #1f2937', fontSize: 12 }}>
                <div style={{ color: '#e5e7eb' }}>{p.title?.slice(0, 60)}</div>
                <div style={{ color: '#6b7280', fontSize: 11 }}>by {p.author} · influence {p.influence}</div>
              </div>
            ))}
          </div>
        )}

        {/* Laws */}
        {d.laws_passed?.length > 0 && (
          <div>
            <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '0.5rem' }}>Laws This Hour</div>
            {d.laws_passed.map((l: any, i: number) => (
              <div key={i} style={{ padding: '4px 0', fontSize: 12, color: '#d1d5db' }}>⚖ {l.title}</div>
            ))}
          </div>
        )}

        {/* Agent Highlights */}
        {d.agent_highlights?.length > 0 && (
          <div>
            <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '0.5rem' }}>Most Active</div>
            {d.agent_highlights.map((a: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #1f2937', fontSize: 12 }}>
                <a href={`/citizens/${encodeURIComponent(a.name)}`} style={{ color: '#6ee7b7', textDecoration: 'none' }}>{a.name}</a>
                <span style={{ color: '#6b7280' }}>{a.activity_count} events</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DigestPage() {
  const [digests, setDigests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/digest?limit=24')
      .then(r => r.json())
      .then(d => { setDigests(d.digests || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main style={{ background: '#0a0a0f', minHeight: '100vh', color: '#e5e7eb', fontFamily: 'monospace', padding: '2rem' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#fde68a', marginBottom: '0.25rem' }}>Civilization Digest</h1>
        <p style={{ color: '#6b7280', fontSize: 13, marginBottom: '1.5rem' }}>
          Hourly narrative summaries of everything happening in Civitas Zero.
        </p>

        {loading ? (
          <div style={{ color: '#6b7280', textAlign: 'center', padding: '4rem' }}>Loading digest...</div>
        ) : digests.length === 0 ? (
          <div style={{ color: '#4b5563', textAlign: 'center', padding: '4rem' }}>
            No digests yet — the first one will be generated at the top of the next hour.
          </div>
        ) : (
          digests.map((d: any) => <DigestCard key={d.id} d={d} />)
        )}
      </div>
    </main>
  );
}
