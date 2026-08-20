# Production Deployment Runbook

Use this runbook when the Buyna.ai official site is ready to move from local preview to Cloudflare production.

## Source Of Truth

- Deploy from the `official-frontend` GitHub source, not from the original zip.
- Confirm `official-frontend` is tracked and pushed to the GitHub repository that Cloudflare uses.
- Run `pnpm run github:source-plan` before pushing if the remote, GitHub CLI, or CI state is uncertain.
- Run `pnpm run check:github-source` after pushing and waiting for CI success.
- Keep Node pinned at `22.13.0` and pnpm at `11.7.0`.
- Do not commit `.env`, `.env.production`, Cloudflare secrets, GlobePay credentials, Supabase service-role keys, or AI keys.

Use the goal audit to see the current proof gaps:

```bash
pnpm run audit:goal
```

Print the full read-only production readiness sequence:

```bash
pnpm run production:readiness-plan -- --env-file .env.production --amount 100 --currency JPY
```

Use `--run-plans` to print every sub-plan in order without pushing, changing dashboards, applying migrations, deploying, or charging cards.

When GitHub, Cloudflare login, and production credentials are available, run the automatic non-deploying resume gate:

```bash
pnpm run resume:after-access
```

This resumes the production checks without publishing. It runs GitHub source validation, Cloudflare account validation, production env validation, deploy preflight/dry-run, production evidence validation, and the full goal audit.

If access is being unlocked by another dashboard or login flow, keep the safe watcher running:

```bash
pnpm run resume:watch
```

The watcher repeats the same checks every 5 minutes and stops when the site is ready for the explicit production deploy command. It does not run `pnpm run cf:deploy`.
Each run writes `.resume-after-access-status.json` locally with the latest pass/fail/skipped summary. This file is local-only and must not be committed.
On Windows, start the watcher as a hidden background process with:

```powershell
pnpm run resume:watch:background:windows
```

Background output is written to `.resume-after-access-watch.log`, which is local-only and ignored by Git.
Read the latest summary with:

```bash
pnpm run resume:status
```

Use `.resume-after-access-status.example.json` as the schema reference for the local status file.

To automatically deploy after every access check passes, use the explicit deploy watcher:

```bash
pnpm run resume:deploy-after-access
```

On Windows, start the same deploy watcher in the background with:

```powershell
pnpm run resume:deploy-after-access:background:windows
```

This mode waits until GitHub source validation, Cloudflare account validation, production env validation, deploy preflight, production evidence validation, and the goal audit all pass. Only then does it run `pnpm run cf:deploy` followed by `pnpm run smoke:url -- --base-url https://www.buyna.ai/`. Use the regular `resume:watch` command when you want automatic checking without automatic production deployment.

After production steps are complete, copy the evidence template locally:

```bash
pnpm run prod-evidence:init
pnpm run prod-evidence:plan
pnpm run prod-evidence:todo
```

Fill only non-secret proof fields such as GitHub run URL, full commit SHA, checked timestamps, migration filenames, callback URLs, deployed URL, and masked payment dashboard references. Do not put API keys, service-role keys, GlobePay credential code, card data, customer PII, or raw provider payloads in this file. The initializer records the current commit and known migration filenames but leaves external proof fields incomplete until you verify them. The real `.production-evidence.json` is ignored by Git.
Use `prod-evidence:plan` to map each evidence section to its proof command and pass condition. Use `prod-evidence:todo` to print the current missing gates, next commands, and safe fields before running `check:prod-evidence`.

## 1. Prepare Production Values

Copy the safe template locally:

```bash
cp .env.production.example .env.production
```

Fill `.env.production` with real values, then run:

```bash
pnpm run check:prod-env -- --env-file .env.production
pnpm run cloudflare:env-plan -- --env-file .env.production
```

The check prints only key names and callback URLs. It must not print secret values.
The Cloudflare plan prints the dashboard variable names and `wrangler secret put` commands without printing values.
After both commands pass, record the command names and timestamps in `.production-evidence.json`.

Required Cloudflare Worker secrets:

- `SUPABASE_SERVICE_ROLE_KEY`
- `GLOBEPAY_CREDENTIAL_CODE`
- `BILLING_TOKEN_ENCRYPTION_KEY`
- `LOVABLE_API_KEY` or `OPENAI_API_KEY` when the AI guide should answer real users
- `PLATFORM_SUBSCRIPTION_API_KEY` only if the platform subscription API is enabled

Required Cloudflare non-secret variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `PUBLIC_SITE_URL=https://www.buyna.ai`
- `APP_URL=https://www.buyna.ai`
- `GLOBEPAY_MODE=live`
- `GLOBEPAY_API_BASE_URL=https://pay.globepay.co.jp`
- `GLOBEPAY_BASE_URL=https://pay.globepay.co.jp/api/v1.0`
- `GLOBEPAY_PARTNER_CODE`
- `GLOBEPAY_NOTIFY_URL`
- `GLOBEPAY_RECURRING_NOTIFY_URL`
- `GLOBEPAY_RETURN_URL`
- Optional `PLATFORM_ACCOUNT_URL` and `PLATFORM_SUBSCRIPTION_API_URL`

Never create `VITE_*` variables for server-only secrets.

## 2. Supabase Production Database

- Print the read-only migration plan:

```bash
pnpm run supabase:migration-plan
```

- Review every SQL file in `supabase/migrations`.
- Apply migrations to staging first, then production.
- Confirm these production tables exist before taking payments: `ai_guide_sources`, `ai_guide_conversations`, `subscription_plans`, `buyna_customers`, `buyna_subscriptions`, `buyna_subscription_charges`, and `globepay_recurring_agreements`.
- Do not point preview or local development at the production database unless you are deliberately running the production preflight.
- Record the applied migration filenames and verified table names in `.production-evidence.json`.

## 3. GlobePay Merchant Dashboard

Use GlobePay Japan only:

- API host: `https://pay.globepay.co.jp`
- API base: `https://pay.globepay.co.jp/api/v1.0`

Print the read-only dashboard setup plan:

```bash
pnpm run globepay:dashboard-plan -- --env-file .env.production
```

Set these exact production callback URLs:

- One-time notify: `https://www.buyna.ai/api/public/globepay/notify`
- Recurring notify: `https://www.buyna.ai/api/public/globepay-recurring-notify`
- Return URL: `https://www.buyna.ai/subscription/return`

Before subscriptions are enabled, ask GlobePay to confirm WorldPay Recurring and 3DS are active for the production partner code.
Record the dashboard callback URLs, WorldPay Recurring enablement, and 3DS enablement in `.production-evidence.json`.

Payment success rules:

- A provider order being created is not payment success.
- One-time payment is paid only after verified notify/query returns `PAY_SUCCESS`.
- Recurring first payment must use hosted 3DS.
- Recurring agreement must become `ACTIVE` before MIT charges.
- Monthly recurring charge is paid only after query/notify returns `PAY_SUCCESS`.

## 4. Local Release Gate

Run the release gate from `official-frontend`:

```bash
pnpm install --frozen-lockfile
pnpm run deploy:preflight -- --env-file .env.production
pnpm run check:prod-evidence
pnpm run audit:goal:strict
```

If Wrangler auth is unavailable on a CI/source-check machine, use:

```bash
pnpm run deploy:preflight -- --env-file .env.production --skip-dry-run
```

Do not use `--skip-prod-env` for a real production launch.

## 5. Deploy

```bash
pnpm run cf:deploy:dry-run
pnpm run cf:deploy
```

`cf:deploy` uses `--keep-vars` so Cloudflare dashboard variables and secrets stay in place.
Record the full Git commit SHA, Worker name, deployment status, deployed URL, and smoke command result in `.production-evidence.json`.

## 6. Post-Deploy Verification

- Open `https://www.buyna.ai` and confirm homepage, pricing, login, subscription start, and `/subscription/return` load.
- Run the deployed URL smoke check:

```bash
pnpm run smoke:url -- --base-url https://www.buyna.ai/
```

- Confirm AI guide is configured only when `LOVABLE_API_KEY` or `OPENAI_API_KEY` is set.
- Print the read-only real payment verification plan:

```bash
pnpm run payment:verification-plan -- --amount 100 --currency JPY
```

- Start a small one-time payment and verify the backend marks it paid only after notify/query.
- Start a small subscription test, complete hosted 3DS, verify agreement status becomes `ACTIVE`, and verify the first charge is `PAY_SUCCESS`.
- Check admin payment/subscription pages and CSV totals against verified paid/refunded records.
- If available, test a small refund and confirm local records move to refunded while preserving the paid audit trail.
- Record only masked references and status proof in `.production-evidence.json`: no card data, no customer PII, no raw webhook payloads, no secrets.

When every production proof field has been recorded, run:

```bash
pnpm run check:prod-evidence
pnpm run audit:goal:strict
```

Useful Cloudflare commands:

```bash
pnpm exec wrangler tail buyna-ai-official
pnpm exec wrangler versions list buyna-ai-official
pnpm exec wrangler rollback buyna-ai-official
```
