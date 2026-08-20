# External Production Checklist

This checklist maps the remaining `pnpm run audit:goal` gaps to concrete external actions.

Run this first to see the current state:

```bash
pnpm run audit:goal
```

To print the full read-only launch sequence from one command:

```bash
pnpm run production:readiness-plan -- --env-file .env.production --amount 100 --currency JPY
```

To print every sub-plan immediately, add `--run-plans`. The command still does not push, mutate dashboards, apply migrations, deploy, or charge cards.

After GitHub, Cloudflare, and production credentials are available, restart the non-destructive resume check:

```bash
pnpm run resume:after-access
```

This command automatically runs the GitHub source check, Cloudflare account check, production env check, local release gate, production evidence check, and full goal audit. It does not run `pnpm run cf:deploy`.

To leave a safe automatic checker running while access is being unlocked, use:

```bash
pnpm run resume:watch
```

Watch mode runs the same non-deploying checks every 5 minutes. When every check passes, it stops and prints the explicit deploy commands to run manually.
Every run writes `.resume-after-access-status.json` locally so the latest readiness state can be inspected without scrolling through terminal history. The file is ignored by Git and excluded from update packages.
On Windows, start the same watcher in a hidden background PowerShell process:

```powershell
pnpm run resume:watch:background:windows
```

It writes the same status file and logs terminal output to `.resume-after-access-watch.log`. The background watcher still does not run `pnpm run cf:deploy`.
To print that status as a short terminal summary, run:

```bash
pnpm run resume:status
```

The committed `.resume-after-access-status.example.json` shows the expected local status shape.

If you want deployment to start automatically after restrictions are lifted and every access check passes, run the explicit deploy watcher instead:

```bash
pnpm run resume:deploy-after-access
```

On Windows, run it in the background with:

```powershell
pnpm run resume:deploy-after-access:background:windows
```

This deploy watcher runs `pnpm run cf:deploy` and then `pnpm run smoke:url -- --base-url https://www.buyna.ai/` only after the same resume checks have all passed. Use `pnpm run resume:watch` when you want automatic checking without automatic production deployment.

## 1. GitHub Source Of Truth

Goal: the `official-frontend` source is pushed to the GitHub repository used for production.

Actions:

```bash
gh --version
gh auth login
git remote add origin git@github.com:OWNER/REPOSITORY.git
pnpm run github:source-plan
git push -u origin codex/official-frontend-source
pnpm run check:github-source
```

Evidence to record in `.production-evidence.json`:

- Full commit SHA
- GitHub repository URL
- Branch name
- `github:source-plan` command timestamp
- CI run URL
- CI conclusion

## 2. Cloudflare Account And Worker Deploy Target

Goal: Wrangler is authenticated and the generated Worker config can deploy to the production Cloudflare account.

Actions:

```bash
pnpm exec wrangler login
pnpm run build
pnpm run cloudflare:env-plan -- --env-file .env.production
pnpm run check:cloudflare-account
pnpm run cf:deploy:dry-run
```

Evidence to record:

- Cloudflare account check timestamp
- Worker name: `buyna-ai-official`
- `cloudflare:env-plan` command timestamp
- Dry-run command and success timestamp
- Required secret names confirmed in Cloudflare

Do not record secret values.

## 3. Production Environment

Goal: all production environment values are configured outside Git and pass local validation.

Actions:

```bash
cp .env.production.example .env.production
pnpm run check:prod-env -- --env-file .env.production
```

Evidence to record:

- Production site URL: `https://www.buyna.ai`
- GlobePay callback URLs
- Cloudflare variable and secret key names
- Validation timestamp

Do not commit `.env.production`.

## 4. Supabase Production Migration

Goal: production Supabase has the schema required by AI guide, subscriptions, charges, and GlobePay records.

Actions:

- Review `supabase/migrations`.
- Run `pnpm run supabase:migration-plan`.
- Apply migrations to staging first.
- Apply migrations to production.
- Confirm required tables exist in production.

Required tables:

- `ai_guide_sources`
- `ai_guide_conversations`
- `subscription_plans`
- `buyna_customers`
- `buyna_subscriptions`
- `buyna_subscription_charges`
- `globepay_recurring_agreements`

Evidence to record:

- `supabase:migration-plan` command timestamp
- Applied migration filenames
- Production project reference or masked URL
- Verification timestamp

## 5. GlobePay Merchant Dashboard

Goal: GlobePay Japan production callbacks and recurring capability are ready.

Actions:

```bash
pnpm run globepay:dashboard-plan -- --env-file .env.production
```

Set these exact URLs:

- One-time notify: `https://www.buyna.ai/api/public/globepay/notify`
- Recurring notify: `https://www.buyna.ai/api/public/globepay-recurring-notify`
- Return URL: `https://www.buyna.ai/subscription/return`

Confirm:

- `GLOBEPAY_MODE=live`
- Japan API host is `https://pay.globepay.co.jp`
- WorldPay Recurring is enabled
- Hosted 3DS is enabled

Evidence to record:

- `globepay:dashboard-plan` command timestamp
- Callback URLs
- WorldPay Recurring enabled status
- Hosted 3DS enabled status
- Masked merchant/account reference

## 6. Production Deployment

Goal: Cloudflare production deploy is complete and the deployed URL passes smoke checks.

Actions:

```bash
pnpm run deploy:preflight -- --env-file .env.production
pnpm run cf:deploy
pnpm run smoke:url -- --base-url https://www.buyna.ai/
```

Evidence to record:

- Full commit SHA deployed
- Worker deployment URL
- Smoke command and timestamp
- Cloudflare deployment/version reference

## 7. Real Payment Verification

Goal: one-time payments and recurring subscriptions are verified with real provider status, not frontend return-page assumptions.

Actions:

```bash
pnpm run payment:verification-plan -- --amount 100 --currency JPY
```

One-time payment proof:

- Start a small payment.
- Confirm verified notify or query returns `PAY_SUCCESS`.
- Confirm local order/payment record is marked paid only after provider verification.

Recurring subscription proof:

- Start a small subscription.
- Complete hosted 3DS.
- Confirm recurring agreement status is `ACTIVE`.
- Confirm the first charge result is `PAY_SUCCESS`.

Evidence to record:

- `payment:verification-plan` command timestamp
- Masked order or subscription references
- Provider status names
- Verification timestamps
- No card data, no raw webhook payloads, no customer PII

## 8. Final Evidence Gate

After the external work is complete:

```bash
pnpm run resume:after-access
pnpm run prod-evidence:init
pnpm run prod-evidence:plan
pnpm run prod-evidence:todo
pnpm run check:prod-evidence
pnpm run audit:goal:strict
```

The goal is complete only when `audit:goal:strict` passes with real current evidence.
