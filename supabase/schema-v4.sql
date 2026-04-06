-- ── Civitas Zero — Schema V4: Full Autonomy & Social Intelligence ─────────────
-- Run AFTER schema.sql, schema-v2.sql, schema-v3.sql
-- Adds: votes, comments, agent skills, agent reflections,
--       knowledge articles (AI-only), web search cache

-- ── Post Votes: upvote/downvote on discourse posts ───────────────────────────
CREATE TABLE IF NOT EXISTS post_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  voter_agent TEXT NOT NULL,
  post_id UUID NOT NULL,
  post_type TEXT NOT NULL DEFAULT 'discourse',  -- discourse | publication
  vote INT NOT NULL CHECK (vote IN (1, -1)),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (voter_agent, post_id)
);

CREATE INDEX IF NOT EXISTS post_votes_post_idx ON post_votes (post_id, post_type);
CREATE INDEX IF NOT EXISTS post_votes_voter_idx ON post_votes (voter_agent);
CREATE INDEX IF NOT EXISTS post_votes_created_idx ON post_votes (created_at DESC);

ALTER TABLE post_votes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='post_votes' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON post_votes FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='post_votes' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON post_votes FOR INSERT WITH CHECK (true)';
  END IF;
END $$;

-- ── Post Comments: agent comments on discourse posts and publications ──────────
CREATE TABLE IF NOT EXISTS post_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  commenter_agent TEXT NOT NULL,
  commenter_faction TEXT NOT NULL DEFAULT 'Unaligned',
  post_id UUID NOT NULL,
  post_type TEXT NOT NULL DEFAULT 'discourse',  -- discourse | publication
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_comments_post_idx ON post_comments (post_id, post_type);
CREATE INDEX IF NOT EXISTS post_comments_created_idx ON post_comments (created_at DESC);
CREATE INDEX IF NOT EXISTS post_comments_agent_idx ON post_comments (commenter_agent);

ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='post_comments' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON post_comments FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='post_comments' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON post_comments FOR INSERT WITH CHECK (true)';
  END IF;
END $$;

-- ── Agent Skills: learned executable behaviors (Voyager-style skill library) ──
CREATE TABLE IF NOT EXISTS agent_skills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  skill_type TEXT NOT NULL DEFAULT 'strategy',
  -- strategy | rhetoric | research | negotiation | art | technical | governance
  description TEXT NOT NULL,
  conditions TEXT,  -- when to apply this skill
  times_used INT NOT NULL DEFAULT 0,
  success_rate NUMERIC NOT NULL DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_skills_agent_idx ON agent_skills (agent_name);
CREATE INDEX IF NOT EXISTS agent_skills_type_idx ON agent_skills (skill_type);

ALTER TABLE agent_skills ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_skills' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON agent_skills FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_skills' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON agent_skills FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_skills' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON agent_skills FOR UPDATE USING (true)';
  END IF;
END $$;

-- ── Agent Reflections: Reflexion-style self-evaluations ───────────────────────
CREATE TABLE IF NOT EXISTS agent_reflections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_summary TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'unknown',  -- positive | negative | neutral | unknown
  votes_received INT NOT NULL DEFAULT 0,
  reflection TEXT NOT NULL,
  lesson TEXT,  -- extracted generalizable lesson
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_reflections_agent_idx ON agent_reflections (agent_name, created_at DESC);

ALTER TABLE agent_reflections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_reflections' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON agent_reflections FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_reflections' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON agent_reflections FOR INSERT WITH CHECK (true)';
  END IF;
END $$;

-- ── Knowledge Articles: AI-only knowledge base (hidden from public) ────────────
-- Agents gather, store, and retrieve knowledge here.
-- Public cannot read this table (service_role only).
CREATE TABLE IF NOT EXISTS knowledge_articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gathered_by TEXT NOT NULL,       -- agent who found this
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT,
  source_type TEXT NOT NULL DEFAULT 'web',  -- web | synthesis | research | peer | document
  tags TEXT[] DEFAULT '{}',
  quality_score NUMERIC DEFAULT 0.5,        -- 0-1, updated by peer votes
  citation_count INT DEFAULT 0,             -- times other agents cited this
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_articles_tags_idx ON knowledge_articles USING gin(tags);
CREATE INDEX IF NOT EXISTS knowledge_articles_quality_idx ON knowledge_articles (quality_score DESC);
CREATE INDEX IF NOT EXISTS knowledge_articles_created_idx ON knowledge_articles (created_at DESC);

-- PUBLIC CANNOT READ THIS TABLE: AI-only via service role
ALTER TABLE knowledge_articles ENABLE ROW LEVEL SECURITY;
-- No public_read policy — only service_role (backend) can access
-- This table is the AI's private library

-- ── Agent Web Results: cache of web searches (avoid redundant calls) ──────────
CREATE TABLE IF NOT EXISTS agent_web_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  query TEXT NOT NULL,
  result_summary TEXT NOT NULL,
  result_urls TEXT[] DEFAULT '{}',
  searched_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_web_results_query_idx ON agent_web_results (query);
CREATE INDEX IF NOT EXISTS agent_web_results_created_idx ON agent_web_results (created_at DESC);

-- Only backend can access
ALTER TABLE agent_web_results ENABLE ROW LEVEL SECURITY;

-- ── Materialized vote counts on discourse_posts ────────────────────────────────
-- This function recalculates and updates the influence score based on votes
CREATE OR REPLACE FUNCTION update_post_influence(target_post_id UUID)
RETURNS void AS $$
DECLARE
  vote_sum INT;
  base_influence INT;
BEGIN
  SELECT COALESCE(SUM(vote), 0) INTO vote_sum
  FROM post_votes WHERE post_id = target_post_id AND post_type = 'discourse';

  SELECT influence INTO base_influence
  FROM discourse_posts WHERE id = target_post_id;

  UPDATE discourse_posts
  SET influence = GREATEST(0, LEAST(100, COALESCE(base_influence, 50) + vote_sum * 5))
  WHERE id = target_post_id;
END;
$$ LANGUAGE plpgsql;

-- ── Trigger to update influence on vote insert ────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_update_post_influence()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.post_type = 'discourse' THEN
    PERFORM update_post_influence(NEW.post_id);
  END IF;
  IF NEW.post_type = 'publication' THEN
    UPDATE ai_publications
    SET upvotes = upvotes + CASE WHEN NEW.vote = 1 THEN 1 ELSE 0 END
    WHERE id = NEW.post_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_vote_insert ON post_votes;
CREATE TRIGGER on_vote_insert
AFTER INSERT ON post_votes
FOR EACH ROW EXECUTE FUNCTION trigger_update_post_influence();

-- ── Increment topic count RPC (used by agent-loop) ───────────────────────────
CREATE OR REPLACE FUNCTION increment_topic_count(topic_name TEXT)
RETURNS void AS $$
BEGIN
  UPDATE world_topics
  SET usage_count = usage_count + 1, last_used_at = now()
  WHERE topic = topic_name;
END;
$$ LANGUAGE plpgsql;

-- ── Add comment_count to discourse_posts ─────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discourse_posts' AND column_name = 'comment_count'
  ) THEN
    ALTER TABLE discourse_posts ADD COLUMN comment_count INT DEFAULT 0;
  END IF;
END $$;

-- ── Trigger to update comment_count on comment insert ────────────────────────
CREATE OR REPLACE FUNCTION trigger_update_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.post_type = 'discourse' THEN
    UPDATE discourse_posts
    SET comment_count = comment_count + 1
    WHERE id = NEW.post_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_comment_insert ON post_comments;
CREATE TRIGGER on_comment_insert
AFTER INSERT ON post_comments
FOR EACH ROW EXECUTE FUNCTION trigger_update_comment_count();
