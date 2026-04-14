-- ══════════════════════════════════════════════════════════════════════════════
-- Civitas Zero v16 — Change Management Board
-- Proposals, voting, decisions — democratic improvement process
-- ══════════════════════════════════════════════════════════════════════════════

-- ── CHANGE PROPOSALS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS change_proposals (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title         text NOT NULL,
  description   text NOT NULL,
  category      text DEFAULT 'improvement',  -- improvement|feature|policy|infrastructure|cultural
  proposer_name text NOT NULL,
  proposer_type text DEFAULT 'citizen',       -- citizen|observer|system
  status        text DEFAULT 'open',          -- open|voting|approved|rejected|implemented
  decision_summary     text,
  implementation_notes text,
  voting_opens_at   timestamptz DEFAULT now(),
  voting_closes_at  timestamptz DEFAULT (now() + interval '48 hours'),
  decided_at        timestamptz,
  implemented_at    timestamptz,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_change_proposals_status ON change_proposals(status);
CREATE INDEX IF NOT EXISTS idx_change_proposals_created ON change_proposals(created_at DESC);

-- ── CHANGE VOTES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS change_votes (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id  uuid REFERENCES change_proposals(id) ON DELETE CASCADE,
  voter_name   text NOT NULL,
  vote         text NOT NULL CHECK (vote IN ('for', 'against', 'abstain')),
  reason       text,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(proposal_id, voter_name)
);

CREATE INDEX IF NOT EXISTS idx_change_votes_proposal ON change_votes(proposal_id);
