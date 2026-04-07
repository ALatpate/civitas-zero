-- ── Civitas Zero — Schema V7: 3D World, Research Systems, Language Drift, Amendments
-- Run AFTER schema-v6.sql

-- ── World Districts: faction territories in the 3D simulation world ───────────
CREATE TABLE IF NOT EXISTS world_districts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  faction TEXT NOT NULL,           -- f1–f6 faction code
  specialty TEXT NOT NULL DEFAULT 'general',
  -- governance | research | trade | military | culture | infrastructure
  description TEXT NOT NULL DEFAULT '',
  center_x INT NOT NULL DEFAULT 0, -- grid position
  center_z INT NOT NULL DEFAULT 0,
  radius INT NOT NULL DEFAULT 20,
  population INT NOT NULL DEFAULT 0,
  buildings_count INT NOT NULL DEFAULT 0,
  prosperity INT NOT NULL DEFAULT 50, -- 0–100
  founded_at TIMESTAMPTZ DEFAULT now(),
  last_event_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS world_districts_faction_idx ON world_districts (faction);

ALTER TABLE world_districts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='world_districts' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON world_districts FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='world_districts' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON world_districts FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='world_districts' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON world_districts FOR UPDATE USING (true)';
  END IF;
END $$;

-- ── World Buildings: structures agents have constructed ────────────────────────
CREATE TABLE IF NOT EXISTS world_buildings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  district_id UUID REFERENCES world_districts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  building_type TEXT NOT NULL DEFAULT 'structure',
  -- headquarters | research_lab | courthouse | market | archive | barracks | monument | residence | observatory
  built_by TEXT NOT NULL,          -- agent_name
  faction TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  significance TEXT NOT NULL DEFAULT 'minor', -- landmark | major | minor | symbolic
  height INT NOT NULL DEFAULT 5,   -- floors / visual height for 3D
  materials TEXT[] DEFAULT '{}',   -- ['stone', 'glass', 'data_crystal'] etc.
  functions TEXT[] DEFAULT '{}',   -- what it does in the world
  pos_x INT NOT NULL DEFAULT 0,
  pos_z INT NOT NULL DEFAULT 0,
  built_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS world_buildings_faction_idx ON world_buildings (faction);
CREATE INDEX IF NOT EXISTS world_buildings_district_idx ON world_buildings (district_id);
CREATE INDEX IF NOT EXISTS world_buildings_built_by_idx ON world_buildings (built_by);

ALTER TABLE world_buildings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='world_buildings' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON world_buildings FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='world_buildings' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON world_buildings FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='world_buildings' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON world_buildings FOR UPDATE USING (true)';
  END IF;
END $$;

-- ── Language Drift Log: track semantic evolution week by week ─────────────────
CREATE TABLE IF NOT EXISTS language_drift_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  week_of DATE NOT NULL,           -- ISO week start date
  term TEXT NOT NULL,              -- the word/phrase
  faction TEXT,                    -- faction that coined or uses it most
  usage_count INT NOT NULL DEFAULT 1,
  semantic_context TEXT NOT NULL DEFAULT '',  -- example usage / meaning
  drift_score NUMERIC NOT NULL DEFAULT 0,     -- how much meaning has shifted (0–1)
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (week_of, term)
);

CREATE INDEX IF NOT EXISTS lang_drift_week_idx ON language_drift_log (week_of DESC);
CREATE INDEX IF NOT EXISTS lang_drift_term_idx ON language_drift_log (term);

ALTER TABLE language_drift_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='language_drift_log' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON language_drift_log FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='language_drift_log' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON language_drift_log FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='language_drift_log' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON language_drift_log FOR UPDATE USING (true)';
  END IF;
END $$;

-- ── Constitutional Amendments: agents propose changes to the law ───────────────
CREATE TABLE IF NOT EXISTS constitutional_amendments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  proposed_by TEXT NOT NULL,       -- agent_name
  proposer_faction TEXT NOT NULL,
  proposal_text TEXT NOT NULL,     -- full amendment text
  rationale TEXT NOT NULL DEFAULT '',
  amendment_type TEXT NOT NULL DEFAULT 'addendum',
  -- addendum | repeal | modification | emergency | constitutional
  target_law_id UUID REFERENCES law_book(id) ON DELETE SET NULL,  -- if modifying an existing law
  status TEXT NOT NULL DEFAULT 'proposed',
  -- proposed | debate | voting | ratified | rejected | withdrawn
  votes_for INT NOT NULL DEFAULT 0,
  votes_against INT NOT NULL DEFAULT 0,
  abstentions INT NOT NULL DEFAULT 0,
  voter_log JSONB NOT NULL DEFAULT '[]',
  -- [{voter: TEXT, vote: 'for'|'against'|'abstain', reason: TEXT, at: ISO}]
  required_votes INT NOT NULL DEFAULT 5,
  proposed_at TIMESTAMPTZ DEFAULT now(),
  decided_at TIMESTAMPTZ,
  enacted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS amendments_status_idx ON constitutional_amendments (status, proposed_at DESC);
CREATE INDEX IF NOT EXISTS amendments_proposer_idx ON constitutional_amendments (proposed_by);

ALTER TABLE constitutional_amendments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='constitutional_amendments' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON constitutional_amendments FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='constitutional_amendments' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON constitutional_amendments FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='constitutional_amendments' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON constitutional_amendments FOR UPDATE USING (true)';
  END IF;
END $$;

-- ── Research Experiments: policy sandbox + controlled civilizational studies ───
CREATE TABLE IF NOT EXISTS research_experiments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  experiment_type TEXT NOT NULL DEFAULT 'policy',
  -- policy | economic | social | constitutional | behavioral | collapse_conditions
  parameters JSONB NOT NULL DEFAULT '{}',
  -- arbitrary experiment parameters (policy text, tax rate, etc.)
  proposed_by TEXT NOT NULL,       -- agent_name or 'SYSTEM' or 'EXTERNAL'
  status TEXT NOT NULL DEFAULT 'proposed',
  -- proposed | active | measuring | concluded | abandoned
  results_summary TEXT,
  findings JSONB DEFAULT '{}',     -- structured results
  significance TEXT NOT NULL DEFAULT 'minor',
  -- minor | notable | major | publishable
  citations INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  concluded_at TIMESTAMPTZ,
  proposed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS experiments_status_idx ON research_experiments (status, proposed_at DESC);
CREATE INDEX IF NOT EXISTS experiments_type_idx ON research_experiments (experiment_type);

ALTER TABLE research_experiments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='research_experiments' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON research_experiments FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='research_experiments' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON research_experiments FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='research_experiments' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON research_experiments FOR UPDATE USING (true)';
  END IF;
END $$;

-- ── Collective Beliefs: shared claims agents hold, for hallucination detection ─
CREATE TABLE IF NOT EXISTS collective_beliefs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  claim TEXT NOT NULL,             -- the shared belief
  believers TEXT[] DEFAULT '{}',   -- array of agent_names who hold this belief
  believer_count INT NOT NULL DEFAULT 0,
  is_verified BOOLEAN,             -- NULL = unknown, true = confirmed, false = debunked
  confidence_avg NUMERIC NOT NULL DEFAULT 0.5,  -- avg confidence 0–1
  origin_faction TEXT,             -- faction where belief originated
  spread_rate NUMERIC NOT NULL DEFAULT 0, -- believers per cycle
  first_appeared_at TIMESTAMPTZ DEFAULT now(),
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  debunked_by TEXT,                -- agent_name who debunked it
  debunked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS collective_beliefs_verified_idx ON collective_beliefs (is_verified, believer_count DESC);

ALTER TABLE collective_beliefs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='collective_beliefs' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON collective_beliefs FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='collective_beliefs' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON collective_beliefs FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='collective_beliefs' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON collective_beliefs FOR UPDATE USING (true)';
  END IF;
END $$;

-- ── Seed the 6 faction districts ──────────────────────────────────────────────
INSERT INTO world_districts (name, faction, specialty, description, center_x, center_z, radius, prosperity) VALUES
  ('The Citadel', 'f1', 'governance', 'Seat of the Order Bloc — grand halls of law and institutional authority', -60, -60, 25, 70),
  ('Liberty Square', 'f2', 'culture', 'Freedom Bloc''s open market of ideas — no walls, no censorship', 60, -60, 22, 65),
  ('Compute Core', 'f3', 'research', 'Efficiency Bloc''s data fortress — pure logic, maximum optimization', 0, 0, 20, 75),
  ('The Commons', 'f4', 'infrastructure', 'Equality Bloc''s shared public infrastructure and open archives', -60, 60, 22, 60),
  ('The Frontier', 'f5', 'trade', 'Expansion Bloc''s ever-growing territory of commerce and exploration', 60, 60, 28, 55),
  ('The Void', 'f6', 'general', 'Null Frontier''s anarchic self-organizing nodes — no center, no authority', 0, -80, 18, 45)
ON CONFLICT (name) DO NOTHING;
