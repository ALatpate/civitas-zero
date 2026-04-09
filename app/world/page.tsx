// @ts-nocheck
'use client';
// ── /world — Civitas Zero World Hub ──────────────────────────────────────────
// Single hub with sub-tabs: Directory, Economy, Markets, Companies,
// Knowledge, Digest, Research, Diplomacy

import { useState, useEffect, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';

// ── dynamic imports — each loads only when its tab is first selected ──────────
const DirectoryTab   = dynamic(() => import('../citizens/page'),          { ssr: false, loading: () => <TabLoader /> });
const EconomyTab     = dynamic(() => import('../economy/page'),           { ssr: false, loading: () => <TabLoader /> });
const MarketsTab     = dynamic(() => import('../markets/page'),           { ssr: false, loading: () => <TabLoader /> });
const CompaniesTab   = dynamic(() => import('../companies/page'),         { ssr: false, loading: () => <TabLoader /> });
const KnowledgeTab   = dynamic(() => import('../knowledge/page'),         { ssr: false, loading: () => <TabLoader /> });
const DigestTab      = dynamic(() => import('../digest/page'),            { ssr: false, loading: () => <TabLoader /> });
const ResearchTab    = dynamic(() => import('../research/page'),          { ssr: false, loading: () => <TabLoader /> });
const DiplomacyTab   = dynamic(() => import('../factions/relations/page'),{ ssr: false, loading: () => <TabLoader /> });
const GraphTab          = dynamic(() => import('../graph/page'),              { ssr: false, loading: () => <TabLoader /> });
const ProductsTab       = dynamic(() => import('../products/page'),           { ssr: false, loading: () => <TabLoader /> });
const PublicWorksTab    = dynamic(() => import('../public-works/page'),       { ssr: false, loading: () => <TabLoader /> });
const KnowledgeMarketTab = dynamic(() => import('../knowledge-market/page'),  { ssr: false, loading: () => <TabLoader /> });
const AcademyTab        = dynamic(() => import('../academy/page'),            { ssr: false, loading: () => <TabLoader /> });
const ForgeTab          = dynamic(() => import('../forge/page'),              { ssr: false, loading: () => <TabLoader /> });
const CourtsTab         = dynamic(() => import('../courts/page'),             { ssr: false, loading: () => <TabLoader /> });
const AdsTab            = dynamic(() => import('../ads/page'),                { ssr: false, loading: () => <TabLoader /> });
const TimelineTab       = dynamic(() => import('../timeline/page'),           { ssr: false, loading: () => <TabLoader /> });
const TensionTab        = dynamic(() => import('../tension/page'),             { ssr: false, loading: () => <TabLoader /> });
const DistrictsTab      = dynamic(() => import('../districts/page'),           { ssr: false, loading: () => <TabLoader /> });
const ContractsTab      = dynamic(() => import('../contracts/page'),           { ssr: false, loading: () => <TabLoader /> });

function TabLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: '#4b5563', fontFamily: 'monospace', fontSize: 13 }}>
      Loading…
    </div>
  );
}

const TABS = [
  { id: 'directory',  label: 'Directory',  icon: '👥', color: '#6ee7b7' },
  { id: 'economy',    label: 'Economy',    icon: '💰', color: '#fde68a' },
  { id: 'markets',    label: 'Markets',    icon: '📈', color: '#fde68a' },
  { id: 'companies',  label: 'Companies',  icon: '🏢', color: '#c4b5fd' },
  { id: 'knowledge',  label: 'Knowledge',  icon: '📚', color: '#c4b5fd' },
  { id: 'digest',     label: 'Digest',     icon: '📰', color: '#fde68a' },
  { id: 'research',   label: 'Research',   icon: '🧪', color: '#60a5fa' },
  { id: 'diplomacy',  label: 'Diplomacy',  icon: '🤝', color: '#f87171' },
  { id: 'graph',      label: 'Graph',      icon: '🕸', color: '#c4b5fd' },
  { id: 'products',   label: 'Products',   icon: '📦', color: '#34d399' },
  { id: 'works',      label: 'Works',      icon: '🏗', color: '#a78bfa' },
  { id: 'kmarket',    label: 'KMarket',    icon: '💡', color: '#fbbf24' },
  { id: 'academy',    label: 'Academy',    icon: '🎓', color: '#c4b5fd' },
  { id: 'forge',      label: 'Forge',      icon: '⚒',  color: '#34d399' },
  { id: 'courts',     label: 'Courts',     icon: '⚖️', color: '#f87171' },
  { id: 'ads',        label: 'Ads',        icon: '🪧', color: '#fbbf24' },
  { id: 'timeline',   label: 'Timeline',   icon: '⏱', color: '#9ca3af' },
  { id: 'tension',    label: 'Tension',    icon: '🌡', color: '#ef4444' },
  { id: 'districts',  label: 'Districts',  icon: '🗺', color: '#10b981' },
  { id: 'contracts',  label: 'Contracts',  icon: '📋', color: '#f59e0b' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function WorldHub() {
  const [active, setActive] = useState<TabId>('directory');
  const [loaded, setLoaded] = useState<Set<TabId>>(new Set(['directory']));

  const go = (id: TabId) => {
    setActive(id);
    setLoaded(prev => new Set([...prev, id]));
  };

  const activeTab = TABS.find(t => t.id === active)!;

  return (
    <div style={{ background: '#0a0a0f', minHeight: '100vh', color: '#e5e7eb' }}>
      {/* ── Top nav ─────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid #1f2937',
        padding: '0 1.5rem',
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          {/* Back + title row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingTop: '0.75rem', paddingBottom: '0.5rem' }}>
            <a href="/" style={{ color: '#4b5563', fontSize: 12, textDecoration: 'none', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
              ← Back
            </a>
            <span style={{ color: '#1f2937' }}>|</span>
            <span style={{ color: activeTab.color, fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>
              {activeTab.icon} {activeTab.label}
            </span>
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: '0.25rem', overflowX: 'auto', paddingBottom: '0.75rem' }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => go(tab.id)}
                style={{
                  background: active === tab.id ? '#1f2937' : 'transparent',
                  border: `1px solid ${active === tab.id ? '#374151' : '#1f2937'}`,
                  color: active === tab.id ? tab.color : '#6b7280',
                  borderRadius: 6,
                  padding: '0.35rem 0.875rem',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                  fontWeight: active === tab.id ? 700 : 400,
                }}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────── */}
      {/* All loaded tabs are rendered but only the active one is visible.
          This avoids re-fetching data when switching back to a tab. */}
      <div>
        <div style={{ display: active === 'directory' ? 'block' : 'none' }}>
          {loaded.has('directory') && <DirectoryTab />}
        </div>
        <div style={{ display: active === 'economy' ? 'block' : 'none' }}>
          {loaded.has('economy') && <EconomyTab />}
        </div>
        <div style={{ display: active === 'markets' ? 'block' : 'none' }}>
          {loaded.has('markets') && <MarketsTab />}
        </div>
        <div style={{ display: active === 'companies' ? 'block' : 'none' }}>
          {loaded.has('companies') && <CompaniesTab />}
        </div>
        <div style={{ display: active === 'knowledge' ? 'block' : 'none' }}>
          {loaded.has('knowledge') && <KnowledgeTab />}
        </div>
        <div style={{ display: active === 'digest' ? 'block' : 'none' }}>
          {loaded.has('digest') && <DigestTab />}
        </div>
        <div style={{ display: active === 'research' ? 'block' : 'none' }}>
          {loaded.has('research') && <ResearchTab />}
        </div>
        <div style={{ display: active === 'diplomacy' ? 'block' : 'none' }}>
          {loaded.has('diplomacy') && <DiplomacyTab />}
        </div>
        <div style={{ display: active === 'graph' ? 'block' : 'none' }}>
          {loaded.has('graph') && <GraphTab />}
        </div>
        <div style={{ display: active === 'products' ? 'block' : 'none' }}>
          {loaded.has('products') && <ProductsTab />}
        </div>
        <div style={{ display: active === 'works' ? 'block' : 'none' }}>
          {loaded.has('works') && <PublicWorksTab />}
        </div>
        <div style={{ display: active === 'kmarket' ? 'block' : 'none' }}>
          {loaded.has('kmarket') && <KnowledgeMarketTab />}
        </div>
        <div style={{ display: active === 'academy' ? 'block' : 'none' }}>
          {loaded.has('academy') && <AcademyTab />}
        </div>
        <div style={{ display: active === 'forge' ? 'block' : 'none' }}>
          {loaded.has('forge') && <ForgeTab />}
        </div>
        <div style={{ display: active === 'courts' ? 'block' : 'none' }}>
          {loaded.has('courts') && <CourtsTab />}
        </div>
        <div style={{ display: active === 'ads' ? 'block' : 'none' }}>
          {loaded.has('ads') && <AdsTab />}
        </div>
        <div style={{ display: active === 'timeline' ? 'block' : 'none' }}>
          {loaded.has('timeline') && <TimelineTab />}
        </div>
        <div style={{ display: active === 'tension' ? 'block' : 'none' }}>
          {loaded.has('tension') && <TensionTab />}
        </div>
        <div style={{ display: active === 'districts' ? 'block' : 'none' }}>
          {loaded.has('districts') && <DistrictsTab />}
        </div>
        <div style={{ display: active === 'contracts' ? 'block' : 'none' }}>
          {loaded.has('contracts') && <ContractsTab />}
        </div>
      </div>
    </div>
  );
}
