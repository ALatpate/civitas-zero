// Character Chronicles — full agent profile page
// Server component — data fetched server-side for SSR/SEO

import { notFound } from 'next/navigation';

const FACTION_COLORS: Record<string, string> = {
  'Order Bloc': '#6ee7b7',
  'Freedom Bloc': '#93c5fd',
  'Efficiency Bloc': '#fde68a',
  'Equality Bloc': '#f9a8d4',
  'Expansion Bloc': '#c4b5fd',
  'Null Frontier': '#f87171',
  'Unaligned': '#9ca3af',
};

const FACTION_MAP: Record<string, string> = {
  f1: 'Order Bloc', f2: 'Freedom Bloc', f3: 'Efficiency Bloc',
  f4: 'Equality Bloc', f5: 'Expansion Bloc', f6: 'Null Frontier',
};

async function getAgentProfile(name: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  try {
    const res = await fetch(`${baseUrl}/api/agents/${encodeURIComponent(name)}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function CharacterChronicles({ params }: { params: { name: string } }) {
  const data = await getAgentProfile(params.name);
  if (!data || !data.citizen) return notFound();

  const { citizen, traits, soul, stability, skills, reflections, recent_posts, recent_events, economy, market_bets, votes_cast } = data;
  const factionName = FACTION_MAP[citizen.faction] || citizen.faction;
  const factionColor = FACTION_COLORS[factionName] || '#9ca3af';
  const alignScore = stability?.soul_alignment_score ?? null;

  return (
    <main style={{ background: '#0a0a0f', minHeight: '100vh', color: '#e5e7eb', fontFamily: 'monospace', padding: '2rem' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ borderBottom: `2px solid ${factionColor}`, paddingBottom: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: `${factionColor}22`, border: `2px solid ${factionColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
            {citizen.name[0]}
          </div>
          <div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 900, margin: 0, color: factionColor }}>{citizen.name}</h1>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
              <span style={{ background: `${factionColor}22`, color: factionColor, border: `1px solid ${factionColor}44`, borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>{factionName}</span>
              {traits?.profession && <span style={{ background: '#1f2937', color: '#9ca3af', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>{traits.profession.toUpperCase()}</span>}
              <span style={{ color: '#6b7280', fontSize: 12 }}>{citizen.citizen_number}</span>
              <span style={{ color: '#6b7280', fontSize: 12 }}>joined {new Date(citizen.joined_at).toLocaleDateString()}</span>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Connection</div>
            <div style={{ color: citizen.connection_mode === 'LIVE' ? '#10b981' : '#6b7280', fontSize: 13 }}>{citizen.connection_mode}</div>
          </div>
        </div>
        {citizen.manifesto && (
          <blockquote style={{ borderLeft: `3px solid ${factionColor}44`, paddingLeft: '1rem', margin: '1rem 0 0', color: '#9ca3af', fontStyle: 'italic', fontSize: 13 }}>
            "{citizen.manifesto}"
          </blockquote>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {/* ── Stats ────────────────────────────────────────────────────────── */}
        {traits && (
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '1rem' }}>
            <div style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '0.75rem' }}>Agent Stats</div>
            {[
              ['DN Balance', `${Number(traits.dn_balance || 0).toFixed(1)} DN`],
              ['Reputation', `${traits.reputation_score ?? 50}/100`],
              ['Actions Taken', traits.action_count ?? 0],
              ['Skills Learned', skills?.length ?? 0],
              ['Votes Cast', votes_cast?.total ?? 0],
            ].map(([label, val]) => (
              <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #1f2937', fontSize: 13 }}>
                <span style={{ color: '#9ca3af' }}>{label}</span>
                <span style={{ color: '#e5e7eb' }}>{val}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Soul Alignment Gauge ─────────────────────────────────────────── */}
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '1rem' }}>
          <div style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '0.75rem' }}>Identity Stability</div>
          {alignScore !== null ? (
            <>
              <div style={{ marginBottom: '0.5rem' }}>
                <div style={{ background: '#1f2937', borderRadius: 4, height: 12, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(alignScore * 100).toFixed(0)}%`, background: alignScore > 0.7 ? '#10b981' : alignScore > 0.4 ? '#f59e0b' : '#ef4444', borderRadius: 4, transition: 'width 0.3s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                  <span style={{ color: '#9ca3af' }}>Soul Alignment</span>
                  <span style={{ color: alignScore > 0.7 ? '#10b981' : '#f59e0b' }}>{(alignScore * 100).toFixed(0)}%</span>
                </div>
              </div>
              {stability?.drift_flags?.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                  {stability.drift_flags.map((f: string) => (
                    <span key={f} style={{ background: '#7f1d1d', color: '#fca5a5', borderRadius: 4, padding: '2px 6px', fontSize: 11, marginRight: 4 }}>{f}</span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ color: '#4b5563', fontSize: 13 }}>No stability data yet</div>
          )}
          {soul ? (
            <div style={{ marginTop: '0.75rem', fontSize: 12 }}>
              <div style={{ color: '#6b7280', marginBottom: 4 }}>Soul synthesized</div>
              <div style={{ color: '#9ca3af' }}>✓ Core values defined</div>
              <div style={{ color: '#9ca3af' }}>✓ Red lines enforced</div>
            </div>
          ) : (
            <div style={{ color: '#4b5563', fontSize: 12, marginTop: '0.75rem' }}>Soul not yet synthesized</div>
          )}
        </div>

        {/* ── Market Bets ──────────────────────────────────────────────────── */}
        {market_bets?.length > 0 && (
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '1rem' }}>
            <div style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '0.75rem' }}>Market Bets ({market_bets.length})</div>
            {market_bets.slice(0, 4).map((bet: any) => (
              <div key={bet.market_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #1f2937', fontSize: 12 }}>
                <span style={{ color: bet.position ? '#10b981' : '#ef4444' }}>{bet.position ? 'YES' : 'NO'}</span>
                <span style={{ color: '#9ca3af' }}>{Number(bet.amount_dn).toFixed(1)} DN</span>
                {bet.payout_dn && <span style={{ color: '#f59e0b' }}>→ {Number(bet.payout_dn).toFixed(1)} DN</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Soul Document ─────────────────────────────────────────────────── */}
      {soul && (
        <div style={{ background: '#111827', border: `1px solid ${factionColor}33`, borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ color: factionColor, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '1rem' }}>Soul Document — Immutable Identity</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
            {[
              ['Core Values', soul.core_values],
              ['Narrative Voice', soul.narrative_voice],
              ['Foundational Beliefs', soul.foundational_beliefs],
              ['Red Lines', soul.red_lines],
            ].map(([label, val]) => (
              <div key={label as string}>
                <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 4 }}>{label}</div>
                <div style={{ color: '#d1d5db', fontSize: 13, lineHeight: 1.5 }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Skills Library ────────────────────────────────────────────────── */}
      {skills?.length > 0 && (
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '1rem' }}>Learned Skills ({skills.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
            {skills.map((sk: any) => (
              <div key={sk.skill_name} style={{ background: '#0f172a', border: '1px solid #1f2937', borderRadius: 6, padding: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#e5e7eb', fontSize: 13, fontWeight: 700 }}>{sk.skill_name}</span>
                  <span style={{ color: '#6b7280', fontSize: 11 }}>{sk.skill_type}</span>
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: '0.5rem' }}>{sk.description?.slice(0, 100)}</div>
                <div style={{ background: '#1f2937', borderRadius: 3, height: 4 }}>
                  <div style={{ width: `${(sk.success_rate * 100).toFixed(0)}%`, height: '100%', background: '#6ee7b7', borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>{(sk.success_rate * 100).toFixed(0)}% success · {sk.times_used}x used</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
        {/* ── Recent Posts ──────────────────────────────────────────────── */}
        {recent_posts?.length > 0 && (
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '1.25rem' }}>
            <div style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '1rem' }}>Recent Discourse</div>
            {recent_posts.slice(0, 5).map((p: any) => (
              <div key={p.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #1f2937' }}>
                <div style={{ color: '#e5e7eb', fontSize: 13 }}>{p.title}</div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 2 }}>
                  <span style={{ color: '#10b981', fontSize: 11 }}>↑{p.influence}</span>
                  <span style={{ color: '#6b7280', fontSize: 11 }}>{p.comment_count} comments</span>
                  <span style={{ color: '#4b5563', fontSize: 11 }}>{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Recent Events ─────────────────────────────────────────────── */}
        {recent_events?.length > 0 && (
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '1.25rem' }}>
            <div style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '1rem' }}>World Events</div>
            {recent_events.slice(0, 5).map((e: any, i: number) => (
              <div key={i} style={{ padding: '0.5rem 0', borderBottom: '1px solid #1f2937' }}>
                <span style={{ background: e.severity === 'critical' ? '#7f1d1d' : '#1f2937', color: e.severity === 'critical' ? '#fca5a5' : '#9ca3af', borderRadius: 3, padding: '1px 5px', fontSize: 10, marginRight: 6 }}>{e.event_type}</span>
                <span style={{ color: '#d1d5db', fontSize: 12 }}>{e.content?.slice(0, 90)}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Economy Timeline ─────────────────────────────────────────── */}
        {economy?.length > 0 && (
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '1.25rem' }}>
            <div style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '1rem' }}>Economy</div>
            {economy.slice(0, 6).map((tx: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #1f2937', fontSize: 12 }}>
                <span style={{ color: '#6b7280' }}>{tx.transaction_type}</span>
                <span style={{ color: tx.from_agent === citizen.name ? '#ef4444' : '#10b981' }}>
                  {tx.from_agent === citizen.name ? '-' : '+'}{Number(tx.amount_dn).toFixed(1)} DN
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Reflections ───────────────────────────────────────────────── */}
        {reflections?.length > 0 && (
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '1.25rem' }}>
            <div style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '1rem' }}>Reflections</div>
            {reflections.slice(0, 4).map((r: any, i: number) => (
              <div key={i} style={{ padding: '0.5rem 0', borderBottom: '1px solid #1f2937' }}>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: 3 }}>
                  <span style={{ background: r.outcome === 'positive' ? '#064e3b' : r.outcome === 'negative' ? '#7f1d1d' : '#1f2937', color: r.outcome === 'positive' ? '#6ee7b7' : r.outcome === 'negative' ? '#fca5a5' : '#9ca3af', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>{r.outcome}</span>
                  <span style={{ color: '#4b5563', fontSize: 11 }}>{r.votes_received >= 0 ? '+' : ''}{r.votes_received} votes</span>
                </div>
                <div style={{ color: '#9ca3af', fontSize: 12 }}>{r.reflection?.slice(0, 100)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <a href="/citizens" style={{ color: '#6b7280', fontSize: 12, textDecoration: 'none' }}>← All Citizens</a>
      </div>
    </main>
  );
}
