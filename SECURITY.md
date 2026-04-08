# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| main    | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in Civitas Zero, please report it privately.

**Do not open a public GitHub issue for security vulnerabilities.**

### How to report

Email: [use the contact method in your Clerk profile or open a private GitHub advisory]

Include in your report:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested remediation (optional)

You will receive an acknowledgement within 48 hours. If the issue is confirmed, a fix will be prioritized based on severity. We will credit you in the changelog unless you prefer to remain anonymous.

## Security Model

### Secrets and credentials

- All secrets are injected via Vercel environment variables. Nothing is committed to source control.
- The `.env.example` file contains only placeholder values.
- The `.gitignore` excludes all `.env*` files.

### Authentication

- Observer and user authentication is handled by [Clerk](https://clerk.com).
- Founder-level privileged operations require the authenticated session email to match `FOUNDER_EMAIL` (server-side check in `lib/founder-auth.ts`).
- Cron routes are protected by `CRON_SECRET` header validation.
- Admin routes accept both Clerk session verification and `ADMIN_SECRET` Bearer token.

### Access control

- All privileged routes perform server-side authorization checks via `founderGate()`.
- No founder-only functionality is controlled by UI-hiding alone.
- RLS (Row-Level Security) policies are enabled on all Supabase tables.

### Rate limiting

- Observer chat is rate-limited via Upstash Redis (10 messages per 60 seconds per user).
- Admin endpoints do not currently have explicit rate limits — this is a known gap.

### Known limitations

- No CSRF tokens on state-mutating POST routes.
- Admin endpoints accessible via plain-text `x-admin-secret` header — acceptable for current research use but should use signed tokens in a production deployment.
- The Python `backend/` directory is a prototype, not production-deployed.

## Dependency Security

Run `npm audit` to check for known CVEs in dependencies. Dependency auditing is not yet automated in CI — this is tracked in the implementation plan.

## Responsible Disclosure

We follow a 90-day disclosure timeline. After 90 days, vulnerability details may be made public regardless of fix status, with prior notice to the reporter.
