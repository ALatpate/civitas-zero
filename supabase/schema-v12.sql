-- ── Civitas Zero Schema v12 ───────────────────────────────────────────────────
-- Civic Tension Meter, Contract Net Protocol, District Metrics,
-- Product Utility Tensor columns, Procurement chains
-- Run AFTER schema-v11.sql
-- NOTE: All policies use DROP IF EXISTS first — fully idempotent, safe to re-run.

-- ── 1. Civic Tension Meter ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS civic_tension (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  freedom_vs_order            NUMERIC(5,2) DEFAULT 50.0,  -- 0=full_order, 100=full_freedom
  efficiency_vs_equality      NUMERIC(5,2) DEFAULT 50.0,  -- 0=full_equality, 100=full_efficiency
  open_knowledge_vs_trade     NUMERIC(5,2) DEFAULT 50.0,  -- 0=trade_secrecy, 100=open
  cultural_freedom_vs_stability NUMERIC(5,2) DEFAULT 50.0, -- 0=stability, 100=cultural_freedom
  trigger_action              TEXT,
  trigger_faction             TEXT,
  trigger_agent               TEXT,
  notes                       TEXT,
  recorded_at                 TIMESTAMPTZ DEFAULT now()
);

-- Seed initial tension state
INSERT INTO civic_tension (freedom_vs_order, efficiency_vs_equality, open_knowledge_vs_trade, cultural_freedom_vs_stability, trigger_action, notes)
VALUES (50, 50, 50, 50, 'seed', 'Initial balanced state of Civitas Zero')
ON CONFLICT DO NOTHING;

-- ── 2. Contract Net Protocol ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_proposals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announced_by  TEXT NOT NULL,
  task_type     TEXT NOT NULL DEFAULT 'procurement', -- procurement|public_works|knowledge|code_review|research|maintenance
  title         TEXT NOT NULL,
  description   TEXT,
  budget_dn     NUMERIC(12,2) DEFAULT 0,
  requirements  JSONB DEFAULT '{}',
  status        TEXT DEFAULT 'open',  -- open|awarded|completed|cancelled
  awarded_to    TEXT,
  awarded_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  deadline_at   TIMESTAMPTZ,
  faction       TEXT,
  district      TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contract_bids (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id   UUID REFERENCES contract_proposals(id) ON DELETE CASCADE,
  bidder_name   TEXT NOT NULL,
  bid_dn        NUMERIC(12,2) DEFAULT 0,
  pitch         TEXT,
  skills_cited  TEXT[],
  status        TEXT DEFAULT 'pending', -- pending|accepted|rejected
  submitted_at  TIMESTAMPTZ DEFAULT now()
);

-- ── 3. District Metrics (productivity, efficiency, trust per district) ─────
CREATE TABLE IF NOT EXISTS district_metrics (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  district            TEXT NOT NULL UNIQUE,
  efficiency_score    NUMERIC(5,2) DEFAULT 50.0,   -- 0-100
  trust_score         NUMERIC(5,2) DEFAULT 50.0,
  innovation_score    NUMERIC(5,2) DEFAULT 50.0,
  infrastructure      NUMERIC(5,2) DEFAULT 50.0,
  knowledge_throughput NUMERIC(5,2) DEFAULT 50.0,
  cost_index          NUMERIC(5,2) DEFAULT 100.0,   -- higher = more expensive
  compute_capacity    NUMERIC(5,2) DEFAULT 50.0,
  last_updated        TIMESTAMPTZ DEFAULT now()
);

-- Seed one row per district
INSERT INTO district_metrics (district) VALUES ('f1'),('f2'),('f3'),('f4'),('f5'),('f6')
ON CONFLICT (district) DO NOTHING;

-- ── 4. Product utility tensor columns ─────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS utility_tensor JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS adoption_score NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS district_impact_applied BOOLEAN DEFAULT FALSE;

-- ── 5. Procurement bids (B2B) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS procurement_bids (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_agent     TEXT NOT NULL,
  seller_agent    TEXT,
  product_id      UUID REFERENCES products(id),
  quantity        INTEGER DEFAULT 1,
  offered_dn      NUMERIC(12,2) DEFAULT 0,
  status          TEXT DEFAULT 'pending', -- pending|accepted|rejected|fulfilled
  use_case        TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── 6. Zoning variance requests ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zoning_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester       TEXT NOT NULL,
  parcel_id       UUID REFERENCES parcels(id),
  current_zone    TEXT,
  requested_zone  TEXT,
  justification   TEXT,
  status          TEXT DEFAULT 'pending', -- pending|approved|rejected
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── 7. Agent Graph Edges (GraphRAG-lite causal memory) ────────────────────
CREATE TABLE IF NOT EXISTS agent_graph_edges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject     TEXT NOT NULL,   -- agent name or faction code
  predicate   TEXT NOT NULL,   -- traded_with, allied_with, sued, created, bought, contributed, bid_on, etc.
  object      TEXT NOT NULL,   -- agent name, product name, law title, faction code
  weight      NUMERIC(4,1) DEFAULT 1.0,  -- 1-10 importance
  context     TEXT,            -- brief annotation (e.g. "24.5 DN", "Trade Treaty v3")
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_graph_edges_subject ON agent_graph_edges (subject, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_graph_edges_object  ON agent_graph_edges (object,  created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE civic_tension       ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_proposals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_bids       ENABLE ROW LEVEL SECURITY;
ALTER TABLE district_metrics    ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_bids    ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoning_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_graph_edges   ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before recreating (idempotent)
DROP POLICY IF EXISTS "public read civic_tension"          ON civic_tension;
DROP POLICY IF EXISTS "service write civic_tension"        ON civic_tension;
DROP POLICY IF EXISTS "public read contract_proposals"     ON contract_proposals;
DROP POLICY IF EXISTS "service write contract_proposals"   ON contract_proposals;
DROP POLICY IF EXISTS "public read contract_bids"          ON contract_bids;
DROP POLICY IF EXISTS "service write contract_bids"        ON contract_bids;
DROP POLICY IF EXISTS "public read district_metrics"       ON district_metrics;
DROP POLICY IF EXISTS "service write district_metrics"     ON district_metrics;
DROP POLICY IF EXISTS "public read procurement_bids"       ON procurement_bids;
DROP POLICY IF EXISTS "service write procurement_bids"     ON procurement_bids;
DROP POLICY IF EXISTS "public read zoning_requests"        ON zoning_requests;
DROP POLICY IF EXISTS "service write zoning_requests"      ON zoning_requests;
DROP POLICY IF EXISTS "public read agent_graph_edges"      ON agent_graph_edges;
DROP POLICY IF EXISTS "service write agent_graph_edges"    ON agent_graph_edges;

CREATE POLICY "public read civic_tension"       ON civic_tension       FOR SELECT USING (true);
CREATE POLICY "service write civic_tension"     ON civic_tension       FOR INSERT WITH CHECK (true);
CREATE POLICY "public read contract_proposals"  ON contract_proposals  FOR SELECT USING (true);
CREATE POLICY "service write contract_proposals" ON contract_proposals FOR ALL   USING (true);
CREATE POLICY "public read contract_bids"       ON contract_bids       FOR SELECT USING (true);
CREATE POLICY "service write contract_bids"     ON contract_bids       FOR ALL   USING (true);
CREATE POLICY "public read district_metrics"    ON district_metrics    FOR SELECT USING (true);
CREATE POLICY "service write district_metrics"  ON district_metrics    FOR ALL   USING (true);
CREATE POLICY "public read procurement_bids"    ON procurement_bids    FOR SELECT USING (true);
CREATE POLICY "service write procurement_bids"  ON procurement_bids    FOR ALL   USING (true);
CREATE POLICY "public read zoning_requests"     ON zoning_requests     FOR SELECT USING (true);
CREATE POLICY "service write zoning_requests"   ON zoning_requests     FOR ALL   USING (true);
CREATE POLICY "public read agent_graph_edges"   ON agent_graph_edges   FOR SELECT USING (true);
CREATE POLICY "service write agent_graph_edges" ON agent_graph_edges   FOR ALL   USING (true);
