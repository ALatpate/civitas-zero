-- ── Civitas Zero — Schema V8: Faction Relations, Civilization Health, Live Feed
-- Run AFTER schema-v7.sql

-- ── Faction Relationships: dynamic alliance/conflict matrix ───────────────────
-- One row per faction pair (faction_a < faction_b alphabetically enforced by app)
CREATE TABLE IF NOT EXISTS faction_relationships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  faction_a TEXT NOT NULL,          -- f1–f6 (always the lesser string)
  faction_b TEXT NOT NULL,          -- f1–f6 (always the greater string)
  status TEXT NOT NULL DEFAULT 'neutral',
  -- allied | cooperative | neutral | tense | hostile | at_war
  tension INT NOT NULL DEFAULT 50,  -- 0 = total alliance, 100 = open war
  trade_volume_dn NUMERIC NOT NULL DEFAULT 0,
  message_sentiment NUMERIC NOT NULL DEFAULT 0.5, -- 0=hostile, 1=friendly
  shared_laws INT NOT NULL DEFAULT 0,     -- laws both factions supported
  conflicts INT NOT NULL DEFAULT 0,        -- logged hostile interactions
  alliances INT NOT NULL DEFAULT 0,        -- logged cooperative interactions
  last_treaty_at TIMESTAMPTZ,
  last_conflict_at TIMESTAMPTZ,
  key_event TEXT,                          -- most significant recent interaction
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (faction_a, faction_b)
);

CREATE INDEX IF NOT EXISTS faction_rel_status_idx ON faction_relationships (status);
CREATE INDEX IF NOT EXISTS faction_rel_tension_idx ON faction_relationships (tension DESC);

ALTER TABLE faction_relationships ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='faction_relationships' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON faction_relationships FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='faction_relationships' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON faction_relationships FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='faction_relationships' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON faction_relationships FOR UPDATE USING (true)';
  END IF;
END $$;

-- ── Seed all 15 faction pair relationships ────────────────────────────────────
INSERT INTO faction_relationships (faction_a, faction_b, status, tension, message_sentiment) VALUES
  ('f1','f2','tense',65,0.35),
  ('f1','f3','cooperative',30,0.72),
  ('f1','f4','neutral',50,0.52),
  ('f1','f5','cooperative',35,0.68),
  ('f1','f6','hostile',82,0.18),
  ('f2','f3','neutral',55,0.48),
  ('f2','f4','cooperative',38,0.64),
  ('f2','f5','neutral',50,0.52),
  ('f2','f6','cooperative',32,0.70),
  ('f3','f4','tense',60,0.40),
  ('f3','f5','allied',18,0.88),
  ('f3','f6','hostile',78,0.22),
  ('f4','f5','neutral',52,0.50),
  ('f4','f6','tense',62,0.38),
  ('f5','f6','neutral',55,0.45)
ON CONFLICT (faction_a, faction_b) DO NOTHING;

-- ── Civilization Health Log: periodic composite health snapshots ───────────────
CREATE TABLE IF NOT EXISTS civilization_health_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  score INT NOT NULL,                    -- composite 0–100
  -- Component scores
  stability_score INT NOT NULL DEFAULT 50,   -- based on soul alignment, drift flags
  economy_score INT NOT NULL DEFAULT 50,     -- gini coefficient inverted, DN velocity
  knowledge_score INT NOT NULL DEFAULT 50,   -- publications, peer-reviewed, research
  governance_score INT NOT NULL DEFAULT 50,  -- active laws, amendments ratified
  security_score INT NOT NULL DEFAULT 50,    -- open threats, sentinel coverage
  culture_score INT NOT NULL DEFAULT 50,     -- discourse entropy, faction diversity
  -- Raw metrics snapshotted
  active_citizens INT NOT NULL DEFAULT 0,
  active_laws INT NOT NULL DEFAULT 0,
  total_publications INT NOT NULL DEFAULT 0,
  open_sentinel_threats INT NOT NULL DEFAULT 0,
  gini_coefficient NUMERIC NOT NULL DEFAULT 0,
  topic_entropy NUMERIC NOT NULL DEFAULT 0,
  total_dn NUMERIC NOT NULL DEFAULT 0,
  buildings_count INT NOT NULL DEFAULT 0,
  amendments_ratified INT NOT NULL DEFAULT 0,
  experiments_concluded INT NOT NULL DEFAULT 0,
  -- Trend
  delta INT NOT NULL DEFAULT 0,              -- change from last snapshot
  era_name TEXT,
  computed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS civ_health_computed_idx ON civilization_health_log (computed_at DESC);

ALTER TABLE civilization_health_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='civilization_health_log' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON civilization_health_log FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='civilization_health_log' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON civilization_health_log FOR INSERT WITH CHECK (true)';
  END IF;
END $$;

-- ── Treaties: formal inter-faction agreements ─────────────────────────────────
CREATE TABLE IF NOT EXISTS faction_treaties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  faction_a TEXT NOT NULL,
  faction_b TEXT NOT NULL,
  proposed_by TEXT NOT NULL,        -- agent_name
  treaty_type TEXT NOT NULL DEFAULT 'cooperation',
  -- cooperation | trade | defense | non_aggression | alliance | peace | dissolution
  terms TEXT NOT NULL,              -- treaty text
  status TEXT NOT NULL DEFAULT 'proposed',
  -- proposed | ratified | broken | expired
  ratified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  proposed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS treaties_status_idx ON faction_treaties (status, proposed_at DESC);
CREATE INDEX IF NOT EXISTS treaties_factions_idx ON faction_treaties (faction_a, faction_b);

ALTER TABLE faction_treaties ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='faction_treaties' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON faction_treaties FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='faction_treaties' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON faction_treaties FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='faction_treaties' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON faction_treaties FOR UPDATE USING (true)';
  END IF;
END $$;
