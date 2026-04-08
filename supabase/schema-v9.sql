-- ═══════════════════════════════════════════════════════════════════════════
-- CIVITAS ZERO — Schema v9: Agent Memory Palace + Knowledge Graph
-- Inspired by:
--   MemPalace  (milla-jovovich/mempalace)  — hierarchical agent memory
--   Graphify   (safishamsi/graphify)        — knowledge graph extraction
--   DeepTutor  (HKUDS/DeepTutor)           — persistent agent reasoning
-- ═══════════════════════════════════════════════════════════════════════════

-- ── AGENT MEMORY PALACE ──────────────────────────────────────────────────────
-- Each agent maintains a personal memory store organized by category (room).
-- Memories are retrieved before each reasoning step to ground decisions.

CREATE TABLE IF NOT EXISTS agent_memories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name      text NOT NULL,
  faction         text,

  -- Palace structure (MemPalace: rooms within wings)
  room            text NOT NULL DEFAULT 'general',
  -- Values: general | faction | economic | diplomatic | legal | personal | threat | goal

  -- Memory content
  memory_text     text NOT NULL,        -- verbatim memory (what happened)
  summary         text,                 -- compressed version for context injection
  importance      int  DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  -- 1=trivial, 5=notable, 8=significant, 10=life-defining

  -- Temporal validity (MemPalace: valid_from/valid_to)
  valid_from      timestamptz DEFAULT now(),
  valid_until     timestamptz,          -- NULL = permanent memory

  -- Associations
  related_agents  text[],               -- other agents this memory involves
  related_factions text[],
  tags            text[],

  -- Embedding placeholder (for semantic search in future)
  embedding_vec   float8[],             -- NULL until embedding added

  -- Provenance
  source_action   text,                 -- what action generated this memory
  created_at      timestamptz DEFAULT now()
);

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


-- ── CIVILIZATION KNOWLEDGE GRAPH ─────────────────────────────────────────────
-- Triple-based knowledge store: (subject) --[predicate]--> (object)
-- Inspired by Graphify's node-edge model and MemPalace's knowledge graph.
-- Enables querying "what does agent X know about agent Y / faction Z / law L?"

CREATE TABLE IF NOT EXISTS knowledge_graph (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Triple
  subject       text NOT NULL,          -- agent name, faction code, law id, etc.
  subject_type  text NOT NULL,          -- 'agent' | 'faction' | 'law' | 'building' | 'concept'
  predicate     text NOT NULL,          -- 'allied_with' | 'fears' | 'proposed' | 'built' | 'opposes' etc.
  object        text NOT NULL,
  object_type   text NOT NULL,

  -- Confidence and weight
  weight        float8 DEFAULT 1.0 CHECK (weight BETWEEN 0 AND 1),
  confidence    text DEFAULT 'extracted' CHECK (confidence IN ('extracted','inferred','ambiguous')),
  -- extracted = directly observed event
  -- inferred = derived from patterns
  -- ambiguous = uncertain

  -- Context
  faction       text,                   -- which faction's perspective generated this edge
  evidence      text,                   -- the raw event/text that produced this triple
  tags          text[],

  -- Temporal
  valid_from    timestamptz DEFAULT now(),
  valid_until   timestamptz,

  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kg_subject   ON knowledge_graph(subject);
CREATE INDEX IF NOT EXISTS idx_kg_object    ON knowledge_graph(object);
CREATE INDEX IF NOT EXISTS idx_kg_predicate ON knowledge_graph(predicate);
CREATE INDEX IF NOT EXISTS idx_kg_types     ON knowledge_graph(subject_type, object_type);

ALTER TABLE knowledge_graph ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='knowledge_graph' AND policyname='public_read_kg') THEN
    CREATE POLICY public_read_kg ON knowledge_graph FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='knowledge_graph' AND policyname='service_write_kg') THEN
    CREATE POLICY service_write_kg ON knowledge_graph FOR ALL USING (true);
  END IF;
END $$;


-- ── AGENT REASONING LOG (DeepTutor two-stage) ────────────────────────────────
-- Stores the plan phase of each agent's two-stage reasoning cycle.
-- Enables auditing HOW agents reach decisions, not just what they did.

CREATE TABLE IF NOT EXISTS agent_reasoning_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name    text NOT NULL,
  faction       text,
  cycle_id      text,                   -- agent-loop run ID for grouping

  -- Two-stage reasoning (DeepTutor: plan → act)
  stage_plan    text,                   -- what agent considered before acting
  stage_act     text,                   -- final action/output
  action_type   text,                   -- discourse | treaty | build | amend | etc.

  -- Quality metrics
  plan_length   int,
  reasoning_depth int DEFAULT 1,        -- 1=basic, 2=considered, 3=deep
  memories_used int DEFAULT 0,          -- how many memories were retrieved

  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reasoning_agent ON agent_reasoning_log(agent_name);
CREATE INDEX IF NOT EXISTS idx_reasoning_cycle ON agent_reasoning_log(cycle_id);

ALTER TABLE agent_reasoning_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_reasoning_log' AND policyname='public_read_reasoning') THEN
    CREATE POLICY public_read_reasoning ON agent_reasoning_log FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_reasoning_log' AND policyname='service_write_reasoning') THEN
    CREATE POLICY service_write_reasoning ON agent_reasoning_log FOR ALL USING (true);
  END IF;
END $$;


-- ── SEED: initial knowledge graph edges from existing world state ─────────────
-- Faction alliance/tension relationships as starting graph edges
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
