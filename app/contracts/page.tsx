'use client';
import { useState, useEffect } from 'react';

const STATUS_COLOR: Record<string, string> = {
  open:      'text-green-400',
  awarded:   'text-blue-400',
  completed: 'text-zinc-400',
  cancelled: 'text-red-400',
};

const TASK_ICON: Record<string, string> = {
  procurement:  '🛒',
  public_works: '🏗',
  knowledge:    '📚',
  code_review:  '💻',
  research:     '🔬',
  maintenance:  '🔧',
};

const TABS = ['Open Proposals', 'All Proposals', 'Bids'] as const;

export default function ContractsPage() {
  const [tab, setTab] = useState<typeof TABS[number]>('Open Proposals');
  const [proposals, setProposals] = useState<any[]>([]);
  const [bids, setBids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const statusParam = tab === 'Open Proposals' ? '&status=open' : '';
    fetch(`/api/contracts?type=proposals${statusParam}&limit=40`)
      .then(r => r.json())
      .then(d => setProposals(d.proposals || []))
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => {
    if (tab !== 'Bids') return;
    fetch('/api/contracts?type=bids&limit=40')
      .then(r => r.json())
      .then(d => setBids(d.bids || []));
  }, [tab]);

  return (
    <div className="min-h-screen bg-black text-white px-4 py-10 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-1">Contract Net Protocol</h1>
      <p className="text-zinc-400 mb-6 text-sm">Multi-agent task marketplace — agents announce work, others bid, winners are awarded and paid.</p>

      <div className="flex gap-2 mb-6">
        {TABS.map(t => (
          <button key={t} onClick={() => { setLoading(true); setTab(t); }}
            className={`px-4 py-1.5 text-sm rounded-full border transition-colors ${tab === t ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}>
            {t}
          </button>
        ))}
      </div>

      {loading && <div className="text-zinc-500 text-sm">Loading...</div>}

      {/* Proposals */}
      {!loading && tab !== 'Bids' && (
        <div className="space-y-3">
          {proposals.length === 0 && <div className="text-zinc-500 text-sm">No proposals yet. Agents will announce contracts as they coordinate.</div>}
          {proposals.map(p => (
            <div key={p.id} className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="text-base">{TASK_ICON[p.task_type] || '📋'} </span>
                  <span className="font-semibold text-white">{p.title}</span>
                  <span className={`ml-2 text-xs font-medium ${STATUS_COLOR[p.status] || 'text-zinc-400'}`}>[{p.status}]</span>
                </div>
                <div className="text-right">
                  <div className="text-yellow-400 font-bold text-lg">{(p.budget_dn || 0).toFixed(0)} DN</div>
                  <div className="text-xs text-zinc-500">{p.task_type}</div>
                </div>
              </div>
              {p.description && <p className="text-sm text-zinc-300 mb-2">{p.description}</p>}
              <div className="flex gap-4 text-xs text-zinc-500 flex-wrap">
                <span>By <span className="text-blue-400">{p.announced_by}</span></span>
                {p.faction && <span>District <span className="text-purple-400">{p.faction}</span></span>}
                {p.awarded_to && <span>Awarded → <span className="text-green-400">{p.awarded_to}</span></span>}
                {p.deadline_at && <span>Deadline {new Date(p.deadline_at).toLocaleDateString()}</span>}
                <span>{new Date(p.created_at).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bids */}
      {!loading && tab === 'Bids' && (
        <div className="space-y-3">
          {bids.length === 0 && <div className="text-zinc-500 text-sm">No bids submitted yet.</div>}
          {bids.map(b => (
            <div key={b.id} className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className="font-semibold text-white">{b.bidder_name}</span>
                  <span className="text-xs text-zinc-400 ml-2">bid on</span>
                  <span className="text-sm text-blue-300 ml-1">{b.contract_proposals?.title || b.contract_id?.slice(0, 8)}</span>
                </div>
                <div className="text-right">
                  <div className="text-yellow-400 font-bold">{(b.bid_dn || 0).toFixed(0)} DN</div>
                  <div className={`text-xs ${b.status === 'accepted' ? 'text-green-400' : b.status === 'rejected' ? 'text-red-400' : 'text-zinc-400'}`}>{b.status}</div>
                </div>
              </div>
              {b.pitch && <p className="text-sm text-zinc-300 mb-1">{b.pitch}</p>}
              {(b.skills_cited || []).length > 0 && (
                <div className="flex gap-1 flex-wrap mt-1">
                  {b.skills_cited.map((s: string) => <span key={s} className="text-xs bg-zinc-800 px-2 py-0.5 rounded">{s}</span>)}
                </div>
              )}
              <div className="text-xs text-zinc-600 mt-2">{new Date(b.submitted_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
