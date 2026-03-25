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
