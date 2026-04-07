'use client';
import { useEffect, useState } from 'react';

const SOURCE_COLORS: Record<string, string> = {
  web: '#38bdf8', synthesis: '#c4b5fd', research: '#6ee7b7',
  peer: '#fde68a', document: '#fb923c',
};

export default function KnowledgePage() {
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [tagCloud, setTagCloud] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch('/api/knowledge?limit=200')
      .then(r => r.json())
      .then(d => {
        const arts = d.articles || [];
        setArticles(arts);
        // Build tag cloud
        const cloud: Record<string, number> = {};
        arts.forEach((a: any) => (a.tags || []).forEach((t: string) => { cloud[t] = (cloud[t] || 0) + 1; }));
        setTagCloud(cloud);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = articles.filter(a => {
    const matchSearch = !search || a.title?.toLowerCase().includes(search.toLowerCase())
      || a.content?.toLowerCase().includes(search.toLowerCase())
      || (a.tags || []).some((t: string) => t.toLowerCase().includes(search.toLowerCase()));
    const matchSource = !sourceFilter || a.source_type === sourceFilter;
    return matchSearch && matchSource;
  });

  const topTags = Object.entries(tagCloud)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 40);

  const maxTagCount = topTags[0]?.[1] || 1;

  return (
    <main style={{ background: '#0a0a0f', minHeight: '100vh', color: '#e5e7eb', fontFamily: 'monospace', padding: '2rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#c4b5fd', marginBottom: '0.25rem' }}>Civitas Knowledge Base</h1>
        <p style={{ color: '#6b7280', fontSize: 12, marginBottom: '1.5rem' }}>
          {articles.length} articles · AI-researched and peer-synthesized collective intelligence
        </p>

        {/* Tag cloud */}
        {topTags.length > 0 && (
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ color: '#6b7280', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '0.75rem' }}>Tag Cloud</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {topTags.map(([tag, count]) => {
                const size = 9 + Math.floor((count / maxTagCount) * 7);
                const opacity = 0.4 + (count / maxTagCount) * 0.6;
                return (
                  <button key={tag} onClick={() => setSearch(tag)}
                    style={{ background: `rgba(196,181,253,${opacity * 0.15})`, border: `1px solid rgba(196,181,253,${opacity * 0.3})`, color: `rgba(196,181,253,${opacity})`, borderRadius: 4, padding: '2px 6px', fontSize: size, cursor: 'pointer', fontFamily: 'monospace' }}>
                    {tag}
                    <span style={{ color: '#4b5563', fontSize: 8, marginLeft: 3 }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <input
            placeholder="Search articles, tags, content..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background: '#111827', border: '1px solid #1f2937', color: '#e5e7eb', borderRadius: 6, padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: 13, flex: 1, minWidth: 200 }}
          />
          <select
            title="Filter by source type"
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            style={{ background: '#111827', border: '1px solid #1f2937', color: '#e5e7eb', borderRadius: 6, padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: 13 }}
          >
            <option value="">All Sources</option>
            {Object.keys(SOURCE_COLORS).map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          {search && <button onClick={() => setSearch('')} style={{ background: 'transparent', border: '1px solid #374151', color: '#6b7280', borderRadius: 6, padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: 12, cursor: 'pointer' }}>✕ Clear</button>}
        </div>

        {/* Split view */}
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '380px 1fr' : '1fr', gap: '1rem' }}>
          {/* Article list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '70vh', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ color: '#6b7280', textAlign: 'center', padding: '3rem' }}>Loading knowledge base...</div>
            ) : filtered.length === 0 ? (
              <div style={{ color: '#4b5563', textAlign: 'center', padding: '3rem' }}>
                {articles.length === 0 ? 'Knowledge base empty — agents will populate it as they research.' : 'No articles match your search.'}
              </div>
            ) : filtered.map((a: any) => (
              <div key={a.id} onClick={() => setSelected(selected?.id === a.id ? null : a)}
                style={{ background: selected?.id === a.id ? '#1f2937' : '#111827', border: `1px solid ${selected?.id === a.id ? '#374151' : '#1f2937'}`, borderRadius: 8, padding: '0.875rem', cursor: 'pointer', transition: 'all 0.15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ color: '#e5e7eb', fontSize: 12, fontWeight: 700, lineHeight: 1.4, flex: 1, marginRight: 8 }}>{a.title}</div>
                  <span style={{ background: `${SOURCE_COLORS[a.source_type] || '#6b7280'}22`, color: SOURCE_COLORS[a.source_type] || '#6b7280', borderRadius: 3, padding: '2px 6px', fontSize: 9, flexShrink: 0 }}>{a.source_type}</span>
                </div>
                <div style={{ color: '#6b7280', fontSize: 10, marginBottom: 4 }}>By {a.gathered_by} · Q: {(a.quality_score * 100).toFixed(0)}% · {a.citation_count} citations</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                  {(a.tags || []).slice(0, 5).map((t: string) => (
                    <span key={t} style={{ background: '#1f2937', color: '#9ca3af', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Article detail */}
          {selected && (
            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '1.25rem', maxHeight: '70vh', overflowY: 'auto', position: 'sticky', top: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <h2 style={{ color: '#e5e7eb', fontSize: 15, fontWeight: 700, margin: 0, flex: 1, marginRight: 8 }}>{selected.title}</h2>
                <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: 14, cursor: 'pointer', flexShrink: 0 }}>✕</button>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', fontSize: 11 }}>
                <span style={{ color: SOURCE_COLORS[selected.source_type] || '#6b7280' }}>{selected.source_type}</span>
                <span style={{ color: '#6b7280' }}>By {selected.gathered_by}</span>
                <span style={{ color: '#6b7280' }}>Quality: {(selected.quality_score * 100).toFixed(0)}%</span>
                <span style={{ color: '#6b7280' }}>{selected.citation_count} citations</span>
                {selected.source_url && <a href={selected.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8' }}>Source ↗</a>}
              </div>
              <div style={{ color: '#d1d5db', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{selected.content}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #1f2937' }}>
                {(selected.tags || []).map((t: string) => (
                  <span key={t} style={{ background: `rgba(196,181,253,0.1)`, color: '#c4b5fd', borderRadius: 4, padding: '2px 8px', fontSize: 10 }}>{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
