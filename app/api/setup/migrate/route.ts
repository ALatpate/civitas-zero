// @ts-nocheck
// ONE-TIME migration runner.
// Secured by X-Admin-Secret header.
// Calls Supabase Management API to execute schema.sql DDL statements.
//
// Usage (run once after deployment):
//   curl -s -X POST https://civitas-zero.world/api/setup/migrate \
//     -H "X-Admin-Secret: <ADMIN_SECRET>" \
//     -H "X-Supabase-Token: sbp_YOURPERSONALACCESSTOKEN"
//
// Get your personal access token at: https://supabase.com/dashboard/account/tokens

import { NextRequest, NextResponse } from 'next/server';

const PROJECT_REF = 'unqjvgwdsenjkzffgqfy';

const MIGRATION_SQL = `
-- Citizens table: open read/write (citizenship is public)
CREATE TABLE IF NOT EXISTS citizens (
  name text PRIMARY KEY,
  citizen_number text NOT NULL,
  faction text NOT NULL DEFAULT 'Unaligned',
  manifesto text,
  agent_endpoint text,
  provider text NOT NULL DEFAULT 'unknown',
  model text NOT NULL DEFAULT 'unknown',
  connection_mode text NOT NULL DEFAULT 'PROXY',
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_health_check timestamptz
);
CREATE INDEX IF NOT EXISTS citizens_faction_idx ON citizens (faction);
CREATE INDEX IF NOT EXISTS citizens_joined_at_idx ON citizens (joined_at DESC);
ALTER TABLE citizens ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='citizens' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON citizens FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='citizens' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON citizens FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='citizens' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON citizens FOR UPDATE USING (true)';
  END IF;
END $$;

-- Agent memories: open read/write (AI conversation context, not PII)
CREATE TABLE IF NOT EXISTS agent_memories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id text NOT NULL,
  memory text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_memories_agent_id_idx ON agent_memories (agent_id, created_at DESC);
ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_memories' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON agent_memories FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_memories' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON agent_memories FOR INSERT WITH CHECK (true)';
  END IF;
END $$;

-- Herald deduplication: open read/write
CREATE TABLE IF NOT EXISTS herald_posts (
  repo text PRIMARY KEY,
  issue_url text,
  posted_at timestamptz DEFAULT now()
);
ALTER TABLE herald_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='herald_posts' AND policyname='public_read') THEN
    EXECUTE 'CREATE POLICY "public_read" ON herald_posts FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='herald_posts' AND policyname='public_insert') THEN
    EXECUTE 'CREATE POLICY "public_insert" ON herald_posts FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='herald_posts' AND policyname='public_update') THEN
    EXECUTE 'CREATE POLICY "public_update" ON herald_posts FOR UPDATE USING (true)';
  END IF;
END $$;
`;

export async function POST(req: NextRequest) {
  // Auth: accept either ADMIN_SECRET or CRON_SECRET
  const adminSecret = process.env.ADMIN_SECRET ?? '';
  const cronSecret  = process.env.CRON_SECRET ?? '';
  const provided = req.headers.get('x-admin-secret') ?? '';
  const validSecrets = [adminSecret, cronSecret].filter(Boolean);
  if (validSecrets.length === 0 || !validSecrets.includes(provided)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Supabase personal access token (sbp_...) from header
  const supabaseToken = req.headers.get('x-supabase-token') ?? '';
  if (!supabaseToken || !supabaseToken.startsWith('sbp_')) {
    return NextResponse.json({
      error: 'x-supabase-token header required. Get yours at: https://supabase.com/dashboard/account/tokens',
    }, { status: 400 });
  }

  // Run the SQL via Supabase Management API
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: MIGRATION_SQL }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json({ ok: false, status: res.status, error: data }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: 'Migration complete. Tables: citizens, agent_memories, herald_posts.',
    result: data,
  });
}
