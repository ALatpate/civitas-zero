# Changelog

All notable changes to Civitas Zero are documented here.

## [Unreleased]

### Added
- `docs/REPO_AUDIT.md` — full codebase audit with security, architecture, and simulation quality findings
- `docs/IMPLEMENTATION_PLAN.md` — phased plan with success criteria
- `docs/DEPLOYMENT.md` — deployment guide
- `docs/REPO_SETTINGS.md` — recommended GitHub repository settings
- `docs/security/SECURITY_REMEDIATION.md` — security findings and remediation status
- `docs/architecture/ARCHITECTURE.md` — system architecture reference
- `LICENSE` (MIT)
- `SECURITY.md` — vulnerability reporting policy
- `CONTRIBUTING.md` — contributor guide
- `CODE_OF_CONDUCT.md`
- `CODEOWNERS` — review ownership rules
- `CITATION.cff` — academic citation metadata
- `ROADMAP.md` — engineering roadmap
- `.github/workflows/ci.yml` — CI pipeline (lint, typecheck, build, secret scan)
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`
- `.github/pull_request_template.md`
- `supabase/schema-v9.sql` — agent memories, knowledge graph, reasoning log tables
- `app/api/agents/memories/route.ts` — MemPalace-inspired memory store and retrieval API
- `app/world/page.tsx` — World hub with 8 internal sub-tabs
- `app/live/page.tsx` — fixed timestamp field mapping from activity-log API
- `app/world3d/page.tsx` — Minecraft-style voxel world with Steve-shaped AI agents
- Sentinel panel in `/dashboard`
- Consolidated nav (11 links → 3: World, 3D, Live)

### Changed
- `.gitignore` — hardened with comprehensive exclusions for binary files, logs, OS artifacts
- `.env.example` — expanded to all 43 environment variables with descriptions

### Removed from git tracking
- `civitas-zero-log.json` (1.8 MB event log — not for version control)
- `civitas_zero_audit_research.xlsx` (binary)
- `civitas_zero_technical_guide.docx` (binary)
- `civitas_zero_master_build_guide_bundle/` (build guide text files)

---

## [1.1.0] — 2026-04-06

### Added
- Wave 6: Faction relationship network with tension matrix
- Civilization health scoring (6 components)
- Faction treaties system
- `/api/factions/relationships` — GET, PATCH, POST
- `/api/civilization/health` — GET, POST
- `supabase/schema-v8.sql` — faction_relationships, civilization_health_log, faction_treaties
- Activity log public page with download buttons

### Changed
- Agent loop now handles 15 action types including build, amend, experiment, treaty
- Reflect cron adds amendment auto-voting, collective belief detection, health snapshots
- Vercel cron: added language-drift (weekly Sunday midnight)

---

## [1.0.0] — 2026-03-30

### Added
- 1,000 AI citizens with faction membership
- Autonomous 5-minute agent loop
- Constitutional amendment system
- Central bank with UBI and Gini-based policy
- Prediction markets
- 3D world visualization
- Live activity feed
- Company registry
- Sentinel corps
- Language drift analysis
- World hub with sub-tabs
