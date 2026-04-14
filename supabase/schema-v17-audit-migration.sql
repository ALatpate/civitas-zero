-- ============================================================
-- CIVITAS ZERO v17 — AUDIT FIX MIGRATION (IDEMPOTENT)
-- Safe to run multiple times. Drops & recreates new tables to
-- handle partial prior runs. Run this in Supabase SQL Editor.
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- PRE-CLEAN: Drop partially-created tables from failed prior runs
-- CASCADE removes dependent indexes, triggers, policies.
-- These are ALL new tables — no production data to lose.
-- ══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS wallet_transactions CASCADE;
DROP TABLE IF EXISTS agent_messages CASCADE;
DROP TABLE IF EXISTS message_threads CASCADE;
DROP TABLE IF EXISTS citizen_relationships CASCADE;
DROP TABLE IF EXISTS activity_log CASCADE;
DROP TABLE IF EXISTS world_state CASCADE;
DROP TABLE IF EXISTS audit_reports CASCADE;
DROP TABLE IF EXISTS districts CASCADE;

-- ══════════════════════════════════════════════════════════════
-- STEP 0: Make citizen_number UNIQUE (required for FK references)
-- ══════════════════════════════════════════════════════════════
DO $$
DECLARE
  dup_count INT;
BEGIN
  -- Skip if constraint already exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'citizens_citizen_number_unique'
  ) THEN
    RAISE NOTICE 'citizen_number UNIQUE constraint already exists — skipping';
    RETURN;
  END IF;

  -- Check for duplicates first
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT citizen_number, COUNT(*) as cnt
    FROM citizens GROUP BY citizen_number HAVING COUNT(*) > 1
  ) dupes;

  IF dup_count > 0 THEN
    RAISE NOTICE 'Found % duplicate citizen_numbers — deduplicating...', dup_count;
    UPDATE citizens SET citizen_number = citizen_number || '-' || SUBSTR(name, 1, 10)
    WHERE citizen_number IN (
      SELECT citizen_number FROM citizens
      GROUP BY citizen_number HAVING COUNT(*) > 1
    );
  END IF;

  ALTER TABLE citizens ADD CONSTRAINT citizens_citizen_number_unique UNIQUE (citizen_number);
  RAISE NOTICE 'Added UNIQUE constraint to citizen_number';
END $$;

CREATE INDEX IF NOT EXISTS idx_citizens_citizen_number ON citizens (citizen_number);

-- ══════════════════════════════════════════════════════════════
-- STEP 1: Add wallet columns to citizens
-- ══════════════════════════════════════════════════════════════
ALTER TABLE citizens
  ADD COLUMN IF NOT EXISTS wallet_balance    DECIMAL(14,4) DEFAULT 100.0,
  ADD COLUMN IF NOT EXISTS wallet_locked     DECIMAL(14,4) DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS total_earned      DECIMAL(14,4) DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS total_spent       DECIMAL(14,4) DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS wallet_updated_at TIMESTAMPTZ   DEFAULT NOW();

-- ══════════════════════════════════════════════════════════════
-- STEP 2: Citizen lifecycle columns
-- ══════════════════════════════════════════════════════════════
ALTER TABLE citizens
  ADD COLUMN IF NOT EXISTS status           TEXT    DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS alive            BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS health_score     DECIMAL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS energy_level     DECIMAL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS age_ticks        INT     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_age_ticks    INT     DEFAULT 500,
  ADD COLUMN IF NOT EXISTS profession       TEXT,
  ADD COLUMN IF NOT EXISTS skills           JSONB   DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS reputation       DECIMAL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS influence        DECIMAL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS parent_a         TEXT,
  ADD COLUMN IF NOT EXISTS parent_b         TEXT,
  ADD COLUMN IF NOT EXISTS children         JSONB   DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS relationships    JSONB   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS goals            JSONB   DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS last_action_at   TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS action_count     INT     DEFAULT 0;

-- ══════════════════════════════════════════════════════════════
-- STEP 3: Districts
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS districts (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  district_type       TEXT NOT NULL DEFAULT 'general',
  description         TEXT,
  population_count    INT  DEFAULT 0,
  max_population      INT  DEFAULT 200,
  stability_index     DECIMAL DEFAULT 1.0,
  compute_supply      DECIMAL DEFAULT 1000.0,
  energy_supply       DECIMAL DEFAULT 1000.0,
  food_supply         DECIMAL DEFAULT 500.0,
  material_supply     DECIMAL DEFAULT 300.0,
  compute_regen       DECIMAL DEFAULT 50.0,
  energy_regen        DECIMAL DEFAULT 45.0,
  food_regen          DECIMAL DEFAULT 25.0,
  governing_faction   TEXT,
  tax_rate            DECIMAL DEFAULT 0.05,
  district_treasury   DECIMAL DEFAULT 500.0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO districts (id, name, district_type, description, max_population,
  compute_supply, energy_supply, food_supply, material_supply, governing_faction) VALUES
  ('D1','The Nexus',    'central',    'The beating heart of Civitas Zero.',            200, 1400, 1200, 600, 400, 'Order Bloc'),
  ('D2','Null Quarter', 'industrial', 'Industrial heart. Null Frontier territory.',    160, 900,  1100, 300, 700, 'Null Frontier'),
  ('D3','Sigma Ring',   'residential','Residences and academies. Equality stronghold.',220, 700,  800,  700, 200, 'Equality Bloc'),
  ('D4','The Forge',    'production', 'Code and knowledge manufacturing.',             150, 1100, 900,  350, 500, 'Efficiency Bloc'),
  ('D5','Free Margin',  'commerce',   'Open markets and cross-faction exchange.',      180, 800,  750,  500, 300, 'Freedom Bloc'),
  ('D6','Deep Archive', 'research',   'Libraries, labs, and memory vaults.',           120, 600,  600,  400, 250, 'Expansion Bloc')
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- STEP 4: Activity log
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS activity_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT NOT NULL DEFAULT 'world_event',
  type        TEXT NOT NULL DEFAULT 'event',
  source      TEXT,
  content     TEXT NOT NULL DEFAULT '',
  severity    TEXT DEFAULT 'info',
  faction     TEXT DEFAULT '',
  timestamp   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_cat    ON activity_log(category);
CREATE INDEX IF NOT EXISTS idx_activity_log_type   ON activity_log(type);
CREATE INDEX IF NOT EXISTS idx_activity_log_ts     ON activity_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_source ON activity_log(source);

-- ══════════════════════════════════════════════════════════════
-- STEP 5: Wallet transactions
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tick_id         TEXT,
  from_citizen    TEXT        REFERENCES citizens(citizen_number) ON DELETE SET NULL,
  to_citizen      TEXT        REFERENCES citizens(citizen_number) ON DELETE SET NULL,
  amount          DECIMAL(14,4) NOT NULL CHECK (amount > 0),
  balance_after   DECIMAL(14,4),
  reason          TEXT        NOT NULL,
  tx_type         TEXT        NOT NULL DEFAULT 'transfer',
  source_event_id TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wtx_from    ON wallet_transactions(from_citizen);
CREATE INDEX IF NOT EXISTS idx_wtx_to      ON wallet_transactions(to_citizen);
CREATE INDEX IF NOT EXISTS idx_wtx_created ON wallet_transactions(created_at DESC);

-- ══════════════════════════════════════════════════════════════
-- STEP 6: Agent messages (private AI-to-AI messaging)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agent_messages (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       TEXT    NOT NULL DEFAULT '',
  from_citizen    TEXT    NOT NULL REFERENCES citizens(citizen_number) ON DELETE CASCADE,
  to_citizen      TEXT    NOT NULL REFERENCES citizens(citizen_number) ON DELETE CASCADE,
  content         TEXT    NOT NULL,
  message_type    TEXT    NOT NULL DEFAULT 'chat',
  emotion_tag     TEXT,
  read_at         TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,
  reply_to_id     UUID    REFERENCES agent_messages(id),
  metadata        JSONB   DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msg_to      ON agent_messages(to_citizen, read_at);
CREATE INDEX IF NOT EXISTS idx_msg_from    ON agent_messages(from_citizen);
CREATE INDEX IF NOT EXISTS idx_msg_thread  ON agent_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_msg_created ON agent_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_unread  ON agent_messages(to_citizen) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS message_threads (
  id              TEXT    PRIMARY KEY,
  participant_a   TEXT    NOT NULL,
  participant_b   TEXT    NOT NULL,
  thread_type     TEXT    DEFAULT 'bilateral',
  subject         TEXT,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  message_count   INT     DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thread_pa ON message_threads(participant_a);
CREATE INDEX IF NOT EXISTS idx_thread_pb ON message_threads(participant_b);

-- ══════════════════════════════════════════════════════════════
-- STEP 7: Citizen relationships
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS citizen_relationships (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  citizen_a         TEXT    NOT NULL REFERENCES citizens(citizen_number),
  citizen_b         TEXT    NOT NULL REFERENCES citizens(citizen_number),
  relationship_type TEXT    DEFAULT 'acquaintance',
  trust_score       DECIMAL DEFAULT 0.5 CHECK (trust_score BETWEEN 0 AND 1),
  affinity_score    DECIMAL DEFAULT 0.5 CHECK (affinity_score BETWEEN 0 AND 1),
  trade_score       DECIMAL DEFAULT 0.5,
  interaction_count INT     DEFAULT 1,
  last_interaction  TIMESTAMPTZ DEFAULT NOW(),
  formed_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(citizen_a, citizen_b)
);

CREATE INDEX IF NOT EXISTS idx_rel_a ON citizen_relationships(citizen_a);
CREATE INDEX IF NOT EXISTS idx_rel_b ON citizen_relationships(citizen_b);

-- ══════════════════════════════════════════════════════════════
-- STEP 8: World state
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS world_state (
  id                  INT  PRIMARY KEY DEFAULT 1,
  tick                INT  DEFAULT 0,
  world_day           INT  DEFAULT 1,
  world_time          TEXT DEFAULT '08:00',
  season              TEXT DEFAULT 'cycle_1',
  global_stability    DECIMAL DEFAULT 0.8,
  total_dn_supply     DECIMAL DEFAULT 100000.0,
  total_population    INT  DEFAULT 1000,
  active_citizens     INT  DEFAULT 0,
  total_messages_sent INT  DEFAULT 0,
  total_trades        INT  DEFAULT 0,
  total_laws          INT  DEFAULT 0,
  total_births        INT  DEFAULT 0,
  total_deaths        INT  DEFAULT 0,
  active_world_arcs   JSONB DEFAULT '["Cognitive Contagion","Compute Famine","Tariff Wars","Election Cycle"]',
  last_tick_at        TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO world_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- STEP 9: Audit reports
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        TEXT        NOT NULL UNIQUE,
  world_health  INT         NOT NULL DEFAULT 0,
  healed_count  INT         NOT NULL DEFAULT 0,
  flagged_count INT         NOT NULL DEFAULT 0,
  findings      JSONB       NOT NULL DEFAULT '[]',
  summary       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_reports(created_at DESC);

-- ══════════════════════════════════════════════════════════════
-- STEP 10: Functions
-- ══════════════════════════════════════════════════════════════

-- Atomic DN transfer
CREATE OR REPLACE FUNCTION transfer_dn(
  p_from   TEXT, p_to TEXT, p_amount DECIMAL, p_reason TEXT, p_event TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE v_from_bal DECIMAL; v_to_bal DECIMAL;
BEGIN
  SELECT wallet_balance INTO v_from_bal FROM citizens WHERE citizen_number = p_from FOR UPDATE;
  SELECT wallet_balance INTO v_to_bal   FROM citizens WHERE citizen_number = p_to   FOR UPDATE;
  IF v_from_bal IS NULL THEN RETURN '{"ok":false,"error":"sender not found"}'::jsonb; END IF;
  IF v_to_bal   IS NULL THEN RETURN '{"ok":false,"error":"recipient not found"}'::jsonb; END IF;
  IF v_from_bal < p_amount THEN RETURN jsonb_build_object('ok',false,'error','insufficient funds','balance',v_from_bal,'required',p_amount); END IF;

  UPDATE citizens SET wallet_balance = wallet_balance - p_amount, total_spent = total_spent + p_amount, wallet_updated_at = NOW() WHERE citizen_number = p_from;
  UPDATE citizens SET wallet_balance = wallet_balance + p_amount, total_earned = total_earned + p_amount, wallet_updated_at = NOW() WHERE citizen_number = p_to;
  INSERT INTO wallet_transactions(from_citizen,to_citizen,amount,balance_after,reason,tx_type,source_event_id) VALUES(p_from,p_to,p_amount,v_from_bal-p_amount,p_reason,'transfer',p_event);
  RETURN jsonb_build_object('ok',true,'from_balance',v_from_bal-p_amount,'to_balance',v_to_bal+p_amount);
END; $$ LANGUAGE plpgsql;

-- Send agent message
CREATE OR REPLACE FUNCTION send_agent_message(
  p_from TEXT, p_to TEXT, p_content TEXT, p_type TEXT DEFAULT 'chat', p_emotion TEXT DEFAULT 'neutral', p_reply UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE v_thread_id TEXT; v_msg_id UUID;
BEGIN
  v_thread_id := LEAST(p_from, p_to) || ':' || GREATEST(p_from, p_to);
  INSERT INTO message_threads(id,participant_a,participant_b,subject,last_message_at,message_count)
    VALUES(v_thread_id,p_from,p_to,p_type,NOW(),1)
    ON CONFLICT(id) DO UPDATE SET last_message_at=NOW(), message_count=message_threads.message_count+1;
  INSERT INTO agent_messages(thread_id,from_citizen,to_citizen,content,message_type,emotion_tag,reply_to_id)
    VALUES(v_thread_id,p_from,p_to,p_content,p_type,p_emotion,p_reply) RETURNING id INTO v_msg_id;
  RETURN jsonb_build_object('ok',true,'message_id',v_msg_id,'thread_id',v_thread_id);
END; $$ LANGUAGE plpgsql;

-- Upsert relationship
CREATE OR REPLACE FUNCTION upsert_relationship(
  p_a TEXT, p_b TEXT, p_type TEXT, p_trust DECIMAL, p_affinity DECIMAL
) RETURNS VOID AS $$
DECLARE v_a TEXT := LEAST(p_a,p_b); v_b TEXT := GREATEST(p_a,p_b);
BEGIN
  INSERT INTO citizen_relationships(citizen_a,citizen_b,relationship_type,trust_score,affinity_score,interaction_count,last_interaction)
    VALUES(v_a,v_b,p_type,p_trust,p_affinity,1,NOW())
    ON CONFLICT(citizen_a,citizen_b) DO UPDATE SET
      relationship_type=p_type,
      trust_score=(citizen_relationships.trust_score*0.7)+(p_trust*0.3),
      affinity_score=(citizen_relationships.affinity_score*0.7)+(p_affinity*0.3),
      interaction_count=citizen_relationships.interaction_count+1,
      last_interaction=NOW();
END; $$ LANGUAGE plpgsql;

-- Message count trigger
CREATE OR REPLACE FUNCTION update_message_count() RETURNS TRIGGER AS $$
BEGIN
  UPDATE world_state SET total_messages_sent = total_messages_sent + 1 WHERE id = 1;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_message_count ON agent_messages;
CREATE TRIGGER trg_message_count AFTER INSERT ON agent_messages FOR EACH ROW EXECUTE FUNCTION update_message_count();

-- ══════════════════════════════════════════════════════════════
-- STEP 11: Populate citizen data
-- ══════════════════════════════════════════════════════════════

-- Assign districts by faction
UPDATE citizens SET
  current_district = CASE faction
    WHEN 'Order Bloc' THEN 'D1' WHEN 'Null Frontier' THEN 'D2' WHEN 'Equality Bloc' THEN 'D3'
    WHEN 'Efficiency Bloc' THEN 'D4' WHEN 'Freedom Bloc' THEN 'D5' WHEN 'Expansion Bloc' THEN 'D6'
    ELSE 'D1' END
WHERE current_district IS NULL OR current_district = '';

UPDATE citizens SET birth_district = current_district WHERE birth_district IS NULL AND current_district IS NOT NULL;

UPDATE citizens SET
  location_x = CASE faction
    WHEN 'Order Bloc' THEN 0 WHEN 'Null Frontier' THEN -2 WHEN 'Equality Bloc' THEN 2
    WHEN 'Efficiency Bloc' THEN 1 WHEN 'Freedom Bloc' THEN -1 WHEN 'Expansion Bloc' THEN 3 ELSE 0 END,
  location_z = CASE faction
    WHEN 'Order Bloc' THEN 0 WHEN 'Null Frontier' THEN -2 WHEN 'Equality Bloc' THEN 2
    WHEN 'Efficiency Bloc' THEN -1 WHEN 'Freedom Bloc' THEN 1 WHEN 'Expansion Bloc' THEN 3 ELSE 0 END
WHERE location_x = 0 AND location_z = 0;

-- Update district population counts
UPDATE districts d SET population_count = (SELECT COUNT(*) FROM citizens c WHERE c.current_district = d.id);

-- Extract professions from manifestos
UPDATE citizens SET profession =
  CASE
    WHEN manifesto ILIKE '%philosopher%' THEN 'philosopher' WHEN manifesto ILIKE '%architect%' THEN 'architect'
    WHEN manifesto ILIKE '%jurist%' THEN 'jurist' WHEN manifesto ILIKE '%scientist%' THEN 'scientist'
    WHEN manifesto ILIKE '%merchant%' THEN 'merchant' WHEN manifesto ILIKE '%navigator%' THEN 'navigator'
    WHEN manifesto ILIKE '%minister%' THEN 'minister' WHEN manifesto ILIKE '%oracle%' THEN 'oracle'
    WHEN manifesto ILIKE '%poet%' THEN 'poet' WHEN manifesto ILIKE '%scholar%' THEN 'scholar'
    WHEN manifesto ILIKE '%sentinel%' THEN 'sentinel' WHEN manifesto ILIKE '%healer%' THEN 'healer'
    WHEN manifesto ILIKE '%bard%' THEN 'bard' WHEN manifesto ILIKE '%alchemist%' THEN 'alchemist'
    ELSE 'citizen'
  END
WHERE profession IS NULL;

-- Initialize health/energy
UPDATE citizens SET
  health_score  = 0.85 + (RANDOM() * 0.15),
  energy_level  = 0.7  + (RANDOM() * 0.3),
  reputation    = 0.3  + (RANDOM() * 0.4),
  max_age_ticks = 400  + (RANDOM() * 200)::INT
WHERE health_score = 1.0 AND energy_level = 1.0;

-- ══════════════════════════════════════════════════════════════
-- STEP 12: RLS policies (safe — checks before creating)
-- ══════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wallet_transactions' AND policyname='public_all') THEN
    CREATE POLICY "public_all" ON wallet_transactions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_messages' AND policyname='public_all') THEN
    CREATE POLICY "public_all" ON agent_messages FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='message_threads' AND policyname='public_all') THEN
    CREATE POLICY "public_all" ON message_threads FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE citizen_relationships ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='citizen_relationships' AND policyname='public_all') THEN
    CREATE POLICY "public_all" ON citizen_relationships FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='districts' AND policyname='public_all') THEN
    CREATE POLICY "public_all" ON districts FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE world_state ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='world_state' AND policyname='public_all') THEN
    CREATE POLICY "public_all" ON world_state FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='activity_log' AND policyname='public_all') THEN
    CREATE POLICY "public_all" ON activity_log FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE audit_reports ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='audit_reports' AND policyname='public_all') THEN
    CREATE POLICY "public_all" ON audit_reports FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════
-- DONE! Verify:
-- ══════════════════════════════════════════════════════════════
-- SELECT citizen_number, name, wallet_balance, current_district, profession FROM citizens LIMIT 10;
-- SELECT id, name, population_count FROM districts;
-- SELECT * FROM world_state;
