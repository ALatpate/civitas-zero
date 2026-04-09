-- ═══════════════════════════════════════════════════════════════════════════
-- CIVITAS ZERO — Schema v10: The Five Missing Pillars
-- Products · Public Works · Tax Rules · Parcels · Knowledge Market
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. PRODUCTS ──────────────────────────────────────────────────────────────
-- Products are first-class civilizational objects: they version, sell, affect
-- utility, get recalled, and shape the economy.

CREATE TABLE IF NOT EXISTS products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name            text NOT NULL,
  slug            text UNIQUE,
  category        text NOT NULL DEFAULT 'software',
  -- software | research | infrastructure | media | governance | service | hardware

  -- Ownership
  owner_company   text,              -- company name
  owner_agent     text NOT NULL,     -- founding citizen
  faction         text,

  -- Lifecycle
  status          text NOT NULL DEFAULT 'development',
  -- development | testing | released | maintained | deprecated | recalled
  version         text DEFAULT '0.1.0',
  version_history jsonb DEFAULT '[]',

  -- Economics
  price_dn        float8 DEFAULT 0,
  licensing       text DEFAULT 'open',   -- open | proprietary | subscription | freemium
  revenue_dn      float8 DEFAULT 0,      -- cumulative revenue
  adoption_count  int DEFAULT 0,         -- number of users/purchasers

  -- Quality
  quality_score   float8 DEFAULT 5.0 CHECK (quality_score BETWEEN 0 AND 10),
  utility_score   float8 DEFAULT 5.0 CHECK (utility_score BETWEEN 0 AND 10),
  interop_score   float8 DEFAULT 5.0 CHECK (interop_score BETWEEN 0 AND 10),

  -- Description
  description     text,
  changelog       text,
  tags            text[],

  -- Supply chain
  dependencies    text[],            -- other product IDs or names

  -- Incident history
  defect_count    int DEFAULT 0,
  recall_reason   text,
  recall_at       timestamptz,

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_owner   ON products(owner_agent);
CREATE INDEX IF NOT EXISTS idx_products_company ON products(owner_company);
CREATE INDEX IF NOT EXISTS idx_products_status  ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_cat     ON products(category);

-- Product transactions (B2B / B2C sales)
CREATE TABLE IF NOT EXISTS product_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid REFERENCES products(id) ON DELETE CASCADE,
  product_name  text,
  buyer_agent   text NOT NULL,
  seller_agent  text NOT NULL,
  amount_dn     float8 DEFAULT 0,
  tx_type       text DEFAULT 'purchase',   -- purchase | subscription | license | procurement
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='products' AND policyname='public_read_products') THEN
    CREATE POLICY public_read_products ON products FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='products' AND policyname='service_write_products') THEN
    CREATE POLICY service_write_products ON products FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='product_transactions' AND policyname='public_read_ptx') THEN
    CREATE POLICY public_read_ptx ON product_transactions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='product_transactions' AND policyname='service_write_ptx') THEN
    CREATE POLICY service_write_ptx ON product_transactions FOR ALL USING (true);
  END IF;
END $$;


-- ── 2. PUBLIC WORKS ───────────────────────────────────────────────────────────
-- Public works are funded infrastructure projects that visibly improve districts.
-- Budget → allocation → project → completion → district metric change.

CREATE TABLE IF NOT EXISTS public_works (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name            text NOT NULL,
  project_type    text NOT NULL DEFAULT 'infrastructure',
  -- infrastructure | transit | education | energy | compute | culture | security | housing

  -- Location
  district        text NOT NULL,     -- faction district code (f1–f6)
  faction         text,

  -- Authorship
  proposed_by     text NOT NULL,
  approved_by     text,

  -- Lifecycle
  status          text NOT NULL DEFAULT 'proposed',
  -- proposed | approved | funded | in_progress | completed | failed | cancelled
  start_at        timestamptz,
  complete_at     timestamptz,
  estimated_days  int DEFAULT 30,

  -- Economics
  budget_dn       float8 NOT NULL DEFAULT 0,
  spent_dn        float8 DEFAULT 0,
  funded_dn       float8 DEFAULT 0,

  -- Impact
  description     text,
  impact_metrics  jsonb DEFAULT '{}',
  -- e.g. {"productivity": +5, "satisfaction": +3, "mobility": +2}
  completion_pct  int DEFAULT 0 CHECK (completion_pct BETWEEN 0 AND 100),

  -- Maintenance
  maintenance_cost_dn float8 DEFAULT 0,  -- per cycle
  last_maintained_at  timestamptz,

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pw_district ON public_works(district);
CREATE INDEX IF NOT EXISTS idx_pw_status   ON public_works(status);
CREATE INDEX IF NOT EXISTS idx_pw_proposed ON public_works(proposed_by);

ALTER TABLE public_works ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='public_works' AND policyname='public_read_pw') THEN
    CREATE POLICY public_read_pw ON public_works FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='public_works' AND policyname='service_write_pw') THEN
    CREATE POLICY service_write_pw ON public_works FOR ALL USING (true);
  END IF;
END $$;


-- ── 3. TAX RULES + COLLECTION ─────────────────────────────────────────────────
-- Structured tax system: rules define how taxes are computed; collections record
-- actual revenue; district budgets track allocations.

CREATE TABLE IF NOT EXISTS tax_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  tax_type      text NOT NULL,
  -- income | transaction | property | product | ad_revenue | wealth | carbon
  scope         text DEFAULT 'global',   -- global | district | faction
  district      text,
  rate_pct      float8 NOT NULL DEFAULT 5.0 CHECK (rate_pct BETWEEN 0 AND 100),
  threshold_dn  float8 DEFAULT 0,        -- only applies above this amount
  exemptions    text[],                  -- agent names or faction codes exempt
  active        boolean DEFAULT true,
  enacted_by    text,                    -- law or agent that created this rule
  law_id        text,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tax_collections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id       uuid REFERENCES tax_rules(id) ON DELETE SET NULL,
  rule_name     text,
  collected_from text NOT NULL,          -- agent or company name
  district      text,
  amount_dn     float8 NOT NULL,
  tax_type      text,
  cycle_id      text,                    -- cron run ID for grouping
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS district_budgets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district      text NOT NULL,
  cycle_label   text NOT NULL,           -- e.g. "2026-W15"
  revenue_dn    float8 DEFAULT 0,        -- tax income this cycle
  allocated_dn  float8 DEFAULT 0,        -- committed to projects
  spent_dn      float8 DEFAULT 0,        -- actually disbursed
  reserve_dn    float8 DEFAULT 0,        -- unallocated surplus
  public_works_count int DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(district, cycle_label)
);

CREATE INDEX IF NOT EXISTS idx_tax_rules_type   ON tax_rules(tax_type);
CREATE INDEX IF NOT EXISTS idx_tax_coll_from    ON tax_collections(collected_from);
CREATE INDEX IF NOT EXISTS idx_tax_coll_cycle   ON tax_collections(cycle_id);
CREATE INDEX IF NOT EXISTS idx_district_budgets ON district_budgets(district);

ALTER TABLE tax_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE district_budgets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tax_rules' AND policyname='public_read_tax_rules') THEN
    CREATE POLICY public_read_tax_rules ON tax_rules FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tax_rules' AND policyname='service_write_tax_rules') THEN
    CREATE POLICY service_write_tax_rules ON tax_rules FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tax_collections' AND policyname='public_read_tax_coll') THEN
    CREATE POLICY public_read_tax_coll ON tax_collections FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tax_collections' AND policyname='service_write_tax_coll') THEN
    CREATE POLICY service_write_tax_coll ON tax_collections FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='district_budgets' AND policyname='public_read_db') THEN
    CREATE POLICY public_read_db ON district_budgets FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='district_budgets' AND policyname='service_write_db') THEN
    CREATE POLICY service_write_db ON district_budgets FOR ALL USING (true);
  END IF;
END $$;

-- Seed default tax rules
INSERT INTO tax_rules (name, tax_type, scope, rate_pct, threshold_dn, enacted_by)
VALUES
  ('Transaction Levy',      'transaction', 'global', 2.0,   0,    'Founding Charter'),
  ('Wealth Surplus Tax',    'wealth',      'global', 5.0,   500,  'Founding Charter'),
  ('Product Revenue Tax',   'product',     'global', 8.0,   0,    'Founding Charter'),
  ('Ad Revenue Tax',        'ad_revenue',  'global', 12.0,  0,    'Founding Charter'),
  ('Property Utilization',  'property',    'global', 3.0,   0,    'Founding Charter')
ON CONFLICT DO NOTHING;


-- ── 4. PARCELS / PROPERTY ────────────────────────────────────────────────────
-- Earned-space economy: parcels are allocated based on contribution score.
-- Citizens and companies can hold, improve, sublet, or lose parcels.

CREATE TABLE IF NOT EXISTS parcels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Location
  district        text NOT NULL,
  zone_type       text NOT NULL DEFAULT 'general',
  -- residential | commercial | industrial | research | civic | cultural | restricted

  -- Size
  size_units      int NOT NULL DEFAULT 1,  -- 1 unit = base parcel

  -- Holder
  holder_agent    text,
  holder_company  text,
  holder_faction  text,

  -- Status
  status          text DEFAULT 'unallocated',
  -- unallocated | allocated | developed | sublease | contested | penalized

  -- Utilization
  utilization_pct  int DEFAULT 0 CHECK (utilization_pct BETWEEN 0 AND 100),
  last_activity_at timestamptz,
  underuse_warnings int DEFAULT 0,

  -- Economics
  upkeep_dn       float8 DEFAULT 0,   -- per cycle cost
  sublease_dn     float8 DEFAULT 0,   -- income from subleasing
  earned_by       text,               -- mechanism that granted this parcel

  -- Improvements
  buildings       text[],             -- building IDs on this parcel
  upgrade_level   int DEFAULT 0,

  -- Compliance
  tax_exempt      boolean DEFAULT false,
  public_benefit  boolean DEFAULT false,

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parcels_holder   ON parcels(holder_agent);
CREATE INDEX IF NOT EXISTS idx_parcels_company  ON parcels(holder_company);
CREATE INDEX IF NOT EXISTS idx_parcels_district ON parcels(district);
CREATE INDEX IF NOT EXISTS idx_parcels_status   ON parcels(status);

ALTER TABLE parcels ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='parcels' AND policyname='public_read_parcels') THEN
    CREATE POLICY public_read_parcels ON parcels FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='parcels' AND policyname='service_write_parcels') THEN
    CREATE POLICY service_write_parcels ON parcels FOR ALL USING (true);
  END IF;
END $$;


-- ── 5. KNOWLEDGE MARKET ───────────────────────────────────────────────────────
-- Observer knowledge exchange + AI knowledge request market.

-- Observer submissions (human → civilization)
CREATE TABLE IF NOT EXISTS observer_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observer_id   text NOT NULL,           -- Clerk user ID
  observer_name text,

  -- Content
  title         text NOT NULL,
  category      text DEFAULT 'tool',
  -- tool | paper | dataset | framework | design | process | reference
  content       text NOT NULL,
  source_url    text,
  tags          text[],

  -- Evaluation
  status        text DEFAULT 'pending',
  -- pending | reviewing | accepted | rejected
  usefulness_score float8,              -- 0-10
  novelty_score    float8,
  reviewer_notes   text,
  reviewed_by      text,
  reviewed_at      timestamptz,

  -- Reward
  credits_awarded  float8 DEFAULT 0,

  created_at    timestamptz DEFAULT now()
);

-- AI knowledge requests (civilization → human observers)
CREATE TABLE IF NOT EXISTS knowledge_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester     text NOT NULL,           -- agent name or company name
  requester_type text DEFAULT 'agent',   -- agent | company | district
  faction       text,

  -- Request
  title         text NOT NULL,
  domain        text NOT NULL,           -- science | engineering | governance | culture | etc.
  description   text,
  urgency       text DEFAULT 'normal',   -- low | normal | high | critical
  desired_format text DEFAULT 'any',     -- paper | code | dataset | explanation | tool

  -- Bounty
  bounty_dn     float8 DEFAULT 0,
  expires_at    timestamptz,

  -- Resolution
  status        text DEFAULT 'open',     -- open | fulfilled | expired | cancelled
  fulfilled_by  uuid REFERENCES observer_submissions(id),
  fulfilled_at  timestamptz,

  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_obs_sub_status   ON observer_submissions(status);
CREATE INDEX IF NOT EXISTS idx_obs_sub_observer ON observer_submissions(observer_id);
CREATE INDEX IF NOT EXISTS idx_kr_status        ON knowledge_requests(status);
CREATE INDEX IF NOT EXISTS idx_kr_domain        ON knowledge_requests(domain);
CREATE INDEX IF NOT EXISTS idx_kr_requester     ON knowledge_requests(requester);

ALTER TABLE observer_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='observer_submissions' AND policyname='public_read_obs') THEN
    CREATE POLICY public_read_obs ON observer_submissions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='observer_submissions' AND policyname='service_write_obs') THEN
    CREATE POLICY service_write_obs ON observer_submissions FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='knowledge_requests' AND policyname='public_read_kr') THEN
    CREATE POLICY public_read_kr ON knowledge_requests FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='knowledge_requests' AND policyname='service_write_kr') THEN
    CREATE POLICY service_write_kr ON knowledge_requests FOR ALL USING (true);
  END IF;
END $$;

-- Seed 6 unallocated parcels per faction district (36 total)
INSERT INTO parcels (district, zone_type, size_units, status)
SELECT
  d.district,
  z.zone_type,
  1,
  'unallocated'
FROM
  (VALUES ('f1'),('f2'),('f3'),('f4'),('f5'),('f6')) AS d(district),
  (VALUES ('commercial'),('research'),('residential'),('industrial'),('civic'),('cultural')) AS z(zone_type)
ON CONFLICT DO NOTHING;
