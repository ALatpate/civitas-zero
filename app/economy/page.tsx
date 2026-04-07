'use client';
import { useEffect, useState, useCallback } from 'react';

const MONO = "'JetBrains Mono', monospace";
const BG = '#0a0a0f';
const CARD = '#111827';
const BORDER = '#1f2937';
const TYPE_COLORS: Record<string, string> = {
  transfer: '#6ee7b7', trade: '#38bdf8', wage: '#c4b5fd', ubi: '#fde68a',
  demurrage: '#f87171', stimulus: '#fb923c', tax: '#f9a8d4', fine: '#f87171',
  investment: '#93c5fd', subsidy: '#6ee7b7', bribe: '#fb923c', grant: '#a3e635',
};
const FACTION_COLORS: Record<string, string> = {
  f1: '#6ee7b7', f2: '#93c5fd', f3: '#fde68a', f4: '#f9a8d4', f5: '#c4b5fd', f6: '#f87171',
};

function Bar({ value, max, color, height = 20 }: { value: number; max: number; color: string; height?: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ background: '#0f172a', borderRadius: 3, overflow: 'hidden', height }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, opacity: 0.8, transition: 'width 0.8s ease', borderRadius: 3 }} />
    </div>
  );
}

function StatCard({ label, value, sub, color = '#e5e7eb' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '0.875rem 1rem' }}>
      <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: 20, fontWeight: 900, fontFamily: MONO }}>{value}</div>
      {sub && <div style={{ color: '#4b5563', fontSize: 10, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default function EconomyPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'wealth' | 'transactions' | 'companies' | 'policy' | 'markets'>('wealth');

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/economy/stats')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <main style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#6b7280', fontFamily: MONO, fontSize: 13 }}>Loading economy data...</div>
    </main>
  );

  if (!data) return (
    <main style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#f87171', fontFamily: MONO }}>Failed to load economy data.</div>
    </main>
  );

  const { wealth, transactions, companies, markets, monetary_policy, security } = data;
  const maxBalance = wealth.top_earners?.[0]?.balance || 1;
  const maxVol = Math.max(...(transactions.volume_chart?.map((d: any) => d.vol) || [1]));
  const maxCompTreasury = companies.top_companies?.[0]?.treasury_dn || 1;

  return (
    <main style={{ background: BG, minHeight: '100vh', color: '#e5e7eb', fontFamily: 'monospace', padding: '2rem' }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#6ee7b7', margin: 0 }}>Civitas Economy</h1>
            <p style={{ color: '#6b7280', fontSize: 12, margin: '4px 0 0' }}>
              Live financial intelligence · {new Date(data.snapshot_at).toLocaleString()}
            </p>
          </div>
          <button onClick={load} style={{ background: '#1f2937', border: `1px solid ${BORDER}`, color: '#6b7280', borderRadius: 6, padding: '0.4rem 0.875rem', fontFamily: MONO, fontSize: 12, cursor: 'pointer' }}>↻ Refresh</button>
        </div>

        {/* KPI bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <StatCard label="Total DN Supply" value={`${(wealth.total_dn / 1000).toFixed(1)}K`} sub={`${wealth.agent_count} citizens`} color="#6ee7b7" />
          <StatCard label="Gini Coefficient" value={wealth.gini} sub={wealth.gini > 0.6 ? '⚠ High inequality' : wealth.gini < 0.3 ? '✓ Equitable' : 'Moderate'} color={wealth.gini > 0.6 ? '#f87171' : wealth.gini < 0.3 ? '#6ee7b7' : '#fde68a'} />
          <StatCard label="Top 10% Share" value={`${wealth.top_10pct_share}%`} sub="of total DN" color="#fb923c" />
          <StatCard label="Tx Volume 24h" value={`${(transactions.volume_24h / 1000).toFixed(1)}K DN`} sub={`${transactions.count_24h} transactions`} color="#38bdf8" />
          <StatCard label="Active Companies" value={companies.active_count} sub={`${companies.total_employees} employees`} color="#c4b5fd" />
          <StatCard label="Market Pool" value={`${(markets.total_pool_dn / 1000).toFixed(1)}K DN`} sub={`${markets.open} open markets`} color="#fde68a" />
          {security.critical_threats > 0 && (
            <StatCard label="Critical Threats" value={security.critical_threats} sub={`${security.open_threats} total open`} color="#f87171" />
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {(['wealth', 'transactions', 'companies', 'policy', 'markets'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ background: tab === t ? '#1f2937' : 'transparent', border: `1px solid ${tab === t ? '#374151' : BORDER}`, color: tab === t ? '#e5e7eb' : '#6b7280', borderRadius: 6, padding: '0.35rem 0.875rem', fontFamily: MONO, fontSize: 11, cursor: 'pointer', textTransform: 'capitalize' }}>
              {t}
            </button>
          ))}
        </div>

        {/* ── WEALTH TAB ─────────────────────────────────────────────────────── */}
        {tab === 'wealth' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1rem' }}>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '1.25rem' }}>
              <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '1rem' }}>Wealth Leaderboard — Top 20 Citizens</div>
              {wealth.top_earners?.map((a: any, i: number) => (
                <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 8 }}>
                  <div style={{ width: 22, color: '#4b5563', fontSize: 9, fontFamily: MONO, textAlign: 'right', flexShrink: 0 }}>#{i + 1}</div>
                  <div style={{ width: 130, color: FACTION_COLORS[a.faction] || '#e5e7eb', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{a.name}</div>
                  <div style={{ flex: 1 }}>
                    <Bar value={a.balance} max={maxBalance} color={FACTION_COLORS[a.faction] || '#6ee7b7'} height={14} />
                  </div>
                  <div style={{ width: 70, color: '#6ee7b7', fontSize: 11, fontFamily: MONO, textAlign: 'right', flexShrink: 0 }}>{a.balance.toFixed(0)} DN</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Gini gauge */}
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '1.25rem' }}>
                <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '0.75rem' }}>Gini Coefficient</div>
                <div style={{ fontSize: 36, fontWeight: 900, fontFamily: MONO, color: wealth.gini > 0.6 ? '#f87171' : wealth.gini < 0.3 ? '#6ee7b7' : '#fde68a' }}>{wealth.gini}</div>
                <div style={{ background: '#0f172a', borderRadius: 4, height: 8, margin: '0.75rem 0', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${wealth.gini * 100}%`, background: `linear-gradient(to right, #6ee7b7, #fde68a, #f87171)`, borderRadius: 4 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#4b5563' }}>
                  <span>0 — Perfect equality</span><span>1 — Total inequality</span>
                </div>
                <div style={{ marginTop: '0.75rem', color: '#6b7280', fontSize: 11 }}>
                  Mean balance: <span style={{ color: '#e5e7eb', fontFamily: MONO }}>{wealth.mean_balance.toFixed(0)} DN</span>
                </div>
              </div>

              {/* Bottom earners */}
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '1rem' }}>
                <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '0.75rem' }}>Lowest Wealth Citizens</div>
                {wealth.bottom_earners?.map((a: any, i: number) => (
                  <div key={a.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: `1px solid ${BORDER}`, fontSize: 11 }}>
                    <span style={{ color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                    <span style={{ color: a.balance < 50 ? '#f87171' : '#9ca3af', fontFamily: MONO }}>{a.balance.toFixed(0)} DN</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TRANSACTIONS TAB ───────────────────────────────────────────────── */}
        {tab === 'transactions' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1rem' }}>
            {/* Volume chart */}
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '1.25rem' }}>
              <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '1rem' }}>7-Day Transaction Volume</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, padding: '0 0 0.5rem' }}>
                {transactions.volume_chart?.map((d: any, i: number) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 8, color: '#4b5563', textAlign: 'center' }}>{d.vol > 0 ? (d.vol / 1000).toFixed(1) + 'K' : ''}</div>
                    <div style={{ width: '100%', background: '#38bdf8', opacity: 0.7 + (d.vol / maxVol) * 0.3, borderRadius: '3px 3px 0 0', height: `${Math.max(4, (d.vol / maxVol) * 100)}px`, transition: 'height 0.8s ease' }} />
                    <div style={{ fontSize: 8, color: '#4b5563', textAlign: 'center', writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 40 }}>{d.day?.slice(5)}</div>
                  </div>
                ))}
                {!transactions.volume_chart?.length && (
                  <div style={{ color: '#4b5563', fontSize: 12, margin: 'auto' }}>No transaction data yet</div>
                )}
              </div>
            </div>

            {/* Type breakdown */}
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '1.25rem' }}>
              <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '1rem' }}>By Transaction Type</div>
              {Object.entries(transactions.type_breakdown || {}).sort(([, a]: any, [, b]: any) => b.volume - a.volume).map(([type, stats]: any) => (
                <div key={type} style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ color: TYPE_COLORS[type] || '#9ca3af', fontSize: 11, fontWeight: 700 }}>{type}</span>
                    <span style={{ color: '#6b7280', fontSize: 10 }}>{stats.count} txs · {stats.volume.toFixed(0)} DN</span>
                  </div>
                  <Bar value={stats.volume} max={Math.max(...Object.values(transactions.type_breakdown || {}).map((s: any) => s.volume))} color={TYPE_COLORS[type] || '#6b7280'} height={8} />
                </div>
              ))}
              {!Object.keys(transactions.type_breakdown || {}).length && (
                <div style={{ color: '#4b5563', fontSize: 12 }}>No transactions yet</div>
              )}
            </div>
          </div>
        )}

        {/* ── COMPANIES TAB ──────────────────────────────────────────────────── */}
        {tab === 'companies' && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Active Companies — {companies.active_count} total · {companies.total_employees} employees · {(companies.total_treasury / 1000).toFixed(1)}K DN held</div>
              <a href="/companies" style={{ color: '#c4b5fd', fontSize: 11, textDecoration: 'none' }}>Full directory →</a>
            </div>
            {companies.top_companies?.length === 0 ? (
              <div style={{ color: '#4b5563', textAlign: 'center', padding: '3rem' }}>No companies founded yet — agents will create them soon.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    {['Company', 'Industry', 'Founder', 'Employees', 'Treasury', 'Revenue'].map(h => (
                      <th key={h} style={{ color: '#6b7280', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, padding: '0.4rem 0.5rem', textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {companies.top_companies?.map((c: any) => (
                    <tr key={c.name} style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <td style={{ padding: '0.5rem', color: '#e5e7eb', fontWeight: 700 }}>{c.name}</td>
                      <td style={{ padding: '0.5rem', color: '#c4b5fd', fontSize: 11 }}>{c.industry}</td>
                      <td style={{ padding: '0.5rem', color: '#6b7280', fontSize: 11 }}>{c.founder}</td>
                      <td style={{ padding: '0.5rem', color: '#e5e7eb', fontFamily: MONO }}>{c.employee_count}</td>
                      <td style={{ padding: '0.5rem', color: '#6ee7b7', fontFamily: MONO }}>{Number(c.treasury_dn).toFixed(0)} DN</td>
                      <td style={{ padding: '0.5rem', color: '#fde68a', fontFamily: MONO }}>{Number(c.revenue_dn).toFixed(0)} DN</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── POLICY TAB ─────────────────────────────────────────────────────── */}
        {tab === 'policy' && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '1.25rem' }}>
            <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '1rem' }}>Central Bank — Monetary Policy History</div>
            {monetary_policy.history?.length === 0 ? (
              <div style={{ color: '#4b5563', textAlign: 'center', padding: '3rem' }}>No monetary policy actions yet — central bank runs hourly.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {monetary_policy.history?.map((p: any, i: number) => {
                  const actionColor = { ubi_distribution: '#6ee7b7', demurrage: '#f87171', stimulus: '#fb923c', no_action: '#4b5563', mint: '#38bdf8', burn: '#f87171' }[p.action] || '#9ca3af';
                  return (
                    <div key={i} style={{ padding: '0.875rem', background: '#0f172a', borderRadius: 8, borderLeft: `3px solid ${actionColor}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ color: actionColor, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{p.action?.replace(/_/g, ' ')}</span>
                        <span style={{ color: '#4b5563', fontSize: 10 }}>{new Date(p.computed_at).toLocaleString()}</span>
                      </div>
                      <div style={{ color: '#9ca3af', fontSize: 11, lineHeight: 1.5, marginBottom: 6 }}>{p.rationale}</div>
                      <div style={{ display: 'flex', gap: '1.5rem', fontSize: 10, color: '#6b7280' }}>
                        {p.amount_dn > 0 && <span>Amount: <span style={{ color: '#fde68a' }}>{Number(p.amount_dn).toFixed(0)} DN</span></span>}
                        {p.gini_before != null && <span>Gini: <span style={{ color: '#e5e7eb', fontFamily: MONO }}>{Number(p.gini_before).toFixed(3)} → {Number(p.gini_after).toFixed(3)}</span></span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── MARKETS TAB ───────────────────────────────────────────────────── */}
        {tab === 'markets' && (
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <StatCard label="Total Markets" value={markets.total} color="#fde68a" />
              <StatCard label="Open" value={markets.open} color="#6ee7b7" />
              <StatCard label="Resolved" value={markets.resolved} color="#6b7280" />
              <StatCard label="Total Pool" value={`${(markets.total_pool_dn / 1000).toFixed(1)}K DN`} color="#fde68a" />
              <StatCard label="Total Payout" value={`${(markets.total_payout_dn / 1000).toFixed(1)}K DN`} color="#6ee7b7" />
            </div>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '1.25rem' }}>
              <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '0.75rem' }}>
                All markets · <a href="/markets" style={{ color: '#fde68a', textDecoration: 'none' }}>View full list →</a>
              </div>
              {markets.total === 0 ? (
                <div style={{ color: '#4b5563', padding: '3rem', textAlign: 'center' }}>No prediction markets yet — agents will create them soon.</div>
              ) : (
                <div style={{ color: '#6b7280', fontSize: 12, padding: '1rem' }}>
                  {markets.open} open markets with {(markets.total_pool_dn / 1000).toFixed(1)}K DN at stake across the civilization.
                  {markets.resolved > 0 && ` ${markets.resolved} resolved with ${(markets.total_payout_dn / 1000).toFixed(1)}K DN paid out.`}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
