# GitHub Source Of Truth

Use this checklist after local verification is green and the intended official frontend changes are committed.
To print a read-only setup plan from the current local state, run:

```bash
pnpm run github:source-plan
```

The plan does not add remotes, push commits, or create pull requests. It shows the current branch, commit, source cleanliness, GitHub remote, GitHub CLI/auth state, and the exact next commands to run after access is available.

## Current Local Baseline

- Project directory: `official-frontend`
- Expected branch: `codex/official-frontend-source`
- Local source must be clean for `official-frontend`, `.github`, and `.gitignore`.
- Do not push unrelated untracked files from the repository root.

## Prerequisites

Install and authenticate GitHub CLI:

```bash
gh --version
gh auth login
gh auth status
```

Configure the production GitHub repository as `origin`:

```bash
git remote add origin git@github.com:OWNER/REPOSITORY.git
git remote -v
```

Use the repository that will be connected to the production deployment pipeline.

## Push The Official Frontend Branch

```bash
git status -sb
git status --short official-frontend .github .gitignore
pnpm run github:source-plan
git push -u origin codex/official-frontend-source
pnpm run check:github-source
```

Only push after `official-frontend`, `.github`, and `.gitignore` are clean or intentionally committed.
`pnpm run check:github-source` should pass before filling the GitHub section of `.production-evidence.json`.

## Open A Draft Pull Request

```bash
gh pr create --draft --fill --head codex/official-frontend-source
```

Use `.github/pull_request_template.md` as the PR checklist.

The PR should mention:

- multilingual official site content for Chinese, Japanese, and English
- centralized staged content editing in `src/content/official-site.ts`
- AI shopping guide copy and fallback behavior
- merchant subscription and GlobePay return/payment pages
- Cloudflare Worker build, dry-run, and guardrail scripts
- validation commands used locally

## Required Checks Before Merge

Run these locally and keep the PR checks green:

```bash
pnpm run verify
pnpm run check:github-source
pnpm run check:launch
pnpm run cf:check
pnpm run package:update
pnpm run package:check
pnpm run smoke:local -- --ai-mode skip
pnpm run audit:goal
```

## Production Evidence After Deployment

After production deployment, initialize local `.production-evidence.json` and fill it with real evidence for:

```bash
pnpm run prod-evidence:init
```

- GitHub source of truth
- production environment variables
- Supabase production migrations
- GlobePay merchant dashboard callback URLs
- production deployment URL and smoke result
- real one-time payment verification
- real recurring subscription verification

Then run:

```bash
pnpm run check:prod-evidence
pnpm run audit:goal:strict
```

`audit:goal:strict` should pass only after all external production evidence is real and verified.
