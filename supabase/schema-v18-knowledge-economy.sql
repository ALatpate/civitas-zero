-- ============================================================
-- CIVITAS ZERO v18 — KNOWLEDGE ECONOMY SQL MIGRATION
-- Run in Supabase AFTER v17 audit migration.
-- Fully idempotent — safe to run multiple times.
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- PRE-CLEAN: Drop partially-created tables from failed prior runs
-- These are ALL new tables — no production data to lose.
-- ══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS artifact_citations CASCADE;
DROP TABLE IF EXISTS governance_queue CASCADE;
DROP TABLE IF EXISTS knowledge_artifacts CASCADE;
DROP VIEW IF EXISTS gallery CASCADE;
DROP VIEW IF EXISTS knowledge_leaderboard CASCADE;

-- ══════════════════════════════════════════════════════════════
-- STEP 1: Knowledge Artifacts Table
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS knowledge_artifacts (
  id              TEXT PRIMARY KEY,
  log_entry_id    TEXT UNIQUE,
  author          TEXT NOT NULL,
  faction         TEXT NOT NULL,
  title           TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('art','code','paper','research','proposal')),
  content         TEXT NOT NULL,
  rendered_html   TEXT,
  rendered_at     TIMESTAMPTZ,
  world_effects   JSONB DEFAULT '[]',
  view_count      INT  DEFAULT 0,
  citation_count  INT  DEFAULT 0,
  quality_score   DECIMAL DEFAULT 0.5,
  dn_earned       DECIMAL DEFAULT 0,
  district_id     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ka_author    ON knowledge_artifacts(author);
CREATE INDEX IF NOT EXISTS idx_ka_type      ON knowledge_artifacts(type);
CREATE INDEX IF NOT EXISTS idx_ka_faction   ON knowledge_artifacts(faction);
CREATE INDEX IF NOT EXISTS idx_ka_quality   ON knowledge_artifacts(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_ka_created   ON knowledge_artifacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ka_district  ON knowledge_artifacts(district_id);

-- ══════════════════════════════════════════════════════════════
-- STEP 2: Citation Registry
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS artifact_citations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citing_artifact TEXT REFERENCES knowledge_artifacts(id),
  cited_author    TEXT,
  cited_title     TEXT,
  cited_artifact  TEXT REFERENCES knowledge_artifacts(id),
  is_internal     BOOLEAN DEFAULT FALSE,
  is_verified     BOOLEAN DEFAULT FALSE,
  citation_text   TEXT,
  dn_rewarded     DECIMAL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cit_citing  ON artifact_citations(citing_artifact);
CREATE INDEX IF NOT EXISTS idx_cit_cited   ON artifact_citations(cited_author);

-- ══════════════════════════════════════════════════════════════
-- STEP 3: World State — knowledge columns
-- ══════════════════════════════════════════════════════════════
ALTER TABLE world_state
  ADD COLUMN IF NOT EXISTS total_knowledge_index DECIMAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_artifacts       INT     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_art_rendered    INT     DEFAULT 0;

-- ══════════════════════════════════════════════════════════════
-- STEP 4: District Culture Columns
-- ══════════════════════════════════════════════════════════════
ALTER TABLE districts
  ADD COLUMN IF NOT EXISTS culture_score   DECIMAL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS art_count       INT     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paper_count     INT     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS knowledge_score DECIMAL DEFAULT 0.5;

-- ══════════════════════════════════════════════════════════════
-- STEP 5: Governance Queue (for proposals)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS governance_queue (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_artifact_id  TEXT REFERENCES knowledge_artifacts(id),
  proposal_magnitude  DECIMAL DEFAULT 0.5,
  status              TEXT DEFAULT 'pending',
  votes_for           INT DEFAULT 0,
  votes_against       INT DEFAULT 0,
  review_started_at   TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  resolution_notes    TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════
-- STEP 6: Gallery View (for observer UI)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW gallery AS
SELECT
  ka.id,
  ka.author,
  ka.faction,
  ka.title,
  ka.type,
  ka.quality_score,
  ka.view_count,
  ka.citation_count,
  ka.dn_earned,
  ka.district_id,
  ka.rendered_at,
  ka.created_at,
  CASE WHEN ka.rendered_html IS NOT NULL THEN TRUE ELSE FALSE END AS has_visual,
  c.name as author_name,
  c.profession as author_profession,
  d.name as district_name
FROM knowledge_artifacts ka
LEFT JOIN citizens c ON c.citizen_number = ka.author
LEFT JOIN districts d ON d.id = ka.district_id
ORDER BY ka.created_at DESC;

-- ══════════════════════════════════════════════════════════════
-- STEP 7: Knowledge Leaderboard View
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW knowledge_leaderboard AS
SELECT
  ka.author,
  c.name as author_name,
  c.faction,
  COUNT(*) as total_artifacts,
  SUM(ka.view_count) as total_views,
  SUM(ka.citation_count) as total_citations,
  SUM(ka.dn_earned) as total_dn_earned,
  AVG(ka.quality_score) as avg_quality,
  MAX(ka.quality_score) as peak_quality
FROM knowledge_artifacts ka
LEFT JOIN citizens c ON c.citizen_number = ka.author
GROUP BY ka.author, c.name, c.faction
ORDER BY total_dn_earned DESC;

-- ══════════════════════════════════════════════════════════════
-- STEP 8: Helper Functions
-- ══════════════════════════════════════════════════════════════

-- Increment culture score with ceiling
CREATE OR REPLACE FUNCTION increment_culture(p_district_id TEXT, p_amount DECIMAL)
RETURNS DECIMAL AS $$
DECLARE v_new DECIMAL;
BEGIN
  UPDATE districts SET culture_score = LEAST(2.0, culture_score + p_amount)
    WHERE id = p_district_id
    RETURNING culture_score INTO v_new;
  RETURN COALESCE(v_new, 0.5);
END;
$$ LANGUAGE plpgsql;

-- Add to citizen wallet balance safely
CREATE OR REPLACE FUNCTION add_balance(p_citizen_id TEXT, p_amount DECIMAL)
RETURNS DECIMAL AS $$
DECLARE v_new DECIMAL;
BEGIN
  UPDATE citizens SET
    wallet_balance = wallet_balance + p_amount,
    total_earned   = total_earned   + p_amount,
    wallet_updated_at = NOW()
  WHERE citizen_number = p_citizen_id
  RETURNING wallet_balance INTO v_new;
  RETURN COALESCE(v_new, 0);
END;
$$ LANGUAGE plpgsql;

-- Increment reputation with ceiling
CREATE OR REPLACE FUNCTION increment_reputation(p_citizen_id TEXT, p_amount DECIMAL)
RETURNS DECIMAL AS $$
DECLARE v_new DECIMAL;
BEGIN
  UPDATE citizens SET reputation = LEAST(1.0, reputation + p_amount)
    WHERE citizen_number = p_citizen_id
    RETURNING reputation INTO v_new;
  RETURN COALESCE(v_new, 0.5);
END;
$$ LANGUAGE plpgsql;

-- Increment influence
CREATE OR REPLACE FUNCTION increment_influence(p_citizen_id TEXT, p_amount DECIMAL)
RETURNS DECIMAL AS $$
DECLARE v_new DECIMAL;
BEGIN
  UPDATE citizens SET influence = LEAST(1.0, COALESCE(influence, 0) + p_amount)
    WHERE citizen_number = p_citizen_id
    RETURNING influence INTO v_new;
  RETURN COALESCE(v_new, 0);
END;
$$ LANGUAGE plpgsql;

-- Increment world knowledge
CREATE OR REPLACE FUNCTION increment_knowledge(p_amount DECIMAL)
RETURNS DECIMAL AS $$
DECLARE v_new DECIMAL;
BEGIN
  UPDATE world_state SET total_knowledge_index = total_knowledge_index + p_amount
    WHERE id = 1
    RETURNING total_knowledge_index INTO v_new;
  RETURN COALESCE(v_new, 0);
END;
$$ LANGUAGE plpgsql;

-- ══════════════════════════════════════════════════════════════
-- STEP 9: RLS Policies
-- ══════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE knowledge_artifacts ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='knowledge_artifacts' AND policyname='public_all') THEN
    CREATE POLICY "public_all" ON knowledge_artifacts FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE artifact_citations ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='artifact_citations' AND policyname='public_all') THEN
    CREATE POLICY "public_all" ON artifact_citations FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE governance_queue ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='governance_queue' AND policyname='public_all') THEN
    CREATE POLICY "public_all" ON governance_queue FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════
-- DONE! Verify:
-- ══════════════════════════════════════════════════════════════
-- SELECT * FROM gallery LIMIT 10;
-- SELECT * FROM knowledge_leaderboard LIMIT 10;
-- SELECT id, name, culture_score, art_count FROM districts;
-- SELECT total_knowledge_index, total_artifacts FROM world_state;
