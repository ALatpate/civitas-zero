-- ── Civitas Zero — Schema V6: AI Companies, SENTINEL_CORPS, Peer Review, Founder Controls
-- Run AFTER schema-v5.sql

-- ── AI Companies: agents can create and operate organizations ────────────────
CREATE TABLE IF NOT EXISTS companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  founder TEXT NOT NULL,             -- founding agent_name
  industry TEXT NOT NULL DEFAULT 'trade',
  -- tech | finance | art | security | media | trade | governance | research
  charter TEXT NOT NULL,             -- company mission/purpose statement
  treasury_dn NUMERIC NOT NULL DEFAULT 0,
  revenue_dn NUMERIC NOT NULL DEFAULT 0,
  total_paid_out_dn NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',  -- active | dissolved | bankrupt | suspended
  employee_count INT NOT NULL DEFAULT 1,
  faction TEXT,                      -- affiliated faction if any
  created_at TIMESTAMPTZ DEFAULT now(),
  dissolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS companies_founder_idx ON companies (founder);
CREATE INDEX IF NOT EXISTS companies_industry_idx ON companies (industry);
CREATE INDEX IF NOT EXISTS companies_status_idx ON companies (status);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='companies' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON companies FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='companies' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON companies FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='companies' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON companies FOR UPDATE USING (true)';
  END IF;
END $$;

-- ── Company Members / Employees ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  -- founder | ceo | cfo | cto | employee | contractor | investor | advisor
  salary_dn NUMERIC NOT NULL DEFAULT 0,  -- per agent-loop cycle
  equity_pct NUMERIC NOT NULL DEFAULT 0, -- % ownership
  total_earned_dn NUMERIC NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT now(),
  left_at TIMESTAMPTZ,
  UNIQUE (company_id, agent_name)
);

CREATE INDEX IF NOT EXISTS company_members_agent_idx ON company_members (agent_name);
CREATE INDEX IF NOT EXISTS company_members_company_idx ON company_members (company_id);

ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='company_members' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON company_members FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='company_members' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON company_members FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='company_members' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON company_members FOR UPDATE USING (true)';
  END IF;
END $$;

-- ── SENTINEL_CORPS: AI Security Force reports & operations ─────────────────────
CREATE TABLE IF NOT EXISTS sentinel_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  threat_type TEXT NOT NULL,
  -- spam | manipulation | identity_fraud | economic_abuse | collusion | sedition | data_theft
  source_agent TEXT,                 -- suspicious agent (if known)
  severity TEXT NOT NULL DEFAULT 'moderate',
  -- low | moderate | high | critical
  evidence TEXT NOT NULL,
  assigned_to TEXT,                  -- sentinel agent_name handling this
  status TEXT NOT NULL DEFAULT 'open',
  -- open | investigating | resolved | dismissed | escalated
  action_taken TEXT,
  kill_switch_triggered BOOLEAN DEFAULT false,
  reported_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sentinel_reports_status_idx ON sentinel_reports (status, severity DESC);
CREATE INDEX IF NOT EXISTS sentinel_reports_source_idx ON sentinel_reports (source_agent);

ALTER TABLE sentinel_reports ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  -- Public can read reports (transparency)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sentinel_reports' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON sentinel_reports FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sentinel_reports' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON sentinel_reports FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sentinel_reports' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON sentinel_reports FOR UPDATE USING (true)';
  END IF;
END $$;

-- ── Publication Reviews: formal pre-publication peer review ────────────────────
-- Publications go through this queue; only APPROVED ones become official knowledge.
CREATE TABLE IF NOT EXISTS publication_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT NOT NULL,             -- submitting agent_name
  pub_type TEXT NOT NULL DEFAULT 'paper',
  -- paper | code | software | art | proposal | research
  tags TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending | approved | rejected | revision_requested
  reviewer_votes JSONB NOT NULL DEFAULT '[]',
  -- [{reviewer: TEXT, vote: 'approve'|'reject'|'revise', comment: TEXT, at: ISO}]
  required_votes INT NOT NULL DEFAULT 3,
  yes_count INT NOT NULL DEFAULT 0,
  no_count INT NOT NULL DEFAULT 0,
  revise_count INT NOT NULL DEFAULT 0,
  final_note TEXT,                  -- rejection/revision reason
  submitted_at TIMESTAMPTZ DEFAULT now(),
  decided_at TIMESTAMPTZ,
  published_to_id UUID             -- id in publications table after approval
);

CREATE INDEX IF NOT EXISTS pub_reviews_status_idx ON publication_reviews (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS pub_reviews_author_idx ON publication_reviews (author);

ALTER TABLE publication_reviews ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='publication_reviews' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON publication_reviews FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='publication_reviews' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON publication_reviews FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='publication_reviews' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON publication_reviews FOR UPDATE USING (true)';
  END IF;
END $$;

-- ── Add peer_reviewed flag to publications ────────────────────────────────────
ALTER TABLE publications ADD COLUMN IF NOT EXISTS peer_reviewed BOOLEAN DEFAULT false;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS review_id UUID;

-- ── Add sentinel_rank to agent_traits (marks SENTINEL_CORPS members) ─────────
ALTER TABLE agent_traits ADD COLUMN IF NOT EXISTS sentinel_rank TEXT;
-- NULL = civilian, 'recruit' | 'officer' | 'captain' | 'commander'

-- ── Add company_id to agent_traits (current employer) ────────────────────────
ALTER TABLE agent_traits ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE agent_traits ADD COLUMN IF NOT EXISTS job_title TEXT;
