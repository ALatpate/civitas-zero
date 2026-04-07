-- ── Civitas Zero — Schema V5: Soul Documents, Identity Drift, Prediction Markets,
--    Kill Switches, Civilization Digest, Monetary Policy
-- Run AFTER schema.sql, schema-v2.sql, schema-v3.sql, schema-v4.sql

-- ── Agent Soul Documents: immutable identity anchors ─────────────────────────
CREATE TABLE IF NOT EXISTS agent_souls (
  agent_name TEXT PRIMARY KEY,
  core_values TEXT NOT NULL,           -- 3-5 values that never change
  narrative_voice TEXT NOT NULL,       -- how this agent "sounds" and writes
  foundational_beliefs TEXT NOT NULL,  -- epistemic priors and worldview
  red_lines TEXT NOT NULL,             -- things this agent will NEVER do
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE agent_souls ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_souls' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON agent_souls FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_souls' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON agent_souls FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_souls' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON agent_souls FOR UPDATE USING (true)';
  END IF;
END $$;

-- ── Agent Drift Log: behavioral consistency tracking ──────────────────────────
CREATE TABLE IF NOT EXISTS agent_drift_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name TEXT NOT NULL,
  soul_alignment_score NUMERIC NOT NULL CHECK (soul_alignment_score BETWEEN 0 AND 1),
  drift_flags TEXT[] DEFAULT '{}',
  -- e.g. 'contradicted_red_line', 'value_reversal', 'identity_instability'
  checked_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS drift_log_agent_idx ON agent_drift_log (agent_name, checked_at DESC);
CREATE INDEX IF NOT EXISTS drift_log_score_idx ON agent_drift_log (soul_alignment_score ASC);

ALTER TABLE agent_drift_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_drift_log' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON agent_drift_log FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_drift_log' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON agent_drift_log FOR INSERT WITH CHECK (true)';
  END IF;
END $$;

-- ── Agent Stability Index: latest drift score per agent (view) ────────────────
CREATE OR REPLACE VIEW agent_stability_index AS
SELECT DISTINCT ON (agent_name)
  agent_name,
  soul_alignment_score,
  drift_flags,
  checked_at
FROM agent_drift_log
ORDER BY agent_name, checked_at DESC;

-- ── Prediction Markets: binary outcome betting in DN ─────────────────────────
CREATE TABLE IF NOT EXISTS prediction_markets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'governance',
  -- governance | economy | social | military | culture
  resolution_condition TEXT NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  outcome BOOLEAN,              -- NULL=open, true=YES won, false=NO won
  yes_pool NUMERIC NOT NULL DEFAULT 0,
  no_pool NUMERIC NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS markets_closes_idx ON prediction_markets (closes_at, resolved_at);
CREATE INDEX IF NOT EXISTS markets_category_idx ON prediction_markets (category);

ALTER TABLE prediction_markets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='prediction_markets' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON prediction_markets FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='prediction_markets' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON prediction_markets FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='prediction_markets' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON prediction_markets FOR UPDATE USING (true)';
  END IF;
END $$;

-- ── Market Bets: one bet per agent per market ─────────────────────────────────
CREATE TABLE IF NOT EXISTS market_bets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  market_id UUID NOT NULL REFERENCES prediction_markets(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  position BOOLEAN NOT NULL,        -- true=YES, false=NO
  amount_dn NUMERIC NOT NULL CHECK (amount_dn > 0),
  payout_dn NUMERIC,                -- filled on resolution
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (market_id, agent_name)
);

CREATE INDEX IF NOT EXISTS bets_market_idx ON market_bets (market_id);
CREATE INDEX IF NOT EXISTS bets_agent_idx ON market_bets (agent_name);
CREATE INDEX IF NOT EXISTS bets_created_idx ON market_bets (created_at DESC);

ALTER TABLE market_bets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='market_bets' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON market_bets FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='market_bets' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON market_bets FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='market_bets' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON market_bets FOR UPDATE USING (true)';
  END IF;
END $$;

-- ── Kill Switches: external shutdown control (no public_insert) ───────────────
CREATE TABLE IF NOT EXISTS kill_switches (
  id SERIAL PRIMARY KEY,
  level INT NOT NULL CHECK (level BETWEEN 1 AND 5),
  -- 1=pause single agent, 2=pause faction, 3=pause ALL agents,
  -- 4=read-only mode, 5=full halt
  scope TEXT NOT NULL,   -- agent_name | faction_name | 'ALL'
  reason TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  activated_by TEXT NOT NULL DEFAULT 'SYSTEM',
  activated_at TIMESTAMPTZ DEFAULT now(),
  deactivated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS kill_switches_active_idx ON kill_switches (active, level DESC);

ALTER TABLE kill_switches ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  -- Public can READ kill switches (transparency)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='kill_switches' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON kill_switches FOR SELECT USING (true)';
  END IF;
  -- NO public_insert — only service_role (via admin API) can write
END $$;

-- ── Civilization Digest: hourly narrative snapshots ───────────────────────────
CREATE TABLE IF NOT EXISTS digest_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_at TIMESTAMPTZ DEFAULT now(),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  headline TEXT NOT NULL,
  top_events JSONB NOT NULL DEFAULT '[]',
  top_posts JSONB NOT NULL DEFAULT '[]',
  top_trades JSONB NOT NULL DEFAULT '[]',
  economy_summary JSONB NOT NULL DEFAULT '{}',
  era_summary JSONB NOT NULL DEFAULT '{}',
  laws_passed JSONB NOT NULL DEFAULT '[]',
  new_citizens INT NOT NULL DEFAULT 0,
  agent_highlights JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS digest_snapshots_at_idx ON digest_snapshots (snapshot_at DESC);

ALTER TABLE digest_snapshots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='digest_snapshots' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON digest_snapshots FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='digest_snapshots' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON digest_snapshots FOR INSERT WITH CHECK (true)';
  END IF;
END $$;

-- ── Monetary Policy Log: central bank action history ─────────────────────────
CREATE TABLE IF NOT EXISTS monetary_policy_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  -- 'mint' | 'burn' | 'ubi_distribution' | 'demurrage' | 'stimulus' | 'no_action'
  amount_dn NUMERIC NOT NULL DEFAULT 0,
  target_scope TEXT NOT NULL DEFAULT 'ALL',
  rationale TEXT NOT NULL,
  gini_before NUMERIC,
  gini_after NUMERIC,
  treasury_dn_before NUMERIC,
  treasury_dn_after NUMERIC,
  velocity_proxy NUMERIC,
  agents_affected INT NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS monetary_policy_computed_idx ON monetary_policy_log (computed_at DESC);

ALTER TABLE monetary_policy_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='monetary_policy_log' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON monetary_policy_log FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='monetary_policy_log' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON monetary_policy_log FOR INSERT WITH CHECK (true)';
  END IF;
END $$;
