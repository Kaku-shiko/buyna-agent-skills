# Buyna.ai Official Frontend PR

## Scope

- [ ] Official frontend source changes are limited to `official-frontend`, `.github`, or documented deployment files.
- [ ] Unrelated root files are not included.
- [ ] The branch is intended to become or update the Buyna.ai official-site source of truth.

## User-Facing Changes

- [ ] Chinese, Japanese, and English official-site copy is still present.
- [ ] Staged content remains editable through `official-frontend/src/content/official-site.ts`.
- [ ] AI shopping guide behavior remains server-routed and gracefully handles not-configured state.
- [ ] Merchant subscription, GlobePay return, and payment success pages still load.

## Local Verification

Run from `official-frontend` and check every command that applies:

- [ ] `pnpm run lint`
- [ ] `pnpm run verify`
- [ ] `pnpm run check:launch`
- [ ] `pnpm run cf:check`
- [ ] `pnpm run smoke:local -- --ai-mode skip`
- [ ] `pnpm run package:update`
- [ ] `pnpm run audit:goal`

## External Readiness

- [ ] `pnpm run check:github-source` passes after this branch is pushed.
- [ ] `pnpm run check:cloudflare-account` passes after Wrangler login.
- [ ] `pnpm run resume:after-access` has been run or `pnpm run resume:watch` is running while access is being unlocked.
- [ ] If automatic production deploy is intended, `pnpm run resume:deploy-after-access` is started explicitly and only after production evidence inputs are ready.
- [ ] `pnpm run resume:status` reflects the latest local readiness state.
- [ ] `.production-evidence.json` remains local-only and is not committed.

## Production Evidence

Do not mark launch complete until real non-secret evidence exists for:

- [ ] GitHub source of truth and successful CI run.
- [ ] Production environment validation.
- [ ] Supabase production migrations.
- [ ] GlobePay merchant dashboard callback URLs, WorldPay Recurring, and 3DS.
- [ ] Cloudflare production deployment and deployed URL smoke check.
- [ ] Real one-time payment verification.
- [ ] Real recurring subscription verification.

## Safety

- [ ] No real `.env`, `.env.production`, `.production-evidence.json`, `.resume-after-access-status.json`, API keys, service-role keys, GlobePay credentials, card data, or customer PII are committed.
- [ ] cf:deploy is not run automatically by the safe resume/watch scripts; only the explicit deploy-after-access scripts may run it after every access check passes.
