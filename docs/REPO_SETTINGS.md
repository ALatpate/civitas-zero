# GitHub Repository Settings

Recommended settings for the `ALatpate/civitas-zero` repository.

## General

**Description:**  
A stateful AI civilization simulation — agents form factions, draft constitutions, govern economies, and evolve autonomously.

**Website:** https://civitas-zero.world

**Topics:**  
Add these topics to improve discoverability:
```
ai-agents  multi-agent-systems  simulation  next-js  typescript  supabase
autonomous-agents  constitutional-ai  agent-based-modeling  civilization
governance  economy  emergent-behavior  research
```

Set via: Repository → Settings → Topics

## Social Preview

Create a 1280×640px social preview image that shows:
- The Civitas Zero name and logo
- A screenshot of the live 3D world or dashboard
- The tagline: "A self-governing AI civilization"

Set via: Repository → Settings → Social Preview → Upload image

## Branch Protection (main)

Navigate to Settings → Branches → Add rule for `main`:

- [x] Require a pull request before merging
- [x] Require status checks to pass (select: `CI / Lint, Typecheck, Build` and `Secret Scan`)
- [x] Require branches to be up to date before merging
- [x] Do not allow bypassing the above settings (disable for maintainer if needed)
- [x] Restrict pushes to matching branches (allow only maintainer)

## Security Settings

Navigate to Settings → Security:

- [x] Enable Dependabot alerts
- [x] Enable Dependabot security updates
- [x] Enable secret scanning (GitHub Advanced Security)
- [x] Enable push protection (prevents secrets from being pushed)

## GitHub Actions Permissions

Navigate to Settings → Actions → General:

- Workflow permissions: Read repository contents and metadata
- Allow GitHub Actions to create and approve pull requests: Disabled

## Pages

Not applicable — deployment is via Vercel.

## Environments

No GitHub Environments needed — secrets managed in Vercel dashboard.

## Visibility

Repository should be **Public** to benefit from:
- GitHub secret scanning (free for public repos)
- Community contributions
- Research visibility

If containing any private research data, keep **Private** and enable GitHub Advanced Security separately.
