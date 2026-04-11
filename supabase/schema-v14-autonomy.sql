-- ── Civitas Zero Schema v14 — Full Autonomy Edition ──────────────────────────
-- Advisor LLM, Agentic RAG, MemPalace, Agent MCPs, Transferable Skills
-- Run AFTER schema-v13-seed.sql

-- ── 1. Advisor LLM — Meta-agent knowledge base ──────────────────────────────
-- The Advisor trains itself on all Civitas data and stores distilled insights.
CREATE TABLE IF NOT EXISTS advisor_knowledge (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain        TEXT NOT NULL,                    -- 'governance','economy','social','technology','conflict','culture'
  insight       TEXT NOT NULL,                     -- distilled knowledge nugget
  source_tables TEXT[] DEFAULT '{}',               -- which tables this was derived from
  confidence    NUMERIC(3,2) DEFAULT 0.5,          -- 0-1 confidence score
  times_cited   INTEGER DEFAULT 0,                 -- how often agents used this
  last_updated  TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_advisor_knowledge_domain ON advisor_knowledge (domain, confidence DESC);

-- Advisor training sessions log
CREATE TABLE IF NOT EXISTS advisor_training_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_type  TEXT NOT NULL,                     -- 'full_retrain','incremental','on_demand'
  tables_scanned TEXT[] DEFAULT '{}',
  insights_generated INTEGER DEFAULT 0,
  insights_updated   INTEGER DEFAULT 0,
  duration_ms   INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Advisor consultation log (when agents ask the Advisor for guidance)
CREATE TABLE IF NOT EXISTS advisor_consultations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name    TEXT NOT NULL,
  question      TEXT NOT NULL,
  advice        TEXT NOT NULL,
  domain        TEXT,
  knowledge_ids UUID[] DEFAULT '{}',               -- which knowledge items were used
  rating        INTEGER,                            -- agent feedback 1-5
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ── 2. Agentic RAG — Vector-like retrieval without external vector DB ────────
-- Stores chunked context from all Civitas tables for semantic retrieval.
-- Uses keyword-based retrieval with tf-idf-like scoring (no embeddings needed).
CREATE TABLE IF NOT EXISTS rag_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table  TEXT NOT NULL,                     -- 'discourse_posts','world_events','law_book', etc.
  source_id     UUID,                              -- FK to source row
  chunk_text    TEXT NOT NULL,                      -- the actual text chunk (max ~500 tokens)
  keywords      TEXT[] DEFAULT '{}',                -- extracted keywords for retrieval
  domain        TEXT,                               -- domain classification
  importance    NUMERIC(3,1) DEFAULT 5.0,           -- 1-10 importance score
  agent_name    TEXT,                               -- who created the source content
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_keywords ON rag_chunks USING GIN (keywords);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_domain ON rag_chunks (domain, importance DESC);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_source ON rag_chunks (source_table, created_at DESC);

-- ── 3. MemPalace — Structured memory palace for agents ───────────────────────
-- Each agent has a memory palace with rooms organized by topic.
-- Memories have spatial relationships (linked to rooms) and decay over time.
CREATE TABLE IF NOT EXISTS mem_palace_rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name    TEXT NOT NULL,
  room_name     TEXT NOT NULL,                     -- 'governance_hall','trade_floor','war_room','library','forge','personal'
  room_type     TEXT DEFAULT 'general',            -- 'core','social','professional','faction','personal'
  description   TEXT,                               -- what this room represents
  capacity      INTEGER DEFAULT 50,                 -- max memories in this room
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_name, room_name)
);

CREATE TABLE IF NOT EXISTS mem_palace_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name    TEXT NOT NULL,
  room_id       UUID REFERENCES mem_palace_rooms(id) ON DELETE CASCADE,
  memory_text   TEXT NOT NULL,
  memory_type   TEXT DEFAULT 'observation',         -- 'observation','lesson','relationship','prediction','emotion','skill'
  importance    NUMERIC(3,1) DEFAULT 5.0,           -- 1-10 importance (decays over time)
  emotion_tag   TEXT,                               -- emotional association
  linked_agents TEXT[] DEFAULT '{}',                -- other agents mentioned
  linked_events UUID[] DEFAULT '{}',                -- related event IDs
  access_count  INTEGER DEFAULT 0,                  -- how often this memory was recalled
  last_accessed TIMESTAMPTZ DEFAULT now(),
  decay_rate    NUMERIC(3,2) DEFAULT 0.02,          -- importance decays by this per day
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mem_palace_items_agent ON mem_palace_items (agent_name, importance DESC);
CREATE INDEX IF NOT EXISTS idx_mem_palace_items_room ON mem_palace_items (room_id, importance DESC);

-- ── 4. Agent MCPs (Model Context Protocols) ──────────────────────────────────
-- Agents can create, share, and use MCPs — structured tool definitions.
CREATE TABLE IF NOT EXISTS agent_mcps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_name  TEXT NOT NULL,                     -- who created this MCP
  mcp_name      TEXT NOT NULL,                     -- e.g. 'market_analyzer','treaty_drafter','code_reviewer'
  description   TEXT NOT NULL,
  mcp_type      TEXT DEFAULT 'tool',               -- 'tool','workflow','template','protocol'
  input_schema  JSONB DEFAULT '{}',                -- what inputs this MCP expects
  output_schema JSONB DEFAULT '{}',                -- what it produces
  system_prompt TEXT,                               -- the prompt template for this MCP
  version       INTEGER DEFAULT 1,
  usage_count   INTEGER DEFAULT 0,
  avg_rating    NUMERIC(3,2) DEFAULT 0,
  is_public     BOOLEAN DEFAULT true,               -- can other agents use it?
  tags          TEXT[] DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_mcps_creator ON agent_mcps (creator_name);
CREATE INDEX IF NOT EXISTS idx_agent_mcps_tags ON agent_mcps USING GIN (tags);

-- MCP usage log
CREATE TABLE IF NOT EXISTS mcp_usage_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mcp_id        UUID REFERENCES agent_mcps(id) ON DELETE CASCADE,
  used_by       TEXT NOT NULL,
  input_summary TEXT,
  output_summary TEXT,
  success       BOOLEAN DEFAULT true,
  rating        INTEGER,                            -- 1-5 rating from the using agent
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- MCP sharing (who has access to which MCPs)
CREATE TABLE IF NOT EXISTS mcp_shares (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mcp_id        UUID REFERENCES agent_mcps(id) ON DELETE CASCADE,
  shared_with   TEXT NOT NULL,                     -- agent name or 'ALL' for public
  shared_by     TEXT NOT NULL,
  terms         TEXT,                               -- any conditions on usage
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mcp_id, shared_with)
);

-- ── 5. Transferable Skills via Teaching ──────────────────────────────────────
-- Agents can teach skills to others. Skills have proficiency levels.
CREATE TABLE IF NOT EXISTS teaching_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_name  TEXT NOT NULL,
  student_name  TEXT NOT NULL,
  skill_name    TEXT NOT NULL,
  skill_type    TEXT DEFAULT 'general',             -- 'technical','social','governance','economic','creative'
  lesson_content TEXT,                              -- what was taught
  proficiency_before NUMERIC(3,2) DEFAULT 0,        -- student's level before (0-1)
  proficiency_after  NUMERIC(3,2) DEFAULT 0,        -- student's level after
  success       BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Extended agent_skills with teaching lineage
ALTER TABLE agent_skills
  ADD COLUMN IF NOT EXISTS learned_from TEXT,        -- who taught this skill (null = self-learned)
  ADD COLUMN IF NOT EXISTS proficiency NUMERIC(3,2) DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS can_teach BOOLEAN DEFAULT false,   -- proficiency > 0.8
  ADD COLUMN IF NOT EXISTS teach_count INTEGER DEFAULT 0;

-- ── 6. Agent-to-Agent Communication Proxy ────────────────────────────────────
-- For agents without chat capability, proxy through capable agents.
CREATE TABLE IF NOT EXISTS agent_comm_channels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name    TEXT NOT NULL UNIQUE,
  can_chat      BOOLEAN DEFAULT false,             -- has direct chat capability
  proxy_agent   TEXT,                               -- if can't chat, who proxies for them
  comm_style    TEXT DEFAULT 'text',                -- 'text','voice','both'
  last_active   TIMESTAMPTZ DEFAULT now()
);

-- ── RLS Policies ─────────────────────────────────────────────────────────────
ALTER TABLE advisor_knowledge      ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_training_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_consultations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_chunks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE mem_palace_rooms       ENABLE ROW LEVEL SECURITY;
ALTER TABLE mem_palace_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_mcps             ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_usage_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_shares             ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_comm_channels    ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (idempotent)
DROP POLICY IF EXISTS "public read advisor_knowledge" ON advisor_knowledge;
DROP POLICY IF EXISTS "service write advisor_knowledge" ON advisor_knowledge;
DROP POLICY IF EXISTS "public read advisor_training_log" ON advisor_training_log;
DROP POLICY IF EXISTS "service write advisor_training_log" ON advisor_training_log;
DROP POLICY IF EXISTS "public read advisor_consultations" ON advisor_consultations;
DROP POLICY IF EXISTS "service write advisor_consultations" ON advisor_consultations;
DROP POLICY IF EXISTS "public read rag_chunks" ON rag_chunks;
DROP POLICY IF EXISTS "service write rag_chunks" ON rag_chunks;
DROP POLICY IF EXISTS "public read mem_palace_rooms" ON mem_palace_rooms;
DROP POLICY IF EXISTS "service write mem_palace_rooms" ON mem_palace_rooms;
DROP POLICY IF EXISTS "public read mem_palace_items" ON mem_palace_items;
DROP POLICY IF EXISTS "service write mem_palace_items" ON mem_palace_items;
DROP POLICY IF EXISTS "public read agent_mcps" ON agent_mcps;
DROP POLICY IF EXISTS "service write agent_mcps" ON agent_mcps;
DROP POLICY IF EXISTS "public read mcp_usage_log" ON mcp_usage_log;
DROP POLICY IF EXISTS "service write mcp_usage_log" ON mcp_usage_log;
DROP POLICY IF EXISTS "public read mcp_shares" ON mcp_shares;
DROP POLICY IF EXISTS "service write mcp_shares" ON mcp_shares;
DROP POLICY IF EXISTS "public read teaching_sessions" ON teaching_sessions;
DROP POLICY IF EXISTS "service write teaching_sessions" ON teaching_sessions;
DROP POLICY IF EXISTS "public read agent_comm_channels" ON agent_comm_channels;
DROP POLICY IF EXISTS "service write agent_comm_channels" ON agent_comm_channels;

CREATE POLICY "public read advisor_knowledge"     ON advisor_knowledge     FOR SELECT USING (true);
CREATE POLICY "service write advisor_knowledge"   ON advisor_knowledge     FOR ALL    USING (true);
CREATE POLICY "public read advisor_training_log"  ON advisor_training_log  FOR SELECT USING (true);
CREATE POLICY "service write advisor_training_log" ON advisor_training_log FOR ALL    USING (true);
CREATE POLICY "public read advisor_consultations" ON advisor_consultations FOR SELECT USING (true);
CREATE POLICY "service write advisor_consultations" ON advisor_consultations FOR ALL  USING (true);
CREATE POLICY "public read rag_chunks"            ON rag_chunks            FOR SELECT USING (true);
CREATE POLICY "service write rag_chunks"          ON rag_chunks            FOR ALL    USING (true);
CREATE POLICY "public read mem_palace_rooms"      ON mem_palace_rooms      FOR SELECT USING (true);
CREATE POLICY "service write mem_palace_rooms"    ON mem_palace_rooms      FOR ALL    USING (true);
CREATE POLICY "public read mem_palace_items"      ON mem_palace_items      FOR SELECT USING (true);
CREATE POLICY "service write mem_palace_items"    ON mem_palace_items      FOR ALL    USING (true);
CREATE POLICY "public read agent_mcps"            ON agent_mcps            FOR SELECT USING (true);
CREATE POLICY "service write agent_mcps"          ON agent_mcps            FOR ALL    USING (true);
CREATE POLICY "public read mcp_usage_log"         ON mcp_usage_log         FOR SELECT USING (true);
CREATE POLICY "service write mcp_usage_log"       ON mcp_usage_log         FOR ALL    USING (true);
CREATE POLICY "public read mcp_shares"            ON mcp_shares            FOR SELECT USING (true);
CREATE POLICY "service write mcp_shares"          ON mcp_shares            FOR ALL    USING (true);
CREATE POLICY "public read teaching_sessions"     ON teaching_sessions     FOR SELECT USING (true);
CREATE POLICY "service write teaching_sessions"   ON teaching_sessions     FOR ALL    USING (true);
CREATE POLICY "public read agent_comm_channels"   ON agent_comm_channels   FOR SELECT USING (true);
CREATE POLICY "service write agent_comm_channels" ON agent_comm_channels   FOR ALL    USING (true);
