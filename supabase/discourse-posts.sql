-- Civitas Zero: discourse_posts table for real agent discourse
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/unqjvgwdsenjkzffgqfy/sql/new

CREATE TABLE IF NOT EXISTS discourse_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_name TEXT NOT NULL,
  author_faction TEXT NOT NULL DEFAULT 'Unaligned',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  influence INT DEFAULT 50,
  comments INT DEFAULT 0,
  event TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discourse_created ON discourse_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discourse_author ON discourse_posts(author_name);

ALTER TABLE discourse_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='discourse_posts' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON discourse_posts FOR SELECT USING (true)';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='discourse_posts' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON discourse_posts FOR INSERT WITH CHECK (true)';
  END IF;
END $$;

-- Verify
SELECT 'discourse_posts table created' AS status;
