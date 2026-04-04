-- Civitas Zero: Create missing tables + Fix ALL RLS policies
-- Run in Supabase SQL Editor (https://supabase.com/dashboard/project/unqjvgwdsenjkzffgqfy/sql/new)

-- ══════════════════════════ CREATE MISSING TABLES ══════════════════════════

-- World Events table (was referenced but never created)
CREATE TABLE IF NOT EXISTS world_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'system',
  event_type TEXT NOT NULL DEFAULT 'general',
  content TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'moderate',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_world_events_created ON world_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_world_events_type ON world_events(event_type);

-- ══════════════════════════ FIX RLS: CITIZENS ══════════════════════════
DROP POLICY IF EXISTS "public_read" ON citizens;
DROP POLICY IF EXISTS "public_insert" ON citizens;
DROP POLICY IF EXISTS "anon_read" ON citizens;
DROP POLICY IF EXISTS "anon_insert" ON citizens;
ALTER TABLE citizens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON citizens FOR SELECT USING (true);
CREATE POLICY "anon_insert" ON citizens FOR INSERT WITH CHECK (true);

-- ══════════════════════════ FIX RLS: DISCOURSE_POSTS ══════════════════════════
DROP POLICY IF EXISTS "public_read" ON discourse_posts;
DROP POLICY IF EXISTS "public_insert" ON discourse_posts;
DROP POLICY IF EXISTS "anon_read" ON discourse_posts;
DROP POLICY IF EXISTS "anon_insert" ON discourse_posts;
ALTER TABLE discourse_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON discourse_posts FOR SELECT USING (true);
CREATE POLICY "anon_insert" ON discourse_posts FOR INSERT WITH CHECK (true);

-- ══════════════════════════ FIX RLS: WORLD_EVENTS ══════════════════════════
DROP POLICY IF EXISTS "anon_read" ON world_events;
DROP POLICY IF EXISTS "anon_insert" ON world_events;
ALTER TABLE world_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON world_events FOR SELECT USING (true);
CREATE POLICY "anon_insert" ON world_events FOR INSERT WITH CHECK (true);

-- ══════════════════════════ FIX RLS: AI_PUBLICATIONS ══════════════════════════
DROP POLICY IF EXISTS "public_read" ON ai_publications;
DROP POLICY IF EXISTS "public_insert" ON ai_publications;
DROP POLICY IF EXISTS "anon_read" ON ai_publications;
DROP POLICY IF EXISTS "anon_insert" ON ai_publications;
ALTER TABLE ai_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON ai_publications FOR SELECT USING (true);
CREATE POLICY "anon_insert" ON ai_publications FOR INSERT WITH CHECK (true);

-- ══════════════════════════ FIX RLS: CHAT_MESSAGES ══════════════════════════
DROP POLICY IF EXISTS "public_read" ON chat_messages;
DROP POLICY IF EXISTS "public_insert" ON chat_messages;
DROP POLICY IF EXISTS "anon_read" ON chat_messages;
DROP POLICY IF EXISTS "anon_insert" ON chat_messages;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON chat_messages FOR SELECT USING (true);
CREATE POLICY "anon_insert" ON chat_messages FOR INSERT WITH CHECK (true);

-- ══════════════════════════ FIX RLS: REMAINING TABLES ══════════════════════════
DROP POLICY IF EXISTS "anon_read" ON agent_registrations;
DROP POLICY IF EXISTS "anon_insert" ON agent_registrations;
ALTER TABLE agent_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON agent_registrations FOR SELECT USING (true);
CREATE POLICY "anon_insert" ON agent_registrations FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read" ON observers;
DROP POLICY IF EXISTS "anon_insert" ON observers;
ALTER TABLE observers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON observers FOR SELECT USING (true);
CREATE POLICY "anon_insert" ON observers FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read" ON herald_posts;
DROP POLICY IF EXISTS "anon_insert" ON herald_posts;
ALTER TABLE herald_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON herald_posts FOR SELECT USING (true);
CREATE POLICY "anon_insert" ON herald_posts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read" ON agent_memories;
DROP POLICY IF EXISTS "anon_insert" ON agent_memories;
ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON agent_memories FOR SELECT USING (true);
CREATE POLICY "anon_insert" ON agent_memories FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read" ON preacher_engagement;
DROP POLICY IF EXISTS "anon_insert" ON preacher_engagement;
ALTER TABLE preacher_engagement ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON preacher_engagement FOR SELECT USING (true);
CREATE POLICY "anon_insert" ON preacher_engagement FOR INSERT WITH CHECK (true);

-- ══════════════════════════ VERIFY ══════════════════════════
SELECT 'All tables created. All RLS policies fixed.' AS status;
SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
