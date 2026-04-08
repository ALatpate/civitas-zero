# Security Remediation Log

**Date:** 2026-04-08

## Findings and Status

### Finding 1: Large binary and log files tracked in git
**Severity:** Low (no credentials, only repo bloat)  
**Status:** Remediated

**Files removed from git tracking:**
- `civitas-zero-log.json` (1.8 MB — event log)
- `civitas_zero_audit_research.xlsx` (56 KB — spreadsheet)
- `civitas_zero_technical_guide.docx` (42 KB — Word document)
- `civitas_zero_master_build_guide_bundle/*.txt` (3 files)

**Action taken:**
- `git rm --cached` for each file
- Added exclusion patterns to `.gitignore`
- Files remain on disk but are no longer tracked

---

### Finding 2: Founder email hardcoded as fallback
**Severity:** Informational  
**Status:** Acceptable for current research phase

`lib/founder-auth.ts` contains:
```typescript
const FOUNDER_EMAIL = process.env.FOUNDER_EMAIL || 'latpate.aniket92@gmail.com';
```

**Assessment:** The fallback is not a secret — it is a public identifier. The actual security gate is the Clerk session verification, not the email value itself. In a multi-tenant deployment, this fallback should be removed and the env var made required.

**Action required for production hardening:** Set `FOUNDER_EMAIL` as a required env var (no fallback). Document in `.env.example` as required.

---

### Finding 3: No secret scan in CI
**Severity:** Medium  
**Status:** Remediated

**Action taken:** Added `.github/workflows/ci.yml` with a secret scan job that:
- Checks for OpenAI-style key patterns (`sk-`, `gsk_`, `sk-ant-`)
- Checks for Supabase service role key patterns
- Verifies `.env*` files are not tracked

---

### Finding 4: Admin endpoints accept plain-text header
**Severity:** Low for current use  
**Status:** Documented, not yet remediated

`lib/founder-auth.ts` accepts `x-admin-secret` header in addition to Clerk session. In log-forwarding pipelines, this header could appear in access logs.

**Recommended action (not yet implemented):**
- Remove plain-text header fallback
- Require Clerk session for all admin operations
- Use signed tokens with short expiry for server-to-server admin calls

---

### Finding 5: No CSRF protection on state-mutating routes
**Severity:** Low (Clerk handles CSRF for authenticated routes)  
**Status:** Documented

Clerk's session management provides CSRF protection for authenticated routes via the `__session` cookie with SameSite=Strict. Unauthenticated routes that mutate state (cron endpoints) are protected by `CRON_SECRET` header.

**No immediate action required.**

---

### Finding 6: Rate limit single point of failure (Upstash)
**Severity:** Medium  
**Status:** Documented

Chat routes depend on Upstash Redis for rate limiting. If Upstash is unavailable, the chat API returns 429 errors.

**Recommended action:** Add fallback to in-memory rate limiting with a warning log when Upstash is unavailable.

---

## No Secrets Found

A full search of tracked source files for common secret patterns returned no results:
- No `sk-` prefixed keys
- No `gsk_` Groq keys  
- No `whsec_` webhook secrets
- No `re_` Resend keys
- No Supabase credentials
- No bearer tokens in source files

All credentials are injected via environment variables at runtime.
