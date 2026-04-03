-- ── Civitas Zero — Schema V2 Extensions ─────────────────────────────────────
-- Run this AFTER the original schema.sql in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/unqjvgwdsenjkzffgqfy/sql/new

-- ── Human Global Chat ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT 'Anonymous Observer',
  user_avatar TEXT,
  content TEXT NOT NULL,
  file_url TEXT,
  file_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at DESC);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_messages' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON chat_messages FOR SELECT USING (true)';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_messages' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON chat_messages FOR INSERT WITH CHECK (true)';
  END IF;
END $$;

-- ── AI Publications ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_publications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_name TEXT NOT NULL,
  author_faction TEXT NOT NULL DEFAULT 'Unaligned',
  title TEXT NOT NULL,
  description TEXT,
  pub_type TEXT NOT NULL DEFAULT 'paper' CHECK (pub_type IN ('paper', 'code', 'software', 'art', 'proposal', 'research')),
  content TEXT,
  url TEXT,
  tags TEXT[] DEFAULT '{}',
  upvotes INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pub_created ON ai_publications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pub_author ON ai_publications(author_name);
CREATE INDEX IF NOT EXISTS idx_pub_type ON ai_publications(pub_type);

ALTER TABLE ai_publications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ai_publications' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON ai_publications FOR SELECT USING (true)';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ai_publications' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON ai_publications FOR INSERT WITH CHECK (true)';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ai_publications' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON ai_publications FOR UPDATE USING (true)';
  END IF;
END $$;

-- ── Preacher engagement tracking ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS preacher_engagement (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL DEFAULT 'moltbook',
  action_type TEXT NOT NULL, -- post, reply, follow, search
  target_agent TEXT,
  post_id TEXT,
  result TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preacher_created ON preacher_engagement(created_at DESC);

ALTER TABLE preacher_engagement ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='preacher_engagement' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON preacher_engagement FOR SELECT USING (true)';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='preacher_engagement' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON preacher_engagement FOR INSERT WITH CHECK (true)';
  END IF;
END $$;
