# Cloudflare Deployment

This official site builds to a Nitro Cloudflare module. The production deploy target is Cloudflare Workers with Static Assets.

## Build Output

`pnpm run build` generates:

- `.output/server/index.mjs`: Worker entry.
- `.output/server/wrangler.json`: generated Wrangler config.
- `.output/public`: static assets.

The package scripts run Wrangler with `--cwd .output/server` so Wrangler uses the generated config and the correct relative asset directory.
The `build` script runs `cf:prepare` after Nitro generates the config, so the final `.output/server/wrangler.json` keeps dashboard variables, enables observability, and declares required production secrets.
Before Wrangler runs, `pnpm run cf:clean` removes stale `.wrangler/deploy/config.json` state only when it points back at the generated `.output/server/wrangler.json`. This prevents Wrangler from seeing two config roots during dry-runs or deploys.

## Required Runtime

- Node `22.13.0`
- pnpm `11.7.0`
- Wrangler from project dev dependencies

Node is pinned in both `.node-version` and `package.json#devEngines.runtime`.
After `pnpm install --frozen-lockfile`, pnpm scripts should run with the pinned local runtime even if the machine has an older system Node earlier in `PATH`.

## Preflight

```bash
pnpm install --frozen-lockfile
pnpm run verify
pnpm run cf:check
pnpm run check:launch
pnpm run production:readiness-plan -- --env-file .env.production --amount 100 --currency JPY
pnpm run check:cloudflare-account
pnpm run smoke:local
pnpm run smoke:url -- --base-url https://www.buyna.ai/
pnpm run cloudflare:env-plan -- --env-file .env.production
pnpm run check:prod-env -- --env-file .env.production
pnpm run check:prod-evidence
pnpm run package:update
pnpm run supabase:migration-plan
pnpm run globepay:dashboard-plan -- --env-file .env.production
pnpm run payment:verification-plan -- --amount 100 --currency JPY
pnpm run prod-evidence:plan
pnpm run deploy:preflight -- --env-file .env.production
```

`pnpm run verify` runs lint and production build. `pnpm run cf:check` rebuilds and runs `wrangler deploy --dry-run` against the generated Cloudflare Worker output without publishing.
`pnpm run cf:prepare` is included in `build`, so all `cf:*` scripts receive prepared Wrangler output before Wrangler runs.
`pnpm run cf:clean` is also included in all `cf:*` Wrangler scripts so stale deploy state cannot shadow the generated Worker config.
`pnpm run check:launch` validates that the source tree and generated Worker output still satisfy the official-site launch gates without requiring real secrets.
`pnpm run production:readiness-plan` prints the complete read-only external launch sequence and final evidence gates.
`pnpm run check:cloudflare-account` validates the local Wrangler v4 install, generated Worker config, required-secret declarations, and `wrangler whoami` login state without publishing.
`pnpm run smoke:local` starts a temporary local server and checks homepage, pricing, subscription, payment return, and AI fallback behavior.
`pnpm run smoke:url` checks an already running URL after deploy and accepts either configured or not-configured AI guide responses.
`pnpm run cloudflare:env-plan` prints the Cloudflare dashboard variable list and `wrangler secret put` commands without printing secret or variable values.
`pnpm run check:prod-env` validates production environment variables without printing secret values.
It also prints the GlobePay callback URLs and the Cloudflare variable/secret key names that must be configured, without printing secret values.
`pnpm run check:prod-evidence` validates the local `.production-evidence.json` file after GitHub, Supabase, GlobePay, Cloudflare deploy, smoke, and real payment verification are complete.
`pnpm run package:update` creates a clean source update zip for handoff, excluding secrets, production evidence, dependencies, and build output.
`pnpm run supabase:migration-plan` prints the migration files, required production tables, and SQL verification helper without connecting to production.
`pnpm run globepay:dashboard-plan` prints the exact GlobePay Japan dashboard URLs and recurring/3DS capability confirmations without contacting GlobePay.
`pnpm run payment:verification-plan` prints the real one-time and recurring payment proof steps without creating orders or charging cards.
`pnpm run prod-evidence:plan` maps each `.production-evidence.json` section to proof commands, required fields, and sensitive-data exclusions.
`pnpm run deploy:preflight` runs the full local release gate, including the Cloudflare deploy dry-run unless `--skip-dry-run` is passed, before production deployment. It also prints `prod-evidence:todo` and `audit:goal` so remaining external evidence gaps are visible before a deploy.

## Secrets And Environment Variables

Configure production values in Cloudflare, not in Git. Use `.env.example` as the local development source list and `.env.production.example` as the production preflight template.
Copy `.env.production.example` to `.env.production` only on your local machine or CI secret workspace, then fill real production values there.
After filling local values, print the redacted Cloudflare setup plan:

```bash
pnpm run cloudflare:env-plan -- --env-file .env.production
```

Use the output to set non-secret values in the Cloudflare dashboard and set Worker secrets with `wrangler secret put`. The command intentionally prints only key names and readiness states, never values.

Server-only secrets:

- `SUPABASE_SERVICE_ROLE_KEY`
- `GLOBEPAY_CREDENTIAL_CODE`
- `BILLING_TOKEN_ENCRYPTION_KEY`
- `LOVABLE_API_KEY` or `OPENAI_API_KEY`
- `PLATFORM_SUBSCRIPTION_API_KEY`

`cf:prepare` declares these hard-required Worker secrets in `.output/server/wrangler.json` through Cloudflare `secrets.required`:

- `SUPABASE_SERVICE_ROLE_KEY`
- `GLOBEPAY_CREDENTIAL_CODE`
- `BILLING_TOKEN_ENCRYPTION_KEY`

The AI guide accepts either `LOVABLE_API_KEY` or `OPENAI_API_KEY`, so that choice is validated by `pnpm run check:prod-env` instead of Wrangler's single-key required-secret list.
Do not create any VITE_* variables for secrets. In particular, never configure `VITE_SUPABASE_SERVICE_ROLE_KEY`, `VITE_GLOBEPAY_CREDENTIAL_CODE`, `VITE_BILLING_TOKEN_ENCRYPTION_KEY`, `VITE_OPENAI_API_KEY`, `VITE_LOVABLE_API_KEY`, or `VITE_PLATFORM_SUBSCRIPTION_API_KEY`.

Public or non-secret environment values:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `PUBLIC_SITE_URL`
- `APP_URL`
- `GLOBEPAY_MODE`
- `GLOBEPAY_API_BASE_URL`
- `GLOBEPAY_BASE_URL`
- `GLOBEPAY_PARTNER_CODE`
- `GLOBEPAY_NOTIFY_URL`
- `GLOBEPAY_RECURRING_NOTIFY_URL`
- `GLOBEPAY_RETURN_URL`
- `PLATFORM_ACCOUNT_URL`
- `PLATFORM_SUBSCRIPTION_API_URL`

Example secret command:

```bash
pnpm run build
pnpm exec wrangler --cwd .output/server secret put GLOBEPAY_CREDENTIAL_CODE
```

Use Cloudflare dashboard variables for non-secret values, or Wrangler config only after confirming they are not sensitive.

Production URL guards enforced by `pnpm run check:prod-env`:

- `PUBLIC_SITE_URL` and `APP_URL` must be origin-only URLs, for example `https://www.buyna.ai`.
- Production URLs must not use localhost.
- Production URLs must not point to a Lovable preview domain.
- GlobePay callback URLs must not include query strings or hash fragments.
- GlobePay callback URLs must not start with `=`.
- `SUPABASE_SERVICE_ROLE_KEY` must not equal the publishable Supabase key.

Set these exact callback URLs in the GlobePay merchant dashboard for production:

- One-time notify: `https://www.buyna.ai/api/public/globepay/notify`
- Recurring notify: `https://www.buyna.ai/api/public/globepay-recurring-notify`
- Return URL: `https://www.buyna.ai/subscription/return`

## Deploy

```bash
pnpm run deploy:preflight -- --env-file .env.production
pnpm run check:cloudflare-account
pnpm run cf:deploy:dry-run
pnpm run cf:deploy
pnpm run smoke:url -- --base-url https://www.buyna.ai/
pnpm run check:prod-evidence
```

`cf:deploy` passes `--keep-vars` so dashboard-managed variables and secrets are not overwritten by deploys.

Use `--skip-prod-env` only for CI/source checks that do not have production secrets, and `--skip-dry-run` only when Wrangler authentication is intentionally unavailable.
For the full production sequence, use `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md`.

After deploy, run `pnpm run prod-evidence:init` locally and record only non-secret proof: full Git commit SHA, CI run URL, checked timestamps, applied migration filenames, exact GlobePay callback URLs, Cloudflare deployment URL, smoke result, and masked payment/subscription dashboard references. The real evidence file is ignored by Git.

## Production Checklist

- Supabase migrations are applied to the production project.
- `PUBLIC_SITE_URL` and `APP_URL` are set to `https://www.buyna.ai`.
- GlobePay one-time/hosted-card notify URL points to `https://www.buyna.ai/api/public/globepay/notify`.
- GlobePay recurring notify URL points to `https://www.buyna.ai/api/public/globepay-recurring-notify`.
- GlobePay return URL points to `https://www.buyna.ai/subscription/return`.
- The three GlobePay URLs pass `pnpm run check:prod-env -- --env-file .env.production`.
- `GLOBEPAY_MODE=live` only after credentials and callback URLs are verified.
- Test with a small payment amount before announcing production readiness.
- `pnpm run check:prod-evidence` and `pnpm run audit:goal:strict` pass before marking the official-site goal complete.
