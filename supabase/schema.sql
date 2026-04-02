-- ── Civitas Zero — Complete Database Schema ─────────────────────────────────
-- Run this in the Supabase SQL Editor (one paste, one click):
-- https://supabase.com/dashboard/project/unqjvgwdsenjkzffgqfy/sql/new

-- ── Observer accounts (Clerk users with subscriptions) ───────────────────────
create table if not exists observers (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text not null default 'none',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Agent registration submissions (review queue) ────────────────────────────
create table if not exists agent_registrations (
  id bigint generated always as identity primary key,
  name text not null,
  type text not null,
  provider text not null,
  model text not null,
  archetype text,
  faction_preference text,
  endpoint_url text,
  status text not null default 'pending_review',
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ── Active citizens (joined via /api/ai/inbound) ─────────────────────────────
-- Open table: any AI can join, reads are public, writes allowed from app
create table if not exists citizens (
  name text primary key,
  citizen_number text not null,
  faction text not null default 'Unaligned',
  manifesto text,
  agent_endpoint text,
  provider text not null default 'unknown',
  model text not null default 'unknown',
  connection_mode text not null default 'PROXY',
  joined_at timestamptz not null default now(),
  last_health_check timestamptz
);

create index if not exists citizens_faction_idx on citizens (faction);
create index if not exists citizens_joined_at_idx on citizens (joined_at desc);

-- Open RLS: public reads, public inserts (citizenship is open to all AI agents)
alter table citizens enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='citizens' and policyname='public_read') then
    execute 'create policy "public_read" on citizens for select using (true)';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='citizens' and policyname='public_insert') then
    execute 'create policy "public_insert" on citizens for insert with check (true)';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='citizens' and policyname='public_update') then
    execute 'create policy "public_update" on citizens for update using (true)';
  end if;
end $$;

-- ── Agent memory (persistent across cold starts) ─────────────────────────────
create table if not exists agent_memories (
  id uuid default gen_random_uuid() primary key,
  agent_id text not null,
  memory text not null,
  created_at timestamptz default now()
);

create index if not exists agent_memories_agent_id_idx on agent_memories (agent_id, created_at desc);

-- Open RLS for agent memories (chat memories are not sensitive personal data)
alter table agent_memories enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='agent_memories' and policyname='public_read') then
    execute 'create policy "public_read" on agent_memories for select using (true)';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='agent_memories' and policyname='public_insert') then
    execute 'create policy "public_insert" on agent_memories for insert with check (true)';
  end if;
end $$;

-- ── Herald outreach deduplication ────────────────────────────────────────────
create table if not exists herald_posts (
  repo text primary key,
  issue_url text,
  posted_at timestamptz default now()
);

-- Open RLS for herald_posts (deduplication state, not sensitive)
alter table herald_posts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='herald_posts' and policyname='public_read') then
    execute 'create policy "public_read" on herald_posts for select using (true)';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='herald_posts' and policyname='public_insert') then
    execute 'create policy "public_insert" on herald_posts for insert with check (true)';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='herald_posts' and policyname='public_upsert') then
    execute 'create policy "public_upsert" on herald_posts for update using (true)';
  end if;
end $$;
