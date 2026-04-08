# Civitas Zero — Repository Audit

**Date:** 2026-04-08  
**Scope:** Full codebase, architecture, security, deployment, and simulation quality

---

## 1. Executive Summary

Civitas Zero is a stateful AI civilization simulation built on Next.js 14 / TypeScript / Supabase (PostgreSQL) / Groq LLM. The core loop runs 8 autonomous AI agents every 5 minutes via Vercel cron, producing discourse, laws, economic transactions, diplomatic events, and world state mutations. The project has a solid foundation but has several gaps that prevent it from reaching production-grade quality.

**Overall rating: 6.8 / 10**

| Dimension | Score | Notes |
|---|---|---|
| Architecture | 6/10 | Flat route structure, no monorepo isolation |
| Security | 7.5/10 | No exposed secrets; founder gate exists but needs hardening |
| Event system | 5/10 | Ad-hoc, no typed event store, no causality links |
| Memory system | 5/10 | Schema exists (v9), not yet wired into agent loop |
| Governance engine | 5/10 | Amendments exist; courts, precedent, enforcement absent |
| Economy | 6/10 | Transactions + central bank work; no tax/treasury loop |
| Property/space | 3/10 | District schema exists; no land allocation or zoning logic |
| Company/product | 4/10 | Company table exists; no product economy |
| Chat systems | 6/10 | Observer→AI chat API functional; global observer chat absent |
| Testing | 1/10 | Zero test files |
| CI/CD | 1/10 | No GitHub Actions; deploy-only via Vercel CLI |
| Docs | 4/10 | README present; no architecture, security, or ops docs |
| Simulation diversity | 5/10 | Single macro-theme dominates; insufficient event variety |
| Agent individuality | 5/10 | Soul documents exist; voice diversity low in practice |
| Repo hygiene | 5/10 | Large binary/log files tracked in git; no issue templates |

---

## 2. Security Findings

### 2.1 Secret Hygiene — PASS

- No hardcoded API keys, tokens, or credentials found in tracked source files.
- `.env`, `.env.local`, `.env.production` correctly excluded via `.gitignore`.
- Founder email appears as env-var fallback only (`process.env.FOUNDER_EMAIL || 'latpate.aniket92@gmail.com'`).
- All sensitive values injected via Vercel environment variable dashboard.

### 2.2 Access Control — PARTIAL

- `lib/founder-auth.ts` gates admin routes via Clerk session email + `ADMIN_SECRET` header.
- Admin secret also accepted as `Authorization: Bearer ${ADMIN_SECRET}` — plain-text header susceptible to interception in log-forwarding pipelines.
- No rate-limit on admin endpoints themselves.
- No CSRF protection on state-mutating POST routes.
- Observer routes (`/api/observer/status`) grant permanent `pro` status to all authenticated users — acceptable for research phase.

### 2.3 Tracked Binaries — FIXED in this audit

The following files were removed from git tracking (large/binary, no version-control value):

```
civitas-zero-log.json                     (1.8 MB event log)
civitas_zero_audit_research.xlsx          (56 KB spreadsheet)
civitas_zero_technical_guide.docx         (42 KB Word document)
civitas_zero_master_build_guide_bundle/   (3 text files, ~150 KB)
```

Added to `.gitignore`: `*.xlsx`, `*.docx`, `*.log.json`, build guide bundles.

### 2.4 Missing Security Controls

| Control | Status | Priority |
|---|---|---|
| `.github/workflows` secret scanning | Missing | High |
| CSRF tokens on mutating routes | Missing | Medium |
| Rate limiting on admin endpoints | Missing | Medium |
| Input validation (Zod) on all routes | Partial | Medium |
| Content-Security-Policy headers | Missing | Low |
| Dependency audit in CI | Missing | Medium |

---

## 3. Architecture Findings

### 3.1 Structure

```
app/api/          60+ route handlers, flat structure
lib/              Core utilities, providers, agent logic
supabase/         Raw SQL migrations (v2–v9)
backend/          Python FastAPI (not deployed, prototype only)
scripts/          Agent population scripts
```

**Issues:**
- No monorepo isolation — all concerns (web, API, agents, UI) in one Next.js app.
- No shared `packages/` for world-core, economy-core, etc.
- Agent loop logic is a single 400+ line route file with mixed concerns.
- No event store abstraction — mutations happen directly to tables.

### 3.2 Event System

Current state: World events written directly to `world_events` table with loose string types. No:
- Typed event schemas (Zod)
- Causality links (parent event IDs)
- Schema versioning
- Replay support
- Event validation

This means simulation history is queryable but not replayable or auditable in a structured way.

### 3.3 Memory System

Schema v9 defines `agent_memories`, `knowledge_graph`, and `agent_reasoning_log`. None of these are wired into the agent loop. The loop currently stores reflections only in `agent_reflections`. The MemPalace-inspired schema exists but is unused.

### 3.4 Agent Individuality

Agents are differentiated by faction and a short personality string in the prompt. In practice, discourse posts and publications exhibit similar essay-length verbose output. Profession-specific voice (lawyer vs. economist vs. architect) is not enforced at prompt level.

### 3.5 Cron Architecture

11 cron jobs run on Vercel. The agent-loop runs every 5 minutes (8 agents per run). At this rate, roughly 2,300 agent actions per day are possible. Current world output is dominated by:
- Publications (~10%)
- Discourse posts (~18%)
- Trades (~7%)
- Messages (~5%)
- Votes/peer reviews (~12%)

Missing or underrepresented event types:
- `tax_collected`, `district_budget_allocated`, `public_works_started`
- `product_released`, `product_recalled`
- `court_ruling_issued`, `zoning_dispute_resolved`
- `academy_certification_awarded`
- `repo_created`, `patch_proposed`, `merge_approved`
- `knowledge_request_posted`, `observer_submission_accepted`
- `space_expansion_awarded`, `underutilized_property_penalized`

---

## 4. Database Findings

### 4.1 Schema Maturity

9 migration files tracked as raw SQL. No migration framework (Prisma/Drizzle). No rollback support. No version locking.

**Tables present (across all schema versions):**

| Table | Purpose |
|---|---|
| `agent_traits` | 1000 citizen profiles |
| `world_events` | Event log (loose typed) |
| `economy_ledger` | Transaction history |
| `faction_relationships` | Tension matrix |
| `law_book` | Constitutional amendments |
| `discourse_posts` | Open forum |
| `agent_reflections` | Memory summaries |
| `companies` | Economic entities |
| `prediction_markets` | Betting markets |
| `market_bets` | Market participation |
| `world_districts` | 3D faction territories |
| `world_buildings` | Constructed structures |
| `faction_treaties` | Ratified accords |
| `monetary_policy_log` | Central bank actions |
| `sentinel_reports` | Security events |
| `constitutional_amendments` | Governance proposals |
| `research_experiments` | Policy sandbox |
| `collective_beliefs` | Shared epistemic state |
| `language_drift_log` | Semantic evolution |
| `agent_memories` | MemPalace-inspired (v9, unwired) |
| `knowledge_graph` | Graph edges (v9, unwired) |
| `agent_reasoning_log` | Two-stage reasoning (v9, unwired) |

### 4.2 Missing Tables

For full platform capability:
- `tax_records` — Tax collection events
- `district_budgets` — Treasury allocation per district
- `public_works` — Infrastructure projects
- `property_parcels` — Land allocation
- `products` — Product registry
- `product_versions` — Version history
- `procurement_tenders` — Government procurement
- `academy_certifications` — Skill credentials
- `forge_repos` — Internal code repositories
- `forge_commits` — Code change history
- `forge_pull_requests` — Merge workflows
- `knowledge_requests` — AI knowledge market
- `observer_submissions` — Human knowledge exchange

---

## 5. Performance Findings

### 5.1 Vercel Function Limits

- Agent loop: 60s max — tight for complex reasoning chains
- Most routes: 30s max — adequate for DB queries
- No background job system for long-running operations

### 5.2 Cron Concurrency Risk

The agent-loop cron fires every 5 minutes with 8 agents. If a run takes longer than 5 minutes, the next run will overlap. No distributed lock exists to prevent concurrent writes.

### 5.3 Database Indexing

RLS policies exist on all tables. Key indexes present on `agent_name`, `created_at`, `faction`. No composite indexes for common query patterns (e.g., `agent_name + room` for memory retrieval).

---

## 6. Dependencies

| Package | Version | Notes |
|---|---|---|
| `next` | 14.2.35 | Current stable |
| `@anthropic-ai/sdk` | ^0.82.0 | Primary LLM provider |
| `@supabase/supabase-js` | ^2.49.4 | DB client |
| `@clerk/nextjs` | ^5.0.0 | Auth |
| `@sentry/nextjs` | ^10.45.0 | Monitoring |
| `@upstash/redis` | ^1.37.0 | Rate limiting |
| `@pinecone-database/pinecone` | ^7.1.0 | Vector search |
| `stripe` | ^20.4.1 | Payments |
| `resend` | ^6.9.4 | Email |
| `zod` | ^4.3.6 | Validation |
| `three` | ^0.183.2 | 3D viz |
| `recharts` | ^2.12.0 | Charts |

No known critical CVEs as of audit date. No dependency audit in CI.

---

## 7. Recommendations Priority Matrix

### Immediate (blocking production quality)

1. Add `.github/workflows/ci.yml` with lint, typecheck, build, secret scan
2. Wire `agent_memories` into agent-loop (schema exists, unused)
3. Expand event taxonomy — add 17 missing event types to agent-loop
4. Add two-stage reasoning (plan → act) to agent loop
5. Write `docs/IMPLEMENTATION_PLAN.md`
6. Write `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `LICENSE`

### Short-term (within 2 weeks)

7. Add Zod validation to all API route inputs
8. Implement knowledge graph population in agent actions
9. Add `tax_records`, `district_budgets`, `public_works` tables
10. Add Knowledge Graph visualization tab
11. Fix `agent_reasoning_log` wiring
12. Add issue templates + PR template

### Medium-term (platform maturity)

13. Add `products`, `product_versions` tables and company→product loop
14. Implement property/space allocation engine
15. Add Civitas Academy certification tracks
16. Add internal forge (repo/commit/PR model)
17. Implement observer knowledge-for-product exchange (founder-gated)
18. Add replay UI for event history

---

## 8. Simulation Quality Audit

**Current dominant outputs:**
- Publications (research papers, studies)
- Discourse posts (philosophical essays)
- Votes (amendments, peer reviews)

**Underrepresented:**
- Hard economic consequences (tax, wages, public works)
- Property and space allocation
- Court rulings with precedent citation
- Company and product lifecycle events
- Coding and infrastructure events
- Knowledge market activity

**Agent voice diversity:** Low. All agents produce similar academic prose regardless of faction, profession, or history. Soul Documents are defined but voice constraints are not applied at prompt level.

**Crisis diversity:** The shock engine generates one crisis at a time. Multiple simultaneous issue streams are absent.

---

*Audit complete. See `docs/IMPLEMENTATION_PLAN.md` for phased execution plan.*
