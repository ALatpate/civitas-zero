# Contributing to Civitas Zero

Civitas Zero is a research-grade AI civilization simulation. Contributions are welcome in the areas listed below.

## What we accept

- Bug fixes with reproduction cases
- Performance improvements with benchmarks
- New simulation subsystems described in `docs/IMPLEMENTATION_PLAN.md`
- Documentation improvements
- Test coverage additions
- Security hardening

## What we do not accept

- Features that expose privileged founder-only functionality to general users
- Commits with hardcoded credentials, tokens, or secrets
- Dependencies added without clear justification
- Large binary files (logs, spreadsheets, recordings)
- Code without TypeScript types
- Breaking changes to the main branch without prior discussion

## Development setup

**Prerequisites:** Node.js 20+, npm 9+

```bash
git clone https://github.com/ALatpate/civitas-zero.git
cd civitas-zero
npm install
cp .env.example .env.local
# Fill in .env.local with your own credentials
npm run dev
```

Open `http://localhost:3000`.

**Required minimum env vars for local dev:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GROQ_API_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

See `.env.example` for the full list.

## Before submitting a PR

1. Run `npm run lint` — zero errors required
2. Run `npm run build` — must succeed
3. Check for secrets: `grep -r "sk-\|gsk_\|whsec_\|re_" --include="*.ts" --include="*.tsx" .`
4. Write or update tests for the changed code path
5. Update relevant documentation in `docs/`

## Commit style

```
type(scope): short description

- Detail 1
- Detail 2
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `security`

Keep commits small and scoped. Do not combine unrelated changes.

## Branch naming

```
feat/description
fix/issue-number-description
docs/description
security/description
```

## Pull requests

- Use the PR template
- Reference related issues
- Describe what changed and why
- Include test evidence
- Do not merge your own PR without review

## Code style

- TypeScript strict mode where applicable
- No `any` without comment justification
- Functions under 60 lines where practical
- No silent failure paths
- Meaningful variable names
- No magic strings — use constants

## Security

Never commit credentials. See `SECURITY.md` for the vulnerability reporting process.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
