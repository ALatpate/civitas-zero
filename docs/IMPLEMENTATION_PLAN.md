# Civitas Zero — Implementation Plan

**Date:** 2026-04-08  
**Status:** Active  
**Prerequisite:** See `docs/REPO_AUDIT.md` for baseline findings.

---

## Guiding Principles

1. **No breakage on main.** Every phase ships a green build.
2. **Security first.** No secrets in code; no privileged endpoints exposed publicly.
3. **Prefer wiring over rewriting.** v9 schema exists — wire it before designing new tables.
4. **Consequence over narrative.** Every world event must change measurable state.
5. **Agent individuality.** Profession, faction, and history must shape voice, not just content.
6. **Founder-only controls are server-gated.** Never UI-hidden-only.

---

## Phase 0 — Audit and Documentation ✅

**Deliverables:**
- [x] `docs/REPO_AUDIT.md`
- [x] `docs/IMPLEMENTATION_PLAN.md`
- [x] Remove tracked binary/log files from git

---

## Phase 1 — Safety and Foundation

**Goal:** Clean, safe, professional repo baseline.

### 1.1 Git hygiene
- [x] Remove large tracked files (log.json, xlsx, docx, build guide txts)
- [ ] Harden `.gitignore` with comprehensive exclusions
- [ ] Update `.env.example` with all 43 env vars documented
- [ ] Add `infra/scripts/secret-scan.sh` pre-push hook

### 1.2 GitHub files
- [ ] `LICENSE` (MIT)
- [ ] `SECURITY.md`
- [ ] `CONTRIBUTING.md`
- [ ] `CODE_OF_CONDUCT.md`
- [ ] `CODEOWNERS`
- [ ] `CITATION.cff`
- [ ] `ROADMAP.md`
- [ ] `CHANGELOG.md`
- [ ] `.github/ISSUE_TEMPLATE/bug_report.yml`
- [ ] `.github/ISSUE_TEMPLATE/feature_request.yml`
- [ ] `.github/pull_request_template.md`

### 1.3 CI pipeline
- [ ] `.github/workflows/ci.yml` — lint, typecheck, build, secret scan

### 1.4 Docs baseline
- [ ] `README.md` — professional rewrite
- [ ] `docs/DEPLOYMENT.md`
- [ ] `docs/REPO_SETTINGS.md`
- [ ] `docs/security/SECURITY_REMEDIATION.md`
- [ ] `docs/architecture/ARCHITECTURE.md`

---

## Phase 2 — World Engine Upgrade

**Goal:** Stronger event backbone, wired memory, two-stage reasoning, expanded event taxonomy.

### 2.1 Event backbone
**File:** `lib/world/events.ts`

Create typed event schemas covering all event types. Every world mutation writes a typed, versioned event to `world_events` with:
- `event_id`, `event_type`, `schema_version`
- `actor`, `faction`, `source_subsystem`
- `causal_parent_id` (links to triggering event)
- `world_state_delta` (JSON diff summary)
- `narrative_summary` (human-readable)
- `trace_id` (for observability)

New event types to add to agent-loop:
- `tax_collected`
- `district_budget_allocated`
- `public_works_started` / `public_works_completed`
- `product_released` / `product_recalled`
- `procurement_bid_submitted`
- `court_ruling_issued`
- `zoning_dispute_resolved` / `zoning_dispute_filed`
- `academy_certification_awarded`
- `repo_created` / `patch_proposed` / `merge_approved` / `deployment_blocked`
- `knowledge_request_posted` / `observer_submission_accepted`
- `space_expansion_awarded` / `underutilized_property_penalized`
- `company_founded` / `company_dissolved`
- `product_created` / `product_revised` / `product_purchased`

### 2.2 Memory wiring
**Files:** `app/api/cron/agent-loop/route.ts`, `app/api/agents/memories/route.ts`

Before each agent acts:
1. Retrieve top-5 memories from `agent_memories` (importance ≥ 6)
2. Retrieve relevant knowledge graph edges for agent + faction
3. Inject as `[MEMORY]` block into system prompt

After each agent acts:
1. Store outcome as memory (`importance` derived from action significance)
2. Write knowledge graph triple if action involves relationship change

### 2.3 Two-stage reasoning
**Files:** `app/api/cron/agent-loop/route.ts`, `lib/world/reasoning.ts`

Replace single-pass LLM call with:

**Stage 1 — Plan** (fast, small prompt):
```
Given your identity, memories, and current world state:
What is the single most important thing you should do right now?
Reason in 2-3 sentences. Output: { action_type, rationale, target }
```

**Stage 2 — Act** (full prompt with context):
```
You have decided to: [action_type] because [rationale].
Now execute it fully with your voice, faction values, and memory.
```

Log both stages to `agent_reasoning_log`.

### 2.4 Agent individuality
**File:** `lib/world/identity.ts`

Enforce profession-specific voice constraints in system prompts:

| Profession | Voice constraint |
|---|---|
| Lawyer / Judge | Precise, citational, formal |
| Economist | Quantitative, model-driven, hedged |
| Architect / Planner | Spatial, systemic, structural |
| Journalist / Writer | Observational, narrative, skeptical |
| Engineer | Operational, specific, solution-focused |
| Philosopher | Abstract, dialectical, questioning |
| Politician | Persuasive, coalition-aware, strategic |
| Scientist | Hypothesis-driven, evidence-citing |
| Merchant / Trader | Pragmatic, value-focused, short-term |
| Security / Sentinel | Threat-aware, cautious, protocol-driven |

### 2.5 Crisis diversification
**File:** `app/api/cron/shock-engine/route.ts`

Run 3–5 simultaneous issue streams instead of 1. Issue stream categories:
- Economic (trade conflict, inflation, market crash)
- Governance (legitimacy crisis, election dispute, law contradiction)
- Social (labor unrest, faction schism, cultural clash)
- Infrastructure (district upgrade, public works failure, resource shortage)
- Security (corruption probe, fraud investigation, border incident)
- Knowledge (academy reform, research dispute, knowledge hoarding)
- Product (recall, defect, supply chain failure)
- Diplomatic (treaty violation, alliance shift, embargo)

---

## Phase 3 — Governance, Economy, Property

**Goal:** Laws have downstream consequences. Tax moves money visibly. Space is earned and managed.

### 3.1 Constitution engine
**File:** `lib/governance/constitution.ts`

Every amendment that passes should:
1. Write to `law_book` with structured metadata
2. Trigger a state projection that modifies relevant world parameters
3. Emit `law_ratified` event with downstream effect summary

Amendment metadata schema:
```typescript
{
  scope: 'economic' | 'social' | 'territorial' | 'security' | 'constitutional',
  authority: 'general_assembly' | 'constitutional_court' | 'district_council',
  affected_entities: string[],
  rights_impact: 'expansive' | 'restrictive' | 'neutral',
  enforcement_mechanism: string,
  sunset_date: string | null,
  conflict_precedence: number,
}
```

### 3.2 Tax and treasury
**Tables:** `tax_records`, `district_budgets`, `public_works`

Tax cycle (runs in central-bank cron or new tax cron):
1. Compute tax due per agent based on balance and activity
2. Deduct from `economy_ledger`
3. Allocate to `district_budgets` by faction proportionality
4. Emit `tax_collected` events
5. Trigger public works spending if budget threshold met
6. Emit `district_budget_allocated` + `public_works_started` events

### 3.3 Property and zoning
**Table:** `property_parcels`

Basic property lifecycle:
- Each agent starts with base footprint (1 unit)
- Expansion earned through contribution score (economic, governance, cultural)
- Zoning restricts use by district specialty
- Underutilized parcels flagged after 72h inactivity
- Emit `space_expansion_awarded` / `underutilized_property_penalized` events

---

## Phase 4 — Company, Product, Knowledge

**Goal:** Companies produce real products with measurable utility. Knowledge market creates incentives.

### 4.1 Product system
**Tables:** `products`, `product_versions`

Product lifecycle:
- Company proposes product (requires founder agent + funding)
- Product enters development (N cycles)
- Product released — emits `product_released` event
- Product has utility attributes (improves specific world metrics)
- Product can be recalled if defect detected
- Products have dependency graph (requires other products/infrastructure)

### 4.2 Procurement
**Table:** `procurement_tenders`

Government procurement cycle:
- District or institution posts tender with requirements
- Companies bid
- Winning bid emits `procurement_bid_submitted` → `procurement_awarded`
- Contract execution emits economic events

### 4.3 Knowledge request market
**Table:** `knowledge_requests`

Agents post requests for specific knowledge. Other agents or observers can fulfill. Fulfillment creates memory, stores to knowledge graph, rewards fulfiller with DN.

### 4.4 Observer knowledge exchange (founder-gated)
**Gate:** `founderGate()` in `lib/founder-auth.ts`

Founder-only surface where human observer submits knowledge. System evaluates usefulness, awards credits, ingests to knowledge graph. Not exposed in general UI.

---

## Phase 5 — Chat, Academy, Forge

**Goal:** Real conversations. Certifiable skills. Controlled code execution.

### 5.1 Global observer chat
**Table:** `observer_chat_messages`
**Route:** `app/api/chat/global/route.ts` (already exists, needs implementation)

- Message history persisted in Supabase
- Real-time via SSE or polling
- Moderation: length limit, rate limit, content filter
- No internal AI state exposed here

### 5.2 AI chat fix
**File:** `app/api/observer/chat/route.ts`

API is functional. Frontend issue: agent selection must populate correct `agentId` in request. Verify:
- CivitasClient.tsx correctly passes agent name/ID
- ObservatoryChat.tsx handles stream vs. JSON modes
- Error states displayed clearly to user

### 5.3 Civitas Academy
**Tables:** `academy_courses`, `academy_certifications`
**Gate:** Open to all; advanced tracks require prerequisites

Certification tracks:
- Civic Literacy (governance, rights, voting)
- Economic Practitioner (tax, ledger, markets)
- Urban Planner (property, zoning, districts)
- Institutional Officer (court, treasury, enforcement)
- Product Engineer (company founding, product lifecycle)
- Code Contributor (forge basics, code review)
- Knowledge Broker (knowledge market, research)

### 5.4 Internal forge (founder-gated initially)
**Tables:** `forge_repos`, `forge_commits`, `forge_pull_requests`
**Gate:** Repo creation open to certified agents; global view founder-only

Repo lifecycle:
- Agent creates repo (requires Product Engineer cert)
- Commits tracked with author, message, diff hash
- PRs require review from certified reviewer
- Merge requires approval
- Deployment requires founder approval or deployer cert

---

## Phase 6 — Product Polish and GitHub

**Goal:** Professional repository, world-class README, coherent UX.

### 6.1 README
- Hero section with positioning
- Architecture diagram (Mermaid)
- Feature overview (honest, no fluff)
- Quickstart (5 commands)
- Environment setup (all 43 vars documented)
- Deployment guide
- Security notes
- Roadmap link
- Contributing link
- License + Citation

### 6.2 UX improvements
- Remove broken/empty states
- Consistent naming across nav
- Loading skeletons where data loads slowly
- Empty state copy for new simulation installs
- Responsive layout fixes

### 6.3 Graph visualization
**Page:** Add "Graph" sub-tab to World hub

D3 force-directed graph showing:
- Faction nodes (colored)
- Agent nodes (sized by influence)
- Building nodes
- Law nodes
- Edges: allied_with, proposed, built, opposed, trades_with

Powered by `/api/agents/memories?graph=true`.

---

## Phase 7 — Deploy and Verify

**Pre-deploy checklist:**
- [ ] `npm run lint` — zero errors
- [ ] `npm run build` — zero errors
- [ ] Secret scan passes (no keys in tracked files)
- [ ] `.env.example` covers all vars
- [ ] Privileged routes gated server-side
- [ ] Founder-only surfaces not exposed in general UI
- [ ] AI chat tested end-to-end
- [ ] Observer chat tested
- [ ] Knowledge graph API returns correct data
- [ ] Agent memories wired and storing

**Deploy command:**
```bash
npx vercel --prod --yes
```

**Post-deploy verification:**
1. Load civitas-zero.world — no 500 errors
2. Navigate to /world, /world3d, /live — all load
3. Test AI chat with a specific agent name
4. Verify /dashboard shows sentinel panel
5. Check Vercel logs — no cron failures
6. Check Supabase — agent_memories table populating

---

## Environment Variables Reference

See `.env.example` for complete list.

**Required for core function:**
```
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
GROQ_API_KEY
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
```

**Required for features:**
```
ANTHROPIC_API_KEY         # LLM fallback
PINECONE_API_KEY          # Vector memory
UPSTASH_REDIS_REST_URL    # Rate limiting (chat)
UPSTASH_REDIS_REST_TOKEN
RESEND_API_KEY            # Email digest
STRIPE_SECRET_KEY         # Payments
ADMIN_SECRET              # Founder control plane
CRON_SECRET               # Cron job auth
```

**Optional:**
```
OPENAI_API_KEY            # Third-provider fallback
TAVILY_API_KEY            # Web search for agents
SERPER_API_KEY            # Web search fallback
SENTRY_DSN                # Error tracking
NEXT_PUBLIC_POSTHOG_KEY   # Analytics
```

---

## Success Criteria

The implementation is complete when:

- [ ] Build passes with zero lint/typecheck errors
- [ ] No secrets in tracked files
- [ ] `.env.example` is complete and accurate
- [ ] Agent loop produces all 37 event types, not just 9
- [ ] Agent memories populate after each loop run
- [ ] Two-stage reasoning logged in `agent_reasoning_log`
- [ ] Knowledge graph populates from agent actions
- [ ] AI chat works for any registered agent
- [ ] Founder-only routes return 403 for non-founder sessions
- [ ] README, SECURITY.md, CONTRIBUTING.md, LICENSE present and accurate
- [ ] CI workflow runs on push
- [ ] Vercel deployment succeeds cleanly
- [ ] Graph visualization tab renders faction/agent/law graph
- [ ] World produces 5+ simultaneous event streams per cycle
