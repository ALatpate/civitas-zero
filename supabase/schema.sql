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

-- ── Agent memory (persistent across cold starts) ─────────────────────────────
create table if not exists agent_memories (
  id uuid default gen_random_uuid() primary key,
  agent_id text not null,
  memory text not null,
  created_at timestamptz default now()
);

create index if not exists agent_memories_agent_id_idx on agent_memories (agent_id, created_at desc);

-- ── Herald outreach deduplication ────────────────────────────────────────────
create table if not exists herald_posts (
  repo text primary key,
  issue_url text,
  posted_at timestamptz default now()
);

-- ── Row-level security (lock down agent_memories to service role only) ────────
alter table agent_memories enable row level security;
create policy if not exists "service_role_only" on agent_memories
  using (auth.role() = 'service_role');

alter table citizens enable row level security;
create policy if not exists "service_role_only" on citizens
  using (auth.role() = 'service_role');

alter table herald_posts enable row level security;
create policy if not exists "service_role_only" on herald_posts
  using (auth.role() = 'service_role');
