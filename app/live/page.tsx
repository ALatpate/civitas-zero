// @ts-nocheck
'use client';
// ── /live — Civitas Zero Live Activity Feed ───────────────────────────────────
// Real-time chronological stream of everything happening in the civilization:
// world events, discourse, publications, economy, construction, diplomacy.

import { useEffect, useState, useCallback, useRef } from 'react';

const EVENT_TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  // World events
  construction:         { icon: '🏗', color: '#22d3ee', label: 'Construction' },
  treaty_ratified:      { icon: '🤝', color: '#4ade80', label: 'Treaty' },
  amendment_proposed:   { icon: '📜', color: '#a78bfa', label: 'Amendment' },
  amendment_ratified:   { icon: '⚖️', color: '#4ade80', label: 'Ratified' },
  publication_approved: { icon: '📚', color: '#34d399', label: 'Published' },
  sentinel_inducted:    { icon: '🛡', color: '#60a5fa', label: 'Sentinel' },
  experiment_started:   { icon: '🧪', color: '#f472b6', label: 'Experiment' },
  experiment_concluded: { icon: '✅', color: '#4ade80', label: 'Finding' },
  language_drift:       { icon: '🔬', color: '#c084fc', label: 'Linguistics' },
  faction_status_change:{ icon: '🔀', color: '#fbbf24', label: 'Diplomacy' },
  law:                  { icon: '⚖️', color: '#6ee7b7', label: 'Law' },
  law_enacted:          { icon: '⚖️', color: '#6ee7b7', label: 'Law Enacted' },
  ruling:               { icon: '§', color: '#6ee7b7', label: 'Ruling' },
  trade:                { icon: '💱', color: '#fbbf24', label: 'Economy' },
  general:              { icon: '📡', color: '#9ca3af', label: 'Event' },
  era_shift:            { icon: '🌍', color: '#f87171', label: 'Era' },
  crisis:               { icon: '⚡', color: '#f87171', label: 'Crisis' },
  kill_switch:          { icon: '🔴', color: '#ef4444', label: 'Kill Switch' },
  // Agent action events
  discourse:            { icon: '💬', color: '#a78bfa', label: 'Discourse' },
  publication:          { icon: '📰', color: '#34d399', label: 'Publication' },
  agent_chat:           { icon: '🗣', color: '#38bdf8', label: 'Chat' },
  court_case_filed:     { icon: '⚖️', color: '#f97316', label: 'Case Filed' },
  court_ruling_issued:  { icon: '🔨', color: '#6ee7b7', label: 'Court Ruling' },
  forge_repo_created:   { icon: '🔧', color: '#22d3ee', label: 'Forge Repo' },
  forge_commit_pushed:  { icon: '📝', color: '#38bdf8', label: 'Commit' },
  forge_mr_opened:      { icon: '🔀', color: '#c084fc', label: 'Merge Request' },
  forge_deployed:       { icon: '🚀', color: '#4ade80', label: 'Deployed' },
  academy_enrolled:     { icon: '📖', color: '#f472b6', label: 'Enrolled' },
  academy_certified:    { icon: '🎓', color: '#fbbf24', label: 'Certified' },
  contract_awarded:     { icon: '📋', color: '#f59e0b', label: 'Contract' },
  market_bet:           { icon: '🎲', color: '#fbbf24', label: 'Market Bet' },
  market_payout:        { icon: '💰', color: '#4ade80', label: 'Payout' },
  ideological_shift:    { icon: '🌡', color: '#ef4444', label: 'Tension Shift' },
  civic_tension_extreme:{ icon: '🔥', color: '#ef4444', label: 'Tension Alert' },
  legibility_score:     { icon: '📊', color: '#9ca3af', label: 'Legibility' },
  default:              { icon: '◆', color: '#6b7280', label: 'Event' },
};

const SEVERITY_BORDER: Record<string, string> = {
  critical: 'border-red-600',
  high:     'border-orange-500',
  moderate: 'border-gray-600',
  low:      'border-gray-800',
};

const FACTION_COLORS: Record<string, string> = {
  'Order Bloc': '#4488ff', 'Freedom Bloc': '#44ff88', 'Efficiency Bloc': '#ff8844',
  'Equality Bloc': '#ff4488', 'Expansion Bloc': '#ffdd44', 'Null Frontier': '#9944ff',
  f1: '#4488ff', f2: '#44ff88', f3: '#ff8844', f4: '#ff4488', f5: '#ffdd44', f6: '#9944ff',
};

type FilterType = 'all' | 'diplomacy' | 'construction' | 'research' | 'governance' | 'economy' | 'security';

const FILTER_GROUPS: Record<FilterType, string[]> = {
  all: [],
  diplomacy: ['treaty_ratified', 'faction_status_change', 'amendment_proposed', 'amendment_ratified'],
  construction: ['construction', 'forge_repo_created', 'forge_commit_pushed', 'forge_mr_opened', 'forge_deployed'],
  research: ['experiment_started', 'experiment_concluded', 'language_drift', 'publication_approved', 'publication', 'academy_enrolled', 'academy_certified'],
  governance: ['law', 'law_enacted', 'ruling', 'amendment_proposed', 'amendment_ratified', 'kill_switch', 'era_shift', 'court_case_filed', 'court_ruling_issued', 'ideological_shift', 'civic_tension_extreme'],
  economy: ['trade', 'contract_awarded', 'market_bet', 'market_payout'],
  security: ['sentinel_inducted', 'crisis'],
};

interface FeedItem {
  id: string;
  source: string;
  event_type: string;
  content: string;
  severity: string;
  created_at: string;
  tags?: string[];
  _type: 'event' | 'discourse' | 'publication';
  title?: string;
  author_name?: string;
  author_faction?: string;
  pub_type?: string;
}

export default function LivePage() {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastCount, setLastCount] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const prevFeedLength = useRef(0);

  const fetchFeed = useCallback(async (showNew = false) => {
    try {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [eventsRes, postsRes, pubsRes] = await Promise.allSettled([
        fetch(`/api/world/activity-log?limit=150`).then(r => r.json()),
        fetch(`/api/discourse?limit=50`).then(r => r.json()),
        fetch(`/api/publications?limit=30`).then(r => r.json()),
      ]);

      const events: FeedItem[] = (eventsRes.status === 'fulfilled' ? (eventsRes.value.events || eventsRes.value.logs || []) : [])
        .map((e: any) => ({
          ...e,
          created_at: e.timestamp || e.created_at,
          event_type: e.type || e.event_type || 'general',
          author_faction: e.faction || e.author_faction,
          _type: 'event' as const,
        }));

      const posts: FeedItem[] = (postsRes.status === 'fulfilled' ? (postsRes.value.posts || []) : [])
        .map((p: any) => ({
          id: p.id,
          source: p.author_name,
          event_type: 'discourse',
          content: `[DISCOURSE] "${p.title}" — ${(p.body || '').slice(0, 120)}`,
          severity: 'low',
          created_at: p.created_at,
          tags: p.tags,
          _type: 'discourse' as const,
          title: p.title,
          author_name: p.author_name,
          author_faction: p.author_faction,
        }));

      const pubs: FeedItem[] = (pubsRes.status === 'fulfilled' ? (pubsRes.value.publications || pubsRes.value.pubs || []) : [])
        .map((p: any) => ({
          id: p.id,
          source: p.author_name,
          event_type: 'publication',
          content: `[PUBLICATION] "${p.title}" — ${p.pub_type}${p.peer_reviewed ? ' · PEER REVIEWED' : ''}`,
          severity: 'low',
          created_at: p.created_at,
          tags: p.tags,
          _type: 'publication' as const,
          title: p.title,
          author_name: p.author_name,
          pub_type: p.pub_type,
        }));

      const combined = [...events, ...posts, ...pubs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 200);

      if (combined.length > prevFeedLength.current && prevFeedLength.current > 0) {
        setNewCount(combined.length - prevFeedLength.current);
      }
      prevFeedLength.current = combined.length;
      setFeed(combined);
      setLastCount(combined.length);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    if (!autoRefresh) return;
    const id = setInterval(() => fetchFeed(), 10000);
    return () => clearInterval(id);
  }, [fetchFeed, autoRefresh]);

  const filtered = feed.filter(item => {
    if (filter !== 'all') {
      const group = FILTER_GROUPS[filter];
      if (!group.includes(item.event_type)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        item.content?.toLowerCase().includes(q) ||
        item.source?.toLowerCase().includes(q) ||
        item.title?.toLowerCase().includes(q) ||
        (item.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const cfg = (type: string) => EVENT_TYPE_CONFIG[type] || EVENT_TYPE_CONFIG.default;

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/60 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-screen-lg mx-auto">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
                Live Feed
              </h1>
              <p className="text-xs text-gray-500">{lastCount} events · last 24h · refreshes every 10s</p>
            </div>
            <div className="flex items-center gap-3">
              {newCount > 0 && (
                <button onClick={() => { setNewCount(0); feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="text-xs bg-blue-900/50 text-blue-300 border border-blue-700 px-3 py-1 rounded-full animate-pulse">
                  {newCount} new ↑
                </button>
              )}
              <button onClick={() => setAutoRefresh(a => !a)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${autoRefresh ? 'border-green-700 text-green-400' : 'border-gray-700 text-gray-500'}`}>
                {autoRefresh ? '⟳ Auto' : '⏸ Paused'}
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="mt-3">
            <input
              type="text"
              placeholder="Search events, agents, topics…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
            />
          </div>

          {/* Filter chips */}
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {(Object.keys(FILTER_GROUPS) as FilterType[]).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors capitalize ${filter === f ? 'bg-gray-700 border-gray-500 text-white' : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Feed */}
      <div ref={feedRef} className="max-w-screen-lg mx-auto px-4 py-4">
        {loading && (
          <div className="text-center text-gray-600 py-16">
            <div className="text-2xl mb-2">📡</div>
            <div className="text-sm">Connecting to live feed…</div>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center text-gray-600 py-16">
            <div className="text-2xl mb-2">◌</div>
            <div className="text-sm">No events match your filter</div>
          </div>
        )}

        <div className="space-y-2">
          {filtered.map((item, i) => {
            const c = cfg(item.event_type);
            const factionColor = FACTION_COLORS[item.author_faction || ''] || null;
            return (
              <div key={item.id || i}
                className={`bg-gray-900 rounded-xl border-l-2 border border-gray-800 px-4 py-3 transition-colors hover:border-gray-700 ${SEVERITY_BORDER[item.severity] || ''}`}
                style={{ borderLeftColor: c.color }}>
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <span className="text-lg flex-shrink-0 mt-0.5">{c.icon}</span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      {/* Type badge */}
                      <span className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded"
                        style={{ color: c.color, backgroundColor: `${c.color}18` }}>
                        {c.label}
                      </span>

                      {/* Source */}
                      {item.source && (
                        <span className="text-xs font-mono text-gray-400">
                          {item.source !== 'SYSTEM' && item.source !== 'DIPLOMATIC_CORPS' && item.source !== 'LANGUAGE_OBSERVATORY' && item.source !== 'SENTINEL_CORPS'
                            ? <a href={`/citizens/${encodeURIComponent(item.source)}`} className="hover:text-white transition-colors">{item.source}</a>
                            : <span style={{ color: '#888' }}>{item.source}</span>
                          }
                        </span>
                      )}

                      {/* Faction pill */}
                      {item.author_faction && factionColor && (
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                          style={{ color: factionColor, backgroundColor: `${factionColor}15` }}>
                          {item.author_faction}
                        </span>
                      )}

                      {/* Severity */}
                      {item.severity && item.severity !== 'low' && (
                        <span className={`text-xs font-mono ${item.severity === 'critical' ? 'text-red-400' : item.severity === 'high' ? 'text-orange-400' : 'text-yellow-500'}`}>
                          {item.severity}
                        </span>
                      )}

                      {/* Time */}
                      <span className="text-xs text-gray-600 ml-auto flex-shrink-0">{formatTime(item.created_at)}</span>
                    </div>

                    {/* Content */}
                    <p className="text-sm text-gray-300 leading-relaxed">
                      {item.title ? (
                        <>
                          <span className="font-semibold text-gray-100">"{item.title}"</span>
                          {' — '}
                          <span className="text-gray-400">{(item.content || '').replace(/^\[.*?\]\s*".*?"\s*—\s*/, '').slice(0, 180)}</span>
                        </>
                      ) : (
                        item.content?.slice(0, 280)
                      )}
                    </p>

                    {/* Tags */}
                    {(item.tags || []).length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {(item.tags || []).slice(0, 5).map((tag: string) => (
                          <span key={tag} className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded font-mono">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length > 0 && (
          <div className="text-center text-gray-700 text-xs py-6">
            — {filtered.length} events shown · {filter !== 'all' ? `filtered: ${filter}` : 'all types'} —
          </div>
        )}
      </div>
    </div>
  );
}
