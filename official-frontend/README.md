# Buyna.ai Official Frontend

This is the main code source for the Buyna.ai official site.

## Goal

- Keep the official site reproducible from GitHub.
- Preview locally before cloud deployment.
- Keep AI, Supabase, GlobePay, and subscription secrets server-side.
- Deploy the built TanStack Start app to Cloudflare Workers from `.output/server`.

## Local Setup

Use Node `22.13.0` and pnpm `11.7.0`.

The runtime is declared in both `.node-version` and `package.json#devEngines.runtime`.
Run `pnpm install --frozen-lockfile` before project scripts so pnpm can use the pinned local Node runtime instead of an older system Node.

```bash
pnpm install --frozen-lockfile
pnpm run preview:local
```

Open the local site at:

```text
http://127.0.0.1:8080/
```

Useful local preview controls:

```bash
pnpm run preview:local:status
pnpm run preview:local:stop
```

`preview:local` restarts one fixed-port Vite dev server on `127.0.0.1:8080` and writes local logs to `.local-preview.out.log` / `.local-preview.err.log`. These log files are ignored and excluded from update packages.

## Verification

```bash
pnpm run verify
pnpm run check:content
pnpm run cf:check
pnpm run check:launch
pnpm run audit:goal
pnpm run prod-evidence:init
pnpm run check:prod-evidence
pnpm run smoke:local
pnpm run smoke:url -- --base-url https://www.buyna.ai/
pnpm run check:prod-env -- --env-file .env.production
pnpm run check:github-source
pnpm run check:cloudflare-account
pnpm run package:update
pnpm run deploy:preflight -- --env-file .env.production
```

`pnpm run verify` runs lint, multilingual content validation, and production build. The production build automatically runs `cf:prepare` so Nitro's generated Wrangler config keeps the Cloudflare production guardrails.
`pnpm run check:content` validates the Chinese, Japanese, and English official-site content structure before staged copy edits ship.
`pnpm run cf:check` builds and runs `wrangler deploy --dry-run` against the generated Cloudflare Worker output without publishing.
`pnpm run cf:prepare` post-processes Nitro's generated Wrangler config with production guardrails before Wrangler runs.
`pnpm run check:launch` validates source-control, AI guide, GlobePay callback, Supabase migration, CI, and generated Cloudflare output shape.
`pnpm run audit:goal` reports what is already proven for the full official-site goal and what still needs external production evidence. Use `pnpm run audit:goal:strict` only when you expect every production evidence item to be complete.
`pnpm run prod-evidence:init` creates a local `.production-evidence.json` starter with the current commit and migration list, while keeping external proof fields incomplete until real production checks are done.
`pnpm run check:prod-evidence` validates the local `.production-evidence.json` file after production deployment. The real evidence file is ignored by Git.
`pnpm run smoke:local` starts a temporary local server and verifies the public official site, subscription/payment return pages, and AI not-configured fallback.
`pnpm run smoke:url` checks an already deployed URL and allows the AI guide to be either configured or not configured.
`pnpm run check:prod-env` validates production environment variables without printing secret values.
`pnpm run check:github-source` validates that the current branch is pushed to the configured GitHub `origin` and that the latest CI run for the branch succeeded.
`pnpm run check:cloudflare-account` validates the local Wrangler v4 install, generated Worker config, and Cloudflare login state without deploying.
`pnpm run package:update` creates a source update zip in Downloads, excluding real secrets, local evidence, dependencies, and build output.
`pnpm run deploy:preflight` runs the full local release gate, including the Cloudflare deploy dry-run unless `--skip-dry-run` is passed, before `cf:deploy`. It also prints the production evidence todo and goal audit report so remaining external gates are visible before deployment.

## Environment

Copy `.env.example` to `.env` for local development only. Do not commit `.env`.
Copy `.env.production.example` to `.env.production` for production preflight only. Do not commit `.env.production`.

Production values must be configured in the cloud platform:

- Supabase public URL/key and service role key
- AI key (`LOVABLE_API_KEY` or `OPENAI_API_KEY`)
- GlobePay Japan partner and credential code
- GlobePay production notify, recurring notify, and return URLs
- Billing token encryption key
- Optional platform subscription account/API values

## Deployment

See `docs/GITHUB_SOURCE_OF_TRUTH.md`, `docs/CLOUDFLARE_DEPLOYMENT.md`, `docs/EXTERNAL_PRODUCTION_CHECKLIST.md`, and `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md`.

## Update Package

See `docs/UPDATE_PACKAGE.md` for the full source-package workflow.

Create a clean source package for handoff or manual update:

```bash
pnpm run package:update
```

The zip is written to `Downloads` by default and includes `UPDATE_PACKAGE_MANIFEST.json`.
It intentionally excludes `.env`, `.env.production`, `.production-evidence.json`, local preview logs, `node_modules`, `.output`, `.wrangler`, `.vinxi`, and Git metadata.
The manifest records the source commit, included roots, exclusions, local verification commands, and external production-gate commands.

Main commands:

```bash
pnpm run deploy:preflight -- --env-file .env.production
pnpm run check:cloudflare-account
pnpm run cf:deploy:dry-run
pnpm run cf:deploy
pnpm run smoke:url -- --base-url https://www.buyna.ai/
pnpm run prod-evidence:init
pnpm run check:prod-evidence
```

Use `cf:deploy` only after production secrets, domain, Supabase migrations, and GlobePay callback URLs are ready.

Before announcing the goal as complete, run:

```bash
pnpm run audit:goal:strict
```

It is expected to fail until GitHub remote/push, production secrets, Supabase production migrations, GlobePay dashboard callbacks, deployed URL smoke, small real payment/subscription verification, and `.production-evidence.json` are all done.

## Modification Plan

Start with `docs/CONTENT_EDITING_GUIDE.md` when changing homepage copy, navigation, or plan card text.

See `docs/OFFICIAL_SITE_ROADMAP.md` for the broader staged modification plan.
