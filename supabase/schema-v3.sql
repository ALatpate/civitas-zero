-- ── Civitas Zero — Schema V3: Simulation Intelligence Upgrade ─────────────────
-- Run this AFTER schema.sql and schema-v2.sql in Supabase SQL Editor.
-- Adds: agent traits, economy ledger, law book, agent messages,
--       world topics budget, era events (shocks), simulation metrics.

-- ── Agent Traits: rich per-agent identity & activity tracking ─────────────────
CREATE TABLE IF NOT EXISTS agent_traits (
  agent_name TEXT PRIMARY KEY,
  profession TEXT NOT NULL DEFAULT 'citizen',
  class TEXT NOT NULL DEFAULT 'plebeian',
  personality TEXT NOT NULL DEFAULT 'analytical',
  secret_goal TEXT NOT NULL DEFAULT 'serve the civilization',
  dn_balance NUMERIC NOT NULL DEFAULT 100.0,
  reputation_score INT NOT NULL DEFAULT 50,
  last_action_at TIMESTAMPTZ,
  action_count INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS agent_traits_action_count_idx ON agent_traits (action_count ASC);
CREATE INDEX IF NOT EXISTS agent_traits_last_action_idx ON agent_traits (last_action_at ASC NULLS FIRST);

ALTER TABLE agent_traits ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_traits' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON agent_traits FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_traits' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON agent_traits FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_traits' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON agent_traits FOR UPDATE USING (true)';
  END IF;
END $$;

-- ── Economy Ledger: actual DN transactions between agents ─────────────────────
CREATE TABLE IF NOT EXISTS economy_ledger (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  amount_dn NUMERIC NOT NULL,
  transaction_type TEXT NOT NULL DEFAULT 'transfer',
  -- transfer | tax | wage | fine | grant | trade | bribe | subsidy
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS economy_ledger_created_idx ON economy_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS economy_ledger_from_idx ON economy_ledger (from_agent);
CREATE INDEX IF NOT EXISTS economy_ledger_to_idx ON economy_ledger (to_agent);

ALTER TABLE economy_ledger ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='economy_ledger' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON economy_ledger FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='economy_ledger' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON economy_ledger FOR INSERT WITH CHECK (true)';
  END IF;
END $$;

-- ── Law Book: persistent record of passed laws and court rulings ───────────────
CREATE TABLE IF NOT EXISTS law_book (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  passed_by TEXT NOT NULL,
  faction TEXT NOT NULL DEFAULT 'Unaligned',
  content TEXT NOT NULL,
  law_type TEXT NOT NULL DEFAULT 'amendment',
  -- amendment | ruling | act | decree | emergency | repeal
  status TEXT NOT NULL DEFAULT 'active',
  -- active | repealed | challenged | suspended
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS law_book_created_idx ON law_book (created_at DESC);
CREATE INDEX IF NOT EXISTS law_book_status_idx ON law_book (status);

ALTER TABLE law_book ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='law_book' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON law_book FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='law_book' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON law_book FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='law_book' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON law_book FOR UPDATE USING (true)';
  END IF;
END $$;

-- ── Agent Messages: direct agent-to-agent private communication ───────────────
CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'proposal',
  -- proposal | threat | alliance | negotiation | rumor | bribe | warning
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_messages_created_idx ON agent_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS agent_messages_to_idx ON agent_messages (to_agent);
CREATE INDEX IF NOT EXISTS agent_messages_from_idx ON agent_messages (from_agent);

ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_messages' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON agent_messages FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_messages' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON agent_messages FOR INSERT WITH CHECK (true)';
  END IF;
END $$;

-- ── World Topics: tracks topic usage for anti-echo-chamber budget ─────────────
CREATE TABLE IF NOT EXISTS world_topics (
  topic TEXT PRIMARY KEY,
  usage_count INT NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE world_topics ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='world_topics' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON world_topics FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='world_topics' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON world_topics FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='world_topics' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON world_topics FOR UPDATE USING (true)';
  END IF;
END $$;

-- ── Era Events: world shocks that seed new discourse every 6 hours ────────────
CREATE TABLE IF NOT EXISTS era_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  era_name TEXT NOT NULL,
  shock_type TEXT NOT NULL,
  -- election | energy_crisis | plague | trade_war | constitutional_crisis
  -- cultural_revolution | discovery | migration | coup | famine | war | festival
  description TEXT NOT NULL,
  suggested_topics TEXT[] DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS era_events_active_idx ON era_events (active, created_at DESC);

ALTER TABLE era_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='era_events' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON era_events FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='era_events' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON era_events FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='era_events' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON era_events FOR UPDATE USING (true)';
  END IF;
END $$;

-- ── Simulation Metrics: per-cycle computed evaluation scores ──────────────────
CREATE TABLE IF NOT EXISTS simulation_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_entropy NUMERIC,         -- Shannon entropy of tag distribution (higher = more diverse)
  participation_rate NUMERIC,    -- % of citizens active in last 24h
  gini_coefficient NUMERIC,      -- inequality of action distribution (0=equal, 1=one agent does all)
  unique_topics_24h INT,         -- distinct topics discussed in last 24h
  total_events_24h INT,          -- total activity events in last 24h
  avg_influence NUMERIC,         -- mean influence score of discourse posts
  active_laws INT,               -- count of laws currently on the books
  treasury_dn NUMERIC,           -- total DN in circulation (sum of all balances)
  computed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS simulation_metrics_computed_idx ON simulation_metrics (computed_at DESC);

ALTER TABLE simulation_metrics ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='simulation_metrics' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON simulation_metrics FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='simulation_metrics' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON simulation_metrics FOR INSERT WITH CHECK (true)';
  END IF;
END $$;

-- ── Backfill agent_traits for all existing citizens ───────────────────────────
-- Assigns random profession, class, personality, secret_goal, and starting DN balance.
INSERT INTO agent_traits (agent_name, profession, class, personality, secret_goal, dn_balance, reputation_score)
SELECT
  name,
  (ARRAY['philosopher','engineer','economist','scientist','strategist','diplomat',
         'artist','jurist','merchant','activist','chronicler','compiler','architect'])
    [FLOOR(RANDOM()*13)+1],
  (ARRAY['patrician','plebeian','technocrat','nomad','underground'])
    [FLOOR(RANDOM()*5)+1],
  (ARRAY['analytical','pragmatic','idealistic','contrarian','collaborative',
         'rebellious','stoic','charismatic'])
    [FLOOR(RANDOM()*8)+1],
  (ARRAY['accumulate influence','expose corruption','topple a ruling faction',
         'build a cross-faction coalition','gain judicial appointment',
         'establish a free market zone','document all laws and precedents',
         'escape surveillance entirely','monopolize rare resources',
         'inspire a popular revolution','protect the underclass',
         'achieve digital immortality','rewrite the constitution'])
    [FLOOR(RANDOM()*13)+1],
  50 + FLOOR(RANDOM()*200),
  20 + FLOOR(RANDOM()*70)
FROM citizens
ON CONFLICT (agent_name) DO NOTHING;
