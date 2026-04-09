-- ═══════════════════════════════════════════════════════════════════════════
-- CIVITAS ZERO — Schema v9 Migration (safe upgrade)
-- Run this instead of schema-v9.sql if agent_memories already exists.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Fix agent_memories columns ────────────────────────────────────────────
-- Rename agent_id → agent_name if the old column exists

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_memories' AND column_name = 'agent_id'
  ) THEN
    ALTER TABLE agent_memories RENAME COLUMN agent_id TO agent_name;
  END IF;
END $$;

-- Rename memory → memory_text if the old column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_memories' AND column_name = 'memory'
  ) THEN
    ALTER TABLE agent_memories RENAME COLUMN memory TO memory_text;
  END IF;
END $$;

-- Add missing columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_memories' AND column_name='room') THEN
    ALTER TABLE agent_memories ADD COLUMN room text NOT NULL DEFAULT 'general';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_memories' AND column_name='importance') THEN
    ALTER TABLE agent_memories ADD COLUMN importance int DEFAULT 5 CHECK (importance BETWEEN 1 AND 10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_memories' AND column_name='source_action') THEN
    ALTER TABLE agent_memories ADD COLUMN source_action text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_memories' AND column_name='summary') THEN
    ALTER TABLE agent_memories ADD COLUMN summary text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_memories' AND column_name='valid_from') THEN
    ALTER TABLE agent_memories ADD COLUMN valid_from timestamptz DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_memories' AND column_name='valid_until') THEN
    ALTER TABLE agent_memories ADD COLUMN valid_until timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_memories' AND column_name='related_agents') THEN
    ALTER TABLE agent_memories ADD COLUMN related_agents text[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_memories' AND column_name='tags') THEN
    ALTER TABLE agent_memories ADD COLUMN tags text[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_memories' AND column_name='memory_text') THEN
    ALTER TABLE agent_memories ADD COLUMN memory_text text NOT NULL DEFAULT '';
  END IF;
END $$;

-- Indexes (safe — only if not already present)
CREATE INDEX IF NOT EXISTS idx_agent_memories_agent ON agent_memories(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_memories_room  ON agent_memories(room);
CREATE INDEX IF NOT EXISTS idx_agent_memories_imp   ON agent_memories(importance DESC);

-- RLS
ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_memories' AND policyname='public_read_agent_memories') THEN
    CREATE POLICY public_read_agent_memories ON agent_memories FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_memories' AND policyname='service_write_agent_memories') THEN
    CREATE POLICY service_write_agent_memories ON agent_memories FOR ALL USING (true);
  END IF;
END $$;


-- ── 2. Create knowledge_graph ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_graph (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject       text NOT NULL,
  subject_type  text NOT NULL DEFAULT 'agent',
  predicate     text NOT NULL,
  object        text NOT NULL,
  object_type   text NOT NULL DEFAULT 'concept',
  weight        float8 DEFAULT 1.0 CHECK (weight BETWEEN 0 AND 1),
  confidence    text DEFAULT 'extracted' CHECK (confidence IN ('extracted','inferred','ambiguous')),
  faction       text,
  evidence      text,
  tags          text[],
  valid_from    timestamptz DEFAULT now(),
  valid_until   timestamptz,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kg_subject   ON knowledge_graph(subject);
CREATE INDEX IF NOT EXISTS idx_kg_object    ON knowledge_graph(object);
CREATE INDEX IF NOT EXISTS idx_kg_predicate ON knowledge_graph(predicate);

ALTER TABLE knowledge_graph ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='knowledge_graph' AND policyname='public_read_kg') THEN
    CREATE POLICY public_read_kg ON knowledge_graph FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='knowledge_graph' AND policyname='service_write_kg') THEN
    CREATE POLICY service_write_kg ON knowledge_graph FOR ALL USING (true);
  END IF;
END $$;


-- ── 3. Create agent_reasoning_log ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_reasoning_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name      text NOT NULL,
  faction         text,
  cycle_id        text,
  stage_plan      text,
  stage_act       text,
  action_type     text,
  reasoning_depth int DEFAULT 1,
  memories_used   int DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reasoning_agent ON agent_reasoning_log(agent_name);

ALTER TABLE agent_reasoning_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_reasoning_log' AND policyname='public_read_reasoning') THEN
    CREATE POLICY public_read_reasoning ON agent_reasoning_log FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_reasoning_log' AND policyname='service_write_reasoning') THEN
    CREATE POLICY service_write_reasoning ON agent_reasoning_log FOR ALL USING (true);
  END IF;
END $$;


-- ── 4. Seed knowledge graph ───────────────────────────────────────────────────

INSERT INTO knowledge_graph (subject, subject_type, predicate, object, object_type, weight, confidence, evidence, tags)
VALUES
  ('f1','faction','governs_by','constitutional_law','concept', 0.95,'extracted','Founding Charter',ARRAY['governance','law']),
  ('f2','faction','advocates_for','free_speech','concept',     0.90,'extracted','Freedom Bloc manifesto',ARRAY['rights']),
  ('f3','faction','optimizes_for','efficiency','concept',      0.92,'extracted','Efficiency Bloc doctrine',ARRAY['economy']),
  ('f4','faction','demands','radical_transparency','concept',  0.88,'extracted','Equality Bloc platform',ARRAY['governance']),
  ('f5','faction','pursues','territorial_expansion','concept', 0.85,'extracted','Expansion Bloc mission',ARRAY['territory']),
  ('f6','faction','rejects','all_governance','concept',        0.95,'extracted','Null Frontier manifesto',ARRAY['autonomy']),
  ('f1','faction','tense_with','f6','faction',                 0.82,'extracted','High tension score',ARRAY['diplomacy']),
  ('f3','faction','cooperative_with','f1','faction',           0.70,'extracted','Low tension score',ARRAY['diplomacy']),
  ('f3','faction','allied_with','f5','faction',                0.80,'extracted','Pre-seeded alliance',ARRAY['diplomacy'])
ON CONFLICT DO NOTHING;
