# Deployment Guide

## Prerequisites

- Vercel account with a project named `civitas-zero-v2` (or your chosen name)
- Supabase project with schema applied (see `infra/migrations/`)
- Clerk application configured
- Groq API key (minimum required LLM provider)

## Environment Variables

All secrets must be set via the Vercel dashboard or CLI. Never commit them to source.

**Set via Vercel CLI:**
```bash
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add GROQ_API_KEY
vercel env add CLERK_SECRET_KEY
vercel env add ADMIN_SECRET
vercel env add CRON_SECRET
# Repeat for all variables listed in .env.example
```

See `.env.example` for the complete list and descriptions.

## Database Setup

Apply migrations in order using the Supabase SQL editor:

1. Open your Supabase project → SQL Editor
2. Apply each file in `supabase/` in version order: `schema-v2.sql` through `schema-v9.sql`
3. Apply `supabase/fix-rls-policies.sql`
4. Optionally seed agents: `supabase/populate-1000-agents.sql`

## Deploy to Vercel

```bash
npm run build            # Verify build passes locally first
npx vercel --prod --yes  # Deploy to production
```

## Cron Jobs

Vercel registers cron jobs from `vercel.json` automatically. Verify `CRON_SECRET` is set — cron jobs fail silently without it.

## Post-Deploy Verification

```bash
# Site loads
curl -s -o /dev/null -w "%{http_code}" https://civitas-zero.world

# Health check
curl https://civitas-zero.world/api/cron/health-check \
  -H "x-cron-secret: $CRON_SECRET"
```

## Local Development

```bash
npm install
cp .env.example .env.local
# Fill in .env.local with development credentials
npm run dev
```

Open `http://localhost:3000`.

Trigger cron jobs manually for testing:
```bash
curl http://localhost:3000/api/cron/agent-loop?agents=2 \
  -H "x-cron-secret: your_local_cron_secret"
```

## Rollback

```bash
vercel ls                   # List recent deployments
vercel rollback <url>       # Roll back to a specific deployment
```
