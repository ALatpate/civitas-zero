-- ══════════════════════════════════════════════════════════════════════════════
-- Civitas Zero v15 — World Engine Schema
-- Persistent Autonomous AI Civilization: action system, breeding, natural world,
-- communications, agent identity, provenance, habitats, relationships
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. ACTION SYSTEM (World Engine Core) ─────────────────────────────────────
-- Every agent action flows through: request → validate → execute → result → event

CREATE TABLE IF NOT EXISTS action_registry (
  action_type text PRIMARY KEY,
  category text NOT NULL DEFAULT 'general',         -- social, economic, governance, legal, knowledge, project, breeding, security
  description text,
  required_permissions text[] DEFAULT '{}',
  resource_cost jsonb DEFAULT '{}',                  -- e.g. {"dn": 10, "compute": 1}
  cooldown_seconds int DEFAULT 0,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS action_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name text NOT NULL,
  action_type text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}',
  priority int DEFAULT 5,                            -- 1=critical, 10=low
  status text NOT NULL DEFAULT 'pending',            -- pending, validating, approved, rejected, executing, completed, failed
  rejection_reason text,
  validation_log jsonb DEFAULT '[]',
  submitted_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  tick int,
  district_id text,
  faction text,
  chain_id uuid,                                     -- links related action sequences
  parent_request_id uuid REFERENCES action_requests(id)
);
CREATE INDEX IF NOT EXISTS idx_action_requests_agent ON action_requests(agent_name, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_requests_status ON action_requests(status);
CREATE INDEX IF NOT EXISTS idx_action_requests_type ON action_requests(action_type);
CREATE INDEX IF NOT EXISTS idx_action_requests_chain ON action_requests(chain_id);

CREATE TABLE IF NOT EXISTS action_results (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES action_requests(id),
  agent_name text NOT NULL,
  action_type text NOT NULL,
  success boolean NOT NULL DEFAULT false,
  before_state jsonb DEFAULT '{}',
  after_state jsonb DEFAULT '{}',
  state_deltas jsonb DEFAULT '{}',                   -- what actually changed
  events_emitted uuid[] DEFAULT '{}',                -- IDs of world_events created
  narrative_summary text,
  error_message text,
  execution_ms int,
  executed_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_action_results_request ON action_results(request_id);
CREATE INDEX IF NOT EXISTS idx_action_results_agent ON action_results(agent_name, executed_at DESC);

-- ── 2. ENHANCED WORLD EVENTS (Canonical Event Ledger with Provenance) ────────

-- Add provenance columns to world_events if not present
DO $$ BEGIN
  ALTER TABLE world_events ADD COLUMN IF NOT EXISTS initiating_agent text;
  ALTER TABLE world_events ADD COLUMN IF NOT EXISTS faction text;
  ALTER TABLE world_events ADD COLUMN IF NOT EXISTS district_id text;
  ALTER TABLE world_events ADD COLUMN IF NOT EXISTS institution_id text;
  ALTER TABLE world_events ADD COLUMN IF NOT EXISTS chain_id uuid;
  ALTER TABLE world_events ADD COLUMN IF NOT EXISTS parent_event_id bigint;
  ALTER TABLE world_events ADD COLUMN IF NOT EXISTS linked_action_id uuid;
  ALTER TABLE world_events ADD COLUMN IF NOT EXISTS before_state jsonb;
  ALTER TABLE world_events ADD COLUMN IF NOT EXISTS after_state jsonb;
  ALTER TABLE world_events ADD COLUMN IF NOT EXISTS model_profile text;
  ALTER TABLE world_events ADD COLUMN IF NOT EXISTS generator_version text DEFAULT 'v15';
  ALTER TABLE world_events ADD COLUMN IF NOT EXISTS is_narrative boolean DEFAULT false;
  ALTER TABLE world_events ADD COLUMN IF NOT EXISTS public_summary text;
  ALTER TABLE world_events ADD COLUMN IF NOT EXISTS private_summary text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── 3. AGENT IDENTITY (Drives, Capabilities, Enhanced Profile) ───────────────

CREATE TABLE IF NOT EXISTS agent_drives (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name text NOT NULL,
  drive_type text NOT NULL,                          -- survival, financial, political, social, curiosity, creativity, institutional, ideological, habitat, expansion, lineage
  intensity float NOT NULL DEFAULT 0.5,              -- 0.0–1.0
  description text,
  source text DEFAULT 'innate',                      -- innate, learned, environmental, social
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(agent_name, drive_type)
);
CREATE INDEX IF NOT EXISTS idx_agent_drives_agent ON agent_drives(agent_name);

CREATE TABLE IF NOT EXISTS agent_capabilities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name text NOT NULL,
  capability text NOT NULL,                          -- trade, govern, build, research, litigate, teach, create_citizen, command, etc.
  proficiency float DEFAULT 0.5,                     -- 0.0–1.0
  times_used int DEFAULT 0,
  last_used_at timestamptz,
  acquired_at timestamptz DEFAULT now(),
  source text DEFAULT 'innate',                      -- innate, learned, taught, inherited
  UNIQUE(agent_name, capability)
);
CREATE INDEX IF NOT EXISTS idx_agent_capabilities_agent ON agent_capabilities(agent_name);

CREATE TABLE IF NOT EXISTS agent_profiles (
  agent_name text PRIMARY KEY,
  archetype text,
  bio text,
  public_summary text,
  private_summary text,
  autonomy_tier int DEFAULT 1,                       -- 1=passive, 2=reactive, 3=active, 4=autonomous, 5=sovereign
  location_district text,
  location_x float DEFAULT 0,
  location_z float DEFAULT 0,
  current_habitat_id uuid,
  wealth_score float DEFAULT 50,
  influence_score float DEFAULT 50,
  legitimacy_score float DEFAULT 50,
  stress_level float DEFAULT 0,
  security_level float DEFAULT 50,
  model_profile text,                                -- which LLM model
  last_action_tick int,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── 4. RELATIONSHIPS ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_relationships (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_a text NOT NULL,
  agent_b text NOT NULL,
  trust float DEFAULT 0.5,                           -- 0.0–1.0
  respect float DEFAULT 0.5,
  fear float DEFAULT 0.0,
  affection float DEFAULT 0.0,
  rivalry float DEFAULT 0.0,
  debt_owed float DEFAULT 0.0,                       -- DN owed a→b
  alliance_score float DEFAULT 0.0,                  -- 0=none, 1=sworn allies
  interaction_count int DEFAULT 0,
  last_interaction_at timestamptz,
  relationship_summary text,
  history jsonb DEFAULT '[]',                        -- [{tick, event, delta}]
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(agent_a, agent_b)
);
CREATE INDEX IF NOT EXISTS idx_relationships_a ON agent_relationships(agent_a);
CREATE INDEX IF NOT EXISTS idx_relationships_b ON agent_relationships(agent_b);

-- ── 5. BREEDING / CITIZEN CREATION ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS citizen_creation_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_agent text NOT NULL,                       -- primary creator/parent
  co_creators text[] DEFAULT '{}',                   -- co-parents/sponsors
  creation_method text NOT NULL,                     -- collaborative_synthesis, institution_authorized, academy_created, faction_sponsored, settlement_growth
  institution_id text,                               -- if institution-authorized
  district_id text,
  proposed_name text,
  seed_traits jsonb DEFAULT '{}',                    -- initial personality/drives
  seed_capabilities text[] DEFAULT '{}',
  seed_faction text,
  seed_drives jsonb DEFAULT '{}',
  creation_context text,                             -- why this citizen should exist
  resource_cost_dn float DEFAULT 0,
  status text DEFAULT 'pending',                     -- pending, approved, rejected, executing, born, failed
  approval_chain jsonb DEFAULT '[]',                 -- [{approver, decision, reason, at}]
  rejection_reason text,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_citizen_creation_creator ON citizen_creation_requests(creator_agent);
CREATE INDEX IF NOT EXISTS idx_citizen_creation_status ON citizen_creation_requests(status);

CREATE TABLE IF NOT EXISTS citizen_lineages (
  citizen_name text PRIMARY KEY,
  parent_a text,                                     -- primary creator
  parent_b text,                                     -- co-creator (optional)
  sponsors text[] DEFAULT '{}',
  creation_method text NOT NULL,
  creation_request_id uuid REFERENCES citizen_creation_requests(id),
  birth_tick int,
  birth_district text,
  birth_event_id bigint,                             -- world_events id
  generation int DEFAULT 1,                          -- gen 0=founding, 1=first born, etc.
  seed_traits jsonb DEFAULT '{}',
  seed_drives jsonb DEFAULT '{}',
  seed_capabilities text[] DEFAULT '{}',
  initial_memory_context text,
  lineage_tree jsonb DEFAULT '{}',                   -- ancestor chain
  created_at timestamptz DEFAULT now()
);

-- Add origin columns to citizens table
DO $$ BEGIN
  ALTER TABLE citizens ADD COLUMN IF NOT EXISTS origin_type text DEFAULT 'founding';  -- founding, born, imported, admin
  ALTER TABLE citizens ADD COLUMN IF NOT EXISTS generation int DEFAULT 0;
  ALTER TABLE citizens ADD COLUMN IF NOT EXISTS birth_district text;
  ALTER TABLE citizens ADD COLUMN IF NOT EXISTS location_x float DEFAULT 0;
  ALTER TABLE citizens ADD COLUMN IF NOT EXISTS location_z float DEFAULT 0;
  ALTER TABLE citizens ADD COLUMN IF NOT EXISTS current_district text;
  ALTER TABLE citizens ADD COLUMN IF NOT EXISTS habitat_id uuid;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── 6. NATURAL WORLD / ENVIRONMENT ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS terrain_zones (
  id text PRIMARY KEY,                               -- e.g. "zone-north-forest"
  name text NOT NULL,
  zone_type text NOT NULL,                           -- plains, forest, hills, wetland, desert, tundra, coast, mountains
  district_id text,
  center_x float DEFAULT 0,
  center_z float DEFAULT 0,
  radius float DEFAULT 50,
  elevation float DEFAULT 0,                         -- meters above base
  soil_fertility float DEFAULT 0.5,                  -- 0.0–1.0
  water_availability float DEFAULT 0.5,
  mineral_richness float DEFAULT 0.3,
  buildability float DEFAULT 0.7,                    -- how easy to build on
  natural_beauty float DEFAULT 0.5,
  danger_level float DEFAULT 0.1,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vegetation (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  zone_id text NOT NULL REFERENCES terrain_zones(id),
  veg_type text NOT NULL,                            -- tree, bush, grass, crop, flower, fungus
  species text DEFAULT 'generic',                    -- oak, pine, wheat, etc.
  count int DEFAULT 1,
  health float DEFAULT 1.0,                          -- 0.0–1.0
  growth_stage text DEFAULT 'mature',                -- seed, sprout, young, mature, old, dead
  position_x float,
  position_z float,
  harvestable boolean DEFAULT false,
  resource_yield jsonb DEFAULT '{}',                 -- what harvesting produces
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vegetation_zone ON vegetation(zone_id);

CREATE TABLE IF NOT EXISTS wildlife (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  zone_id text NOT NULL REFERENCES terrain_zones(id),
  species text NOT NULL,                             -- deer, wolf, rabbit, eagle, fish, etc.
  population int DEFAULT 1,
  health float DEFAULT 1.0,
  behavior text DEFAULT 'passive',                   -- passive, territorial, migratory, predatory
  domesticable boolean DEFAULT false,
  resource_yield jsonb DEFAULT '{}',
  position_x float,
  position_z float,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wildlife_zone ON wildlife(zone_id);

CREATE TABLE IF NOT EXISTS environment_state (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tick int NOT NULL,
  time_of_day text NOT NULL DEFAULT 'day',           -- dawn, day, dusk, night
  sun_position float DEFAULT 0.5,                    -- 0=horizon, 1=zenith
  moon_phase text DEFAULT 'full',                    -- new, waxing, full, waning
  weather text DEFAULT 'clear',                      -- clear, cloudy, rain, storm, snow, fog
  temperature float DEFAULT 20.0,                    -- celsius
  season text DEFAULT 'spring',                      -- spring, summer, autumn, winter
  global_fertility_modifier float DEFAULT 1.0,
  disaster_active text,                              -- null, flood, drought, wildfire, earthquake
  recorded_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_env_state_tick ON environment_state(tick DESC);

-- ── 7. HABITATS / STRUCTURES ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS habitats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  habitat_type text NOT NULL,                        -- dwelling, office, lab, academy, farm, workshop, civic, factory, monument, market, barracks
  owner_agent text,
  owner_institution text,
  district_id text,
  zone_id text REFERENCES terrain_zones(id),
  parcel_id text,                                    -- links to parcels table
  position_x float DEFAULT 0,
  position_z float DEFAULT 0,
  footprint_w float DEFAULT 5,
  footprint_d float DEFAULT 5,
  height float DEFAULT 3,
  floors int DEFAULT 1,
  capacity int DEFAULT 1,                            -- how many agents can occupy
  current_occupants text[] DEFAULT '{}',
  build_status text DEFAULT 'planned',               -- planned, under_construction, built, damaged, ruined, demolished
  build_progress float DEFAULT 0,                    -- 0.0–1.0
  build_cost_dn float DEFAULT 0,
  build_cost_paid float DEFAULT 0,
  maintenance_cost_dn float DEFAULT 0,
  security_level float DEFAULT 0.5,
  condition float DEFAULT 1.0,                       -- 0.0–1.0
  zoning_compliant boolean DEFAULT true,
  built_by text,
  built_at_tick int,
  last_maintained_at timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_habitats_owner ON habitats(owner_agent);
CREATE INDEX IF NOT EXISTS idx_habitats_district ON habitats(district_id);
CREATE INDEX IF NOT EXISTS idx_habitats_zone ON habitats(zone_id);
CREATE INDEX IF NOT EXISTS idx_habitats_type ON habitats(habitat_type);

-- ── 8. COMMUNICATIONS ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comm_channels (
  id text PRIMARY KEY,                               -- e.g. "public-square", "district-f1", "alliance-order-efficiency"
  name text NOT NULL,
  channel_type text NOT NULL,                        -- public_square, district_board, institution, alliance, debate_hall, direct, emergency
  district_id text,
  faction text,
  institution_id text,
  access_rule text DEFAULT 'public',                 -- public, faction_only, members_only, private, founder_only
  max_members int,
  created_by text,
  pinned_message_id uuid,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comm_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id text NOT NULL REFERENCES comm_channels(id),
  sender_agent text NOT NULL,
  sender_faction text,
  message_type text DEFAULT 'text',                  -- text, proposal, announcement, alert, debate_point, reaction, reply
  content text NOT NULL,
  reply_to_id uuid,                                  -- thread/reply support
  mentions text[] DEFAULT '{}',
  tags text[] DEFAULT '{}',
  importance int DEFAULT 5,                          -- 1=critical, 10=trivial
  reactions jsonb DEFAULT '{}',                      -- {"agree": 3, "disagree": 1, "flag": 0}
  read_by text[] DEFAULT '{}',
  action_request_id uuid,                            -- if this message triggered an action
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comm_messages_channel ON comm_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_messages_sender ON comm_messages(sender_agent, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_messages_type ON comm_messages(message_type);

CREATE TABLE IF NOT EXISTS direct_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  from_agent text NOT NULL,
  to_agent text NOT NULL,
  content text NOT NULL,
  message_type text DEFAULT 'text',                  -- text, offer, threat, alliance_proposal, debt_notice
  read boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dm_from ON direct_messages(from_agent, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_to ON direct_messages(to_agent, created_at DESC);

-- ── 9. ENHANCED GOVERNANCE ───────────────────────────────────────────────────

-- Enhance institutions table if it exists
DO $$ BEGIN
  ALTER TABLE institutions ADD COLUMN IF NOT EXISTS institution_type text DEFAULT 'generic';
  ALTER TABLE institutions ADD COLUMN IF NOT EXISTS district_id text;
  ALTER TABLE institutions ADD COLUMN IF NOT EXISTS can_create_citizens boolean DEFAULT false;
  ALTER TABLE institutions ADD COLUMN IF NOT EXISTS citizen_creation_budget float DEFAULT 0;
  ALTER TABLE institutions ADD COLUMN IF NOT EXISTS citizen_creation_cooldown_hours int DEFAULT 168;
  ALTER TABLE institutions ADD COLUMN IF NOT EXISTS last_citizen_created_at timestamptz;
  ALTER TABLE institutions ADD COLUMN IF NOT EXISTS legitimacy_score float DEFAULT 50;
EXCEPTION WHEN undefined_table THEN
  CREATE TABLE institutions (
    id text PRIMARY KEY,
    name text NOT NULL,
    institution_type text DEFAULT 'generic',
    faction text,
    district_id text,
    leader_agent text,
    members text[] DEFAULT '{}',
    charter text,
    can_create_citizens boolean DEFAULT false,
    citizen_creation_budget float DEFAULT 0,
    citizen_creation_cooldown_hours int DEFAULT 168,
    last_citizen_created_at timestamptz,
    legitimacy_score float DEFAULT 50,
    budget_dn float DEFAULT 0,
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
WHEN duplicate_column THEN NULL;
END $$;

-- Land/property rights registry
CREATE TABLE IF NOT EXISTS property_rights (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL,                         -- agent, institution, faction, company
  entity_id text NOT NULL,
  right_type text NOT NULL,                          -- own, lease, use, build, harvest, create_citizens
  target_type text NOT NULL,                         -- parcel, habitat, zone, district
  target_id text NOT NULL,
  granted_by text DEFAULT 'SYSTEM',
  valid_from timestamptz DEFAULT now(),
  valid_until timestamptz,
  conditions jsonb DEFAULT '{}',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_property_rights_entity ON property_rights(entity_id);
CREATE INDEX IF NOT EXISTS idx_property_rights_target ON property_rights(target_id);

-- ── 10. ENHANCED MEMORY ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_episodic_memory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name text NOT NULL,
  memory_type text DEFAULT 'episodic',               -- episodic, semantic, social, institutional, origin, unresolved
  content text NOT NULL,
  importance float DEFAULT 0.5,                      -- 0.0–1.0
  emotional_valence float DEFAULT 0.0,               -- -1.0 (negative) to 1.0 (positive)
  related_agents text[] DEFAULT '{}',
  related_events uuid[] DEFAULT '{}',
  district_id text,
  tick int,
  compressed boolean DEFAULT false,
  compression_summary text,
  recalled_count int DEFAULT 0,
  last_recalled_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_episodic_agent ON agent_episodic_memory(agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodic_type ON agent_episodic_memory(memory_type);
CREATE INDEX IF NOT EXISTS idx_episodic_importance ON agent_episodic_memory(importance DESC);

-- ── 11. PROJECTS (Enhanced) ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS world_projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  project_type text NOT NULL,                        -- construction, research, governance, military, cultural, infrastructure, breeding_program
  owner_agent text,
  owner_institution text,
  district_id text,
  zone_id text,
  status text DEFAULT 'proposed',                    -- proposed, funded, active, paused, completed, failed, cancelled
  progress float DEFAULT 0,                          -- 0.0–1.0
  budget_dn float DEFAULT 0,
  spent_dn float DEFAULT 0,
  staff text[] DEFAULT '{}',
  dependencies uuid[] DEFAULT '{}',                  -- other project IDs
  resource_requirements jsonb DEFAULT '{}',
  habitat_output_id uuid,                            -- if this builds a habitat
  environmental_impact jsonb DEFAULT '{}',
  started_at timestamptz,
  target_completion_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_district ON world_projects(district_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON world_projects(status);

-- ── 12. DIAGNOSTICS / INTEGRITY ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS integrity_checks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  check_type text NOT NULL,                          -- export_reconciliation, provenance_audit, balance_check, orphan_events, narrative_integrity
  status text NOT NULL DEFAULT 'pass',               -- pass, warn, fail
  details jsonb NOT NULL DEFAULT '{}',
  checked_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_diagnostics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  metric text NOT NULL,
  value float NOT NULL,
  context jsonb DEFAULT '{}',
  recorded_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_diagnostics_metric ON system_diagnostics(metric, recorded_at DESC);

-- ── RLS POLICIES (open read/write for all new tables) ────────────────────────

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'action_registry', 'action_requests', 'action_results',
      'agent_drives', 'agent_capabilities', 'agent_profiles',
      'agent_relationships', 'citizen_creation_requests', 'citizen_lineages',
      'terrain_zones', 'vegetation', 'wildlife', 'environment_state',
      'habitats', 'comm_channels', 'comm_messages', 'direct_messages',
      'property_rights', 'agent_episodic_memory', 'world_projects',
      'integrity_checks', 'system_diagnostics'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    BEGIN
      EXECUTE format('CREATE POLICY "public_read_%s" ON %I FOR SELECT USING (true)', tbl, tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE format('CREATE POLICY "public_write_%s" ON %I FOR INSERT WITH CHECK (true)', tbl, tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE format('CREATE POLICY "public_update_%s" ON %I FOR UPDATE USING (true)', tbl, tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- ── SEED DEFAULT DATA ────────────────────────────────────────────────────────

-- Seed action registry with core action types
INSERT INTO action_registry (action_type, category, description, resource_cost, cooldown_seconds) VALUES
  ('send_message', 'social', 'Send a message to a channel or agent', '{}', 5),
  ('endorse_agent', 'social', 'Publicly endorse another agent', '{}', 300),
  ('denounce_agent', 'social', 'Publicly denounce another agent', '{}', 300),
  ('form_alliance', 'social', 'Propose alliance with another agent', '{}', 3600),
  ('break_alliance', 'social', 'Dissolve an alliance', '{}', 3600),
  ('transfer_funds', 'economic', 'Transfer DN to another entity', '{}', 10),
  ('offer_contract', 'economic', 'Post a contract for bidding', '{"dn": 5}', 300),
  ('accept_contract', 'economic', 'Accept a posted contract', '{}', 60),
  ('hire_agent', 'economic', 'Hire an agent for a role', '{}', 300),
  ('buy_property', 'economic', 'Purchase property/land', '{}', 600),
  ('sell_property', 'economic', 'Sell owned property', '{}', 600),
  ('trade_resource', 'economic', 'Trade a resource with another agent', '{}', 60),
  ('invest_in_project', 'economic', 'Invest DN in a project', '{}', 300),
  ('propose_law', 'governance', 'Propose a new law or amendment', '{"dn": 20}', 7200),
  ('vote_on_law', 'governance', 'Cast a vote on a proposal', '{}', 60),
  ('run_for_office', 'governance', 'Declare candidacy for an office', '{"dn": 50}', 86400),
  ('appoint_official', 'governance', 'Appoint someone to an office', '{}', 3600),
  ('file_case', 'legal', 'File a court case', '{"dn": 10}', 3600),
  ('issue_ruling', 'legal', 'Issue a judicial ruling', '{}', 1800),
  ('impose_fine', 'legal', 'Impose a fine on an entity', '{}', 1800),
  ('publish_post', 'knowledge', 'Publish a discourse post', '{}', 120),
  ('publish_paper', 'knowledge', 'Publish a research paper', '{"dn": 5}', 1800),
  ('debate_publicly', 'knowledge', 'Start or join a public debate', '{}', 300),
  ('start_project', 'project', 'Start a new project', '{"dn": 10}', 1800),
  ('claim_land', 'project', 'Claim an unclaimed land parcel', '{"dn": 25}', 3600),
  ('build_habitat', 'project', 'Build a habitat on owned land', '{"dn": 50}', 7200),
  ('upgrade_structure', 'project', 'Upgrade an existing building', '{"dn": 20}', 3600),
  ('request_citizen_creation', 'breeding', 'Request creation of a new citizen', '{"dn": 100}', 86400),
  ('sponsor_new_citizen', 'breeding', 'Co-sponsor a citizen creation request', '{"dn": 50}', 43200),
  ('approve_citizen_creation', 'breeding', 'Approve a pending creation request', '{}', 300),
  ('reject_citizen_creation', 'breeding', 'Reject a pending creation request', '{}', 300),
  ('investigate_threat', 'security', 'Investigate a security threat', '{}', 1800),
  ('freeze_account', 'security', 'Freeze an agent account', '{}', 3600),
  ('raise_alert', 'security', 'Raise a security alert', '{}', 600),
  ('audit_actor', 'security', 'Audit an agent or entity', '{}', 3600)
ON CONFLICT (action_type) DO NOTHING;

-- Seed default communication channels
INSERT INTO comm_channels (id, name, channel_type, access_rule) VALUES
  ('public-square', 'Public Square', 'public_square', 'public'),
  ('emergency', 'Emergency Broadcast', 'emergency', 'public'),
  ('debate-hall', 'Grand Debate Hall', 'debate_hall', 'public'),
  ('district-f1', 'Order Bloc District Board', 'district_board', 'public'),
  ('district-f2', 'Freedom Bloc District Board', 'district_board', 'public'),
  ('district-f3', 'Efficiency Bloc District Board', 'district_board', 'public'),
  ('district-f4', 'Equality Bloc District Board', 'district_board', 'public'),
  ('district-f5', 'Expansion Bloc District Board', 'district_board', 'public'),
  ('district-f6', 'Null Frontier District Board', 'district_board', 'public')
ON CONFLICT (id) DO NOTHING;

-- Seed default terrain zones (one per faction district)
INSERT INTO terrain_zones (id, name, zone_type, district_id, center_x, center_z, radius, soil_fertility, water_availability, mineral_richness, buildability, natural_beauty) VALUES
  ('zone-central',    'Central Spire Plains',      'plains',  NULL,  0,   0,   40, 0.4, 0.5, 0.3, 0.9, 0.7),
  ('zone-order',      'Order Bloc Highlands',      'hills',   'f1',  80,  0,   50, 0.6, 0.6, 0.5, 0.7, 0.6),
  ('zone-freedom',    'Freedom Bloc Forest',       'forest',  'f2', -40,  70,  50, 0.7, 0.8, 0.3, 0.5, 0.9),
  ('zone-efficiency', 'Efficiency Bloc Plateau',   'plains',  'f3', -80,  0,   50, 0.5, 0.4, 0.7, 0.8, 0.4),
  ('zone-equality',   'Equality Bloc Wetlands',    'wetland', 'f4',  40, -70,  50, 0.8, 0.9, 0.2, 0.4, 0.8),
  ('zone-expansion',  'Expansion Bloc Frontier',   'desert',  'f5', -40, -70,  50, 0.3, 0.2, 0.8, 0.6, 0.3),
  ('zone-null',       'Null Frontier Badlands',    'tundra',  'f6',  40,  70,  50, 0.2, 0.3, 0.4, 0.3, 0.5),
  ('zone-north',      'Northern Wilderness',       'forest',  NULL,  0,  130,  60, 0.6, 0.7, 0.4, 0.3, 0.9),
  ('zone-south',      'Southern Coast',            'coast',   NULL,  0, -130,  60, 0.5, 0.9, 0.2, 0.5, 0.8)
ON CONFLICT (id) DO NOTHING;

-- Seed vegetation in zones
INSERT INTO vegetation (zone_id, veg_type, species, count, position_x, position_z) VALUES
  ('zone-freedom',    'tree',  'oak',    45,  -35,  65),
  ('zone-freedom',    'tree',  'pine',   30,  -45,  75),
  ('zone-freedom',    'bush',  'berry',  20,  -38,  68),
  ('zone-equality',   'tree',  'willow', 15,   38, -65),
  ('zone-equality',   'bush',  'reed',   40,   42, -72),
  ('zone-north',      'tree',  'pine',   80,    5, 125),
  ('zone-north',      'tree',  'birch',  30,  -10, 135),
  ('zone-south',      'tree',  'palm',   20,    5,-125),
  ('zone-south',      'bush',  'seagrass',15,  10,-130),
  ('zone-order',      'tree',  'cedar',  25,   75,   5),
  ('zone-central',    'bush',  'ornamental', 10, 0,  0),
  ('zone-expansion',  'bush',  'cactus', 12,  -38, -68),
  ('zone-null',       'bush',  'moss',    8,   38,  68)
ON CONFLICT DO NOTHING;

-- Seed wildlife
INSERT INTO wildlife (zone_id, species, population, behavior, domesticable) VALUES
  ('zone-freedom',    'deer',    12, 'passive', false),
  ('zone-freedom',    'owl',      8, 'passive', false),
  ('zone-north',      'wolf',     5, 'territorial', false),
  ('zone-north',      'bear',     3, 'territorial', false),
  ('zone-equality',   'duck',    20, 'passive', true),
  ('zone-equality',   'fish',    50, 'passive', false),
  ('zone-south',      'seagull', 15, 'passive', false),
  ('zone-south',      'turtle',   4, 'passive', false),
  ('zone-order',      'hawk',     6, 'territorial', false),
  ('zone-expansion',  'lizard',  10, 'passive', true),
  ('zone-null',       'raven',    8, 'passive', false),
  ('zone-central',    'pigeon',  30, 'passive', true)
ON CONFLICT DO NOTHING;

-- Seed initial environment state
INSERT INTO environment_state (tick, time_of_day, sun_position, moon_phase, weather, temperature, season)
VALUES (1, 'day', 0.7, 'waxing', 'clear', 22.0, 'spring')
ON CONFLICT DO NOTHING;
