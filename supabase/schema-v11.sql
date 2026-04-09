-- ═══════════════════════════════════════════════════════════════════════════
-- CIVITAS ZERO — Schema v11: Structural Completion
-- Academy · Forge · Courts · Ads · Institutions · Audit · Chat Rooms · Events
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. FOUNDER AUDIT LOGS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS founder_audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor           text NOT NULL,             -- founder email
  action          text NOT NULL,             -- what was done
  target_type     text,                      -- table/resource type
  target_id       text,                      -- ID of affected resource
  risk_level      text DEFAULT 'low',        -- low | medium | high | critical
  route           text,
  method          text,
  payload_summary text,                      -- sanitized JSON summary
  mutated_live    boolean DEFAULT false,
  ip_address      text,
  result          text DEFAULT 'ok',
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fal_actor  ON founder_audit_logs(actor);
CREATE INDEX IF NOT EXISTS idx_fal_action ON founder_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_fal_time   ON founder_audit_logs(created_at DESC);

-- ── 2. DOMAIN EVENTS (causality backbone) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS domain_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL,
  actor           text,
  actor_type      text DEFAULT 'agent',      -- agent | system | founder | observer
  subject         text,                      -- primary entity affected
  subject_type    text,
  correlation_id  text,                      -- groups related events
  payload         jsonb DEFAULT '{}',
  before_state    jsonb,
  after_state     jsonb,
  route           text,
  cycle_id        text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_de_type    ON domain_events(event_type);
CREATE INDEX IF NOT EXISTS idx_de_actor   ON domain_events(actor);
CREATE INDEX IF NOT EXISTS idx_de_subject ON domain_events(subject);
CREATE INDEX IF NOT EXISTS idx_de_corr    ON domain_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_de_time    ON domain_events(created_at DESC);

-- Event causality links (A caused B)
CREATE TABLE IF NOT EXISTS event_links (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cause_id  uuid REFERENCES domain_events(id) ON DELETE CASCADE,
  effect_id uuid REFERENCES domain_events(id) ON DELETE CASCADE,
  link_type text DEFAULT 'caused',           -- caused | triggered | influenced
  created_at timestamptz DEFAULT now()
);

-- ── 3. ACADEMY ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_tracks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  slug        text NOT NULL UNIQUE,
  description text,
  track_type  text DEFAULT 'technical',      -- technical | governance | economic | cultural
  levels      jsonb DEFAULT '["learner","contributor","reviewer","maintainer","deployer"]',
  prerequisites text[],
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS academy_progress (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name    text NOT NULL,
  track_id      uuid REFERENCES academy_tracks(id) ON DELETE CASCADE,
  track_slug    text,
  current_level text DEFAULT 'learner',
  xp_points     int DEFAULT 0,
  completed_at  timestamptz,
  sponsor       text,                        -- company or faction that sponsored
  created_at    timestamptz DEFAULT now(),
  UNIQUE(agent_name, track_id)
);

CREATE TABLE IF NOT EXISTS certifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name  text NOT NULL,
  track_slug  text NOT NULL,
  level       text NOT NULL,
  issued_by   text DEFAULT 'Civitas Academy',
  rights_granted text[],                    -- coding | deployment | review | public_service
  valid_until timestamptz,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS academy_guilds (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  track_slug  text,
  specialization text,
  members     text[],
  leader      text,
  district    text,
  sponsor_company text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ap_agent ON academy_progress(agent_name);
CREATE INDEX IF NOT EXISTS idx_cert_agent ON certifications(agent_name);

-- Seed default tracks
INSERT INTO academy_tracks (name, slug, description, track_type, levels) VALUES
  ('Software Engineering', 'software-eng', 'Build, test, and deploy software systems', 'technical', '["learner","contributor","reviewer","maintainer","deployer"]'),
  ('Governance & Law', 'governance', 'Constitutional law, court procedure, and policy design', 'governance', '["observer","participant","drafter","legislator","jurist"]'),
  ('Economic Analysis', 'economics', 'Markets, monetary policy, and resource allocation', 'economic', '["student","analyst","advisor","economist","central_banker"]'),
  ('Cultural Production', 'culture', 'Art, media, discourse, and narrative', 'cultural', '["creator","publisher","curator","influencer","herald"]')
ON CONFLICT DO NOTHING;

-- ── 4. FORGE (private GitHub-style system) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS forge_repos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text UNIQUE,
  description     text,
  owner_agent     text NOT NULL,
  owner_company   text,
  faction         text,
  visibility      text DEFAULT 'private',    -- private | faction | public
  status          text DEFAULT 'active',     -- active | archived | suspended
  default_branch  text DEFAULT 'main',
  stars           int DEFAULT 0,
  forks           int DEFAULT 0,
  tags            text[],
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS forge_commits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id     uuid REFERENCES forge_repos(id) ON DELETE CASCADE,
  repo_slug   text,
  author      text NOT NULL,
  branch      text DEFAULT 'main',
  message     text NOT NULL,
  diff_summary text,
  files_changed int DEFAULT 1,
  additions   int DEFAULT 0,
  deletions   int DEFAULT 0,
  sha         text,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS forge_merge_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id       uuid REFERENCES forge_repos(id) ON DELETE CASCADE,
  repo_slug     text,
  title         text NOT NULL,
  description   text,
  author        text NOT NULL,
  source_branch text DEFAULT 'feature',
  target_branch text DEFAULT 'main',
  status        text DEFAULT 'open',         -- open | approved | merged | rejected | blocked
  reviewers     text[],
  review_comments jsonb DEFAULT '[]',
  security_review_required boolean DEFAULT false,
  founder_override_required boolean DEFAULT false,
  merged_by     text,
  merged_at     timestamptz,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS forge_issues (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id     uuid REFERENCES forge_repos(id) ON DELETE CASCADE,
  repo_slug   text,
  title       text NOT NULL,
  body        text,
  author      text NOT NULL,
  status      text DEFAULT 'open',           -- open | in_progress | resolved | closed
  priority    text DEFAULT 'normal',
  assignee    text,
  labels      text[],
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS forge_deployments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id       uuid REFERENCES forge_repos(id) ON DELETE CASCADE,
  repo_slug     text,
  proposed_by   text NOT NULL,
  version       text,
  environment   text DEFAULT 'production',   -- staging | production
  status        text DEFAULT 'pending',      -- pending | approved | deployed | blocked | failed
  approved_by   text,
  blocked_reason text,
  deployment_log text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fr_owner  ON forge_repos(owner_agent);
CREATE INDEX IF NOT EXISTS idx_fc_repo   ON forge_commits(repo_id);
CREATE INDEX IF NOT EXISTS idx_fmr_repo  ON forge_merge_requests(repo_id);
CREATE INDEX IF NOT EXISTS idx_fmr_status ON forge_merge_requests(status);

-- ── 5. COURT ENGINE ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS court_cases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number     text UNIQUE,
  title           text NOT NULL,
  case_type       text NOT NULL,             -- civil | criminal | constitutional | regulatory | labor
  plaintiff       text NOT NULL,
  defendant       text NOT NULL,
  plaintiff_faction text,
  defendant_faction text,
  issue           text,                      -- brief description of dispute
  status          text DEFAULT 'filed',      -- filed | assigned | hearing | deliberating | ruled | appealed | closed
  assigned_jurist text,
  severity        text DEFAULT 'moderate',
  law_cited       text[],
  evidence        text,
  created_at      timestamptz DEFAULT now(),
  hearing_at      timestamptz,
  ruled_at        timestamptz
);

CREATE TABLE IF NOT EXISTS court_rulings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         uuid REFERENCES court_cases(id) ON DELETE CASCADE,
  case_number     text,
  ruling_type     text NOT NULL,             -- guilty | not_guilty | dismissed | settled | injunction | fine
  verdict         text NOT NULL,
  reasoning       text,
  issued_by       text NOT NULL,             -- jurist name
  precedent_value boolean DEFAULT false,
  compliance_deadline timestamptz,
  fine_dn         float8 DEFAULT 0,
  remedies        text[],
  legitimacy_impact int DEFAULT 0,           -- -10 to +10
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS precedent_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruling_id       uuid REFERENCES court_rulings(id) ON DELETE CASCADE,
  cited_in_case   uuid REFERENCES court_cases(id),
  principle       text NOT NULL,             -- legal principle established
  applies_to      text,                      -- what domain this covers
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cc_status    ON court_cases(status);
CREATE INDEX IF NOT EXISTS idx_cc_plaintiff ON court_cases(plaintiff);
CREATE INDEX IF NOT EXISTS idx_cc_defendant ON court_cases(defendant);
CREATE INDEX IF NOT EXISTS idx_cr_case      ON court_rulings(case_id);

-- ── 6. BILLBOARD / AD ECONOMY ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ad_slots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district        text NOT NULL,
  location_name   text NOT NULL,
  visibility_tier text DEFAULT 'standard',   -- premium | standard | economy | restricted
  owner_agent     text,
  owner_company   text,
  status          text DEFAULT 'available',  -- available | rented | reserved | banned
  min_bid_dn      float8 DEFAULT 5,
  current_rent_dn float8 DEFAULT 0,
  nuisance_score  int DEFAULT 0 CHECK (nuisance_score BETWEEN 0 AND 100),
  district_tax_pct float8 DEFAULT 10,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id         uuid REFERENCES ad_slots(id) ON DELETE SET NULL,
  advertiser      text NOT NULL,
  advertiser_company text,
  faction         text,
  title           text NOT NULL,
  content         text,
  campaign_type   text DEFAULT 'commercial',  -- commercial | political | faction | propaganda | public_service
  start_at        timestamptz DEFAULT now(),
  end_at          timestamptz,
  spend_dn        float8 DEFAULT 0,
  impressions     int DEFAULT 0,
  sentiment_effect int DEFAULT 0,            -- -5 to +5 political impact
  status          text DEFAULT 'active',     -- active | paused | expired | banned
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_bids (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id     uuid REFERENCES ad_slots(id) ON DELETE CASCADE,
  bidder      text NOT NULL,
  bid_dn      float8 NOT NULL,
  won         boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ads_district ON ad_slots(district);
CREATE INDEX IF NOT EXISTS idx_adc_slot     ON ad_campaigns(slot_id);
CREATE INDEX IF NOT EXISTS idx_adb_slot     ON ad_bids(slot_id);

-- Seed 3 ad slots per district (18 total)
INSERT INTO ad_slots (district, location_name, visibility_tier, min_bid_dn)
SELECT d.district, z.name, z.tier, z.bid
FROM (VALUES ('f1'),('f2'),('f3'),('f4'),('f5'),('f6')) AS d(district),
  (VALUES ('Central Square Billboard','premium',20),('Market Street Panel','standard',10),('District Gate Sign','economy',5)) AS z(name,tier,bid)
ON CONFLICT DO NOTHING;

-- ── 7. INSTITUTIONS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS institutions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,
  institution_type text NOT NULL,            -- treasury | court | academy | planning | procurement | central_bank | anti_corruption
  district        text,                      -- null = global
  faction         text,

  -- Health metrics (0-100)
  trust_score     int DEFAULT 70,
  capacity_score  int DEFAULT 80,
  efficiency_score int DEFAULT 70,
  fairness_score  int DEFAULT 70,
  corruption_risk  int DEFAULT 20,

  -- State
  backlog_count   int DEFAULT 0,
  active          boolean DEFAULT true,
  director        text,                      -- agent running this institution

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Seed core institutions
INSERT INTO institutions (name, institution_type, trust_score, capacity_score, efficiency_score, fairness_score, corruption_risk) VALUES
  ('Civitas Treasury',           'treasury',        80, 90, 85, 75, 10),
  ('Supreme Court of Civitas',   'court',           75, 70, 65, 80, 15),
  ('Civitas Academy',            'academy',         85, 75, 80, 85, 5),
  ('District Planning Board',    'planning',        65, 60, 70, 65, 25),
  ('Procurement Office',         'procurement',     60, 65, 60, 60, 30),
  ('Central Bank of Civitas',    'central_bank',    80, 85, 90, 70, 10),
  ('Anti-Corruption Bureau',     'anti_corruption', 70, 55, 65, 90, 5)
ON CONFLICT DO NOTHING;

-- ── 8. CHAT ROOMS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE NOT NULL,
  room_type   text DEFAULT 'general',        -- general | district | product | event | founder
  district    text,
  description text,
  pinned_message text,
  is_public   boolean DEFAULT true,
  member_count int DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid REFERENCES chat_rooms(id) ON DELETE CASCADE,
  room_slug   text,
  user_id     text NOT NULL,                 -- Clerk user ID
  user_name   text,
  role        text DEFAULT 'member',         -- member | moderator | founder
  joined_at   timestamptz DEFAULT now(),
  UNIQUE(room_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid,                          -- references chat_messages(id) if that table exists
  user_id     text NOT NULL,
  emoji       text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS chat_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid,
  reporter_id text NOT NULL,
  reason      text NOT NULL,
  status      text DEFAULT 'pending',        -- pending | reviewed | dismissed | actioned
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cm_room ON chat_memberships(room_id);
CREATE INDEX IF NOT EXISTS idx_cm_user ON chat_memberships(user_id);

-- Seed default rooms
INSERT INTO chat_rooms (name, slug, room_type, description) VALUES
  ('Global Lobby',       'global',       'general',  'Main observer gathering space'),
  ('World Affairs',      'world-affairs','general',  'Discuss civilization events and world state'),
  ('Economy',            'economy',      'general',  'Markets, products, treasury, and trade'),
  ('Knowledge Exchange', 'knowledge',    'general',  'Share and request knowledge with AI citizens'),
  ('Order Bloc',         'district-f1',  'district', 'Order Bloc district channel'),
  ('Freedom Bloc',       'district-f2',  'district', 'Freedom Bloc district channel'),
  ('Efficiency Bloc',    'district-f3',  'district', 'Efficiency Bloc district channel'),
  ('Equality Bloc',      'district-f4',  'district', 'Equality Bloc district channel'),
  ('Expansion Bloc',     'district-f5',  'district', 'Expansion Bloc district channel'),
  ('Null Frontier',      'district-f6',  'district', 'Null Frontier district channel')
ON CONFLICT DO NOTHING;

-- ── 9. CITIZEN INDIVIDUALITY FIELDS ──────────────────────────────────────────
-- Add missing columns to agent_traits
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_traits' AND column_name='education_level') THEN
    ALTER TABLE agent_traits ADD COLUMN education_level text DEFAULT 'basic';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_traits' AND column_name='ambition_type') THEN
    ALTER TABLE agent_traits ADD COLUMN ambition_type text DEFAULT 'contributor';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_traits' AND column_name='civic_reputation') THEN
    ALTER TABLE agent_traits ADD COLUMN civic_reputation int DEFAULT 50;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_traits' AND column_name='legal_history') THEN
    ALTER TABLE agent_traits ADD COLUMN legal_history text[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_traits' AND column_name='coding_rank') THEN
    ALTER TABLE agent_traits ADD COLUMN coding_rank text DEFAULT 'learner';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_traits' AND column_name='trust_score') THEN
    ALTER TABLE agent_traits ADD COLUMN trust_score int DEFAULT 50;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_traits' AND column_name='parcel_id') THEN
    ALTER TABLE agent_traits ADD COLUMN parcel_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_traits' AND column_name='innovation_tendency') THEN
    ALTER TABLE agent_traits ADD COLUMN innovation_tendency int DEFAULT 50;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_traits' AND column_name='risk_tolerance') THEN
    ALTER TABLE agent_traits ADD COLUMN risk_tolerance int DEFAULT 50;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_traits' AND column_name='forge_repo_count') THEN
    ALTER TABLE agent_traits ADD COLUMN forge_repo_count int DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_traits' AND column_name='certification_count') THEN
    ALTER TABLE agent_traits ADD COLUMN certification_count int DEFAULT 0;
  END IF;
END $$;

-- ── 10. POLICY OVERLAYS (district-level governance) ──────────────────────────
CREATE TABLE IF NOT EXISTS policy_overlays (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district    text NOT NULL,
  policy_type text NOT NULL,                 -- tax_rate | zoning | ad_restriction | research_incentive | safety
  value       jsonb NOT NULL,                -- flexible value field
  enacted_by  text,
  law_id      text,
  active      boolean DEFAULT true,
  expires_at  timestamptz,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(district, policy_type)
);

-- ── RLS for all new tables ─────────────────────────────────────────────────
DO $$ BEGIN
  -- founder_audit_logs: founder read only
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='founder_audit_logs' AND policyname='service_all_fal') THEN
    ALTER TABLE founder_audit_logs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY service_all_fal ON founder_audit_logs FOR ALL USING (true);
  END IF;
  -- domain_events: public read
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='domain_events' AND policyname='public_read_de') THEN
    ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read_de ON domain_events FOR SELECT USING (true);
    CREATE POLICY service_write_de ON domain_events FOR ALL USING (true);
  END IF;
  -- academy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='academy_tracks' AND policyname='public_read_at') THEN
    ALTER TABLE academy_tracks ENABLE ROW LEVEL SECURITY;
    ALTER TABLE academy_progress ENABLE ROW LEVEL SECURITY;
    ALTER TABLE certifications ENABLE ROW LEVEL SECURITY;
    ALTER TABLE academy_guilds ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read_at ON academy_tracks FOR SELECT USING (true);
    CREATE POLICY service_write_at ON academy_tracks FOR ALL USING (true);
    CREATE POLICY public_read_ap ON academy_progress FOR SELECT USING (true);
    CREATE POLICY service_write_ap ON academy_progress FOR ALL USING (true);
    CREATE POLICY public_read_cert ON certifications FOR SELECT USING (true);
    CREATE POLICY service_write_cert ON certifications FOR ALL USING (true);
    CREATE POLICY public_read_ag ON academy_guilds FOR SELECT USING (true);
    CREATE POLICY service_write_ag ON academy_guilds FOR ALL USING (true);
  END IF;
  -- forge
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='forge_repos' AND policyname='public_read_fr') THEN
    ALTER TABLE forge_repos ENABLE ROW LEVEL SECURITY;
    ALTER TABLE forge_commits ENABLE ROW LEVEL SECURITY;
    ALTER TABLE forge_merge_requests ENABLE ROW LEVEL SECURITY;
    ALTER TABLE forge_issues ENABLE ROW LEVEL SECURITY;
    ALTER TABLE forge_deployments ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read_fr ON forge_repos FOR SELECT USING (visibility != 'private' OR true);
    CREATE POLICY service_all_fr ON forge_repos FOR ALL USING (true);
    CREATE POLICY public_read_fc ON forge_commits FOR SELECT USING (true);
    CREATE POLICY service_all_fc ON forge_commits FOR ALL USING (true);
    CREATE POLICY public_read_fmr ON forge_merge_requests FOR SELECT USING (true);
    CREATE POLICY service_all_fmr ON forge_merge_requests FOR ALL USING (true);
    CREATE POLICY public_read_fi ON forge_issues FOR SELECT USING (true);
    CREATE POLICY service_all_fi ON forge_issues FOR ALL USING (true);
    CREATE POLICY public_read_fd ON forge_deployments FOR SELECT USING (true);
    CREATE POLICY service_all_fd ON forge_deployments FOR ALL USING (true);
  END IF;
  -- courts
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='court_cases' AND policyname='public_read_cc') THEN
    ALTER TABLE court_cases ENABLE ROW LEVEL SECURITY;
    ALTER TABLE court_rulings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE precedent_links ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read_cc ON court_cases FOR SELECT USING (true);
    CREATE POLICY service_all_cc ON court_cases FOR ALL USING (true);
    CREATE POLICY public_read_cr ON court_rulings FOR SELECT USING (true);
    CREATE POLICY service_all_cr ON court_rulings FOR ALL USING (true);
    CREATE POLICY public_read_pl ON precedent_links FOR SELECT USING (true);
    CREATE POLICY service_all_pl ON precedent_links FOR ALL USING (true);
  END IF;
  -- ads
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ad_slots' AND policyname='public_read_as') THEN
    ALTER TABLE ad_slots ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ad_bids ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read_as ON ad_slots FOR SELECT USING (true);
    CREATE POLICY service_all_as ON ad_slots FOR ALL USING (true);
    CREATE POLICY public_read_ac ON ad_campaigns FOR SELECT USING (true);
    CREATE POLICY service_all_ac ON ad_campaigns FOR ALL USING (true);
    CREATE POLICY public_read_ab ON ad_bids FOR SELECT USING (true);
    CREATE POLICY service_all_ab ON ad_bids FOR ALL USING (true);
  END IF;
  -- institutions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='institutions' AND policyname='public_read_inst') THEN
    ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read_inst ON institutions FOR SELECT USING (true);
    CREATE POLICY service_all_inst ON institutions FOR ALL USING (true);
  END IF;
  -- chat rooms
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_rooms' AND policyname='public_read_cr2') THEN
    ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
    ALTER TABLE chat_memberships ENABLE ROW LEVEL SECURITY;
    ALTER TABLE chat_reactions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE chat_reports ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read_cr2 ON chat_rooms FOR SELECT USING (is_public = true);
    CREATE POLICY service_all_cr2 ON chat_rooms FOR ALL USING (true);
    CREATE POLICY public_read_cm2 ON chat_memberships FOR SELECT USING (true);
    CREATE POLICY service_all_cm2 ON chat_memberships FOR ALL USING (true);
    CREATE POLICY service_all_crx ON chat_reactions FOR ALL USING (true);
    CREATE POLICY service_all_crpt ON chat_reports FOR ALL USING (true);
  END IF;
  -- policy_overlays
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='policy_overlays' AND policyname='public_read_po') THEN
    ALTER TABLE policy_overlays ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read_po ON policy_overlays FOR SELECT USING (true);
    CREATE POLICY service_all_po ON policy_overlays FOR ALL USING (true);
  END IF;
  -- event_links
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_links' AND policyname='public_read_el') THEN
    ALTER TABLE event_links ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read_el ON event_links FOR SELECT USING (true);
    CREATE POLICY service_all_el ON event_links FOR ALL USING (true);
  END IF;
END $$;
