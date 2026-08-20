# Buyna.ai Official Site Roadmap

## Goal

Make this directory the main code source for the Buyna.ai official site:

- Local preview works with pinned Node 22.13.0 and pnpm.
- Production build is reproducible from GitHub.
- Public official-site copy, AI shopping guide, merchant subscription, GlobePay payment, and deployment settings can be changed in stages.
- Secrets stay in deployment environment variables, never in source control.

## Current Project Shape

- Framework: TanStack Start / React / Vite through Lovable config.
- Package manager: pnpm 11.7.0.
- Runtime: Node 22.13.0, pinned by `.node-version` and `package.json#devEngines.runtime`.
- Data layer: Supabase.
- Payment/subscription: GlobePay Japan server functions.
- AI guide: server route at `/api/ai-shopping-guide`.

## Modification Stages

1. Official homepage and positioning
   - Update hero, service explanation, merchant benefits, pricing, CTA buttons, policy links, and footer.
   - Keep shared homepage/pricing copy in `src/content/official-site.ts`; see `docs/CONTENT_EDITING_GUIDE.md`.
   - Edit staged content blocks there: `homeHeroContent`, `homeEcosystemSection`, `homeMerchantSection`, `homePricingSection`, `pricingPageContent`, `homeAiGuideSection`, and `homeWhyChooseSection`.
   - Validate desktop and mobile in the local browser.

2. Merchant entry and subscription
   - Verify login route, admin routes, subscription return route, and merchant subscription status pages.
   - Keep subscription state matched by stable merchant/domain identifiers, not GlobePay partner code.

3. GlobePay setup
   - Use `https://pay.globepay.co.jp` / `https://pay.globepay.co.jp/api/v1.0`.
   - Keep `GLOBEPAY_CREDENTIAL_CODE` server-side only.
   - Mark paid only after backend notify/query verification.
   - Production one-time notify, recurring notify, and return URLs must point to the production domain.

4. AI shopping guide
   - Keep AI keys server-side.
   - Load recommendations from `ai_guide_sources`.
   - Log conversations to `ai_guide_conversations` best-effort.
   - Do not invent unavailable products, prices, merchants, or links.

5. Cloud deployment
   - Deploy from GitHub, not a local zip.
   - Configure Node 22+ and pnpm.
   - Apply Supabase migrations before production use.
   - Configure local values from `.env.example`; configure production values from `.env.production.example`.
   - Let `pnpm run build` update generated Wrangler output through its automatic `cf:prepare` step before `check`, `dry-run`, or `deploy`.
   - Follow `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md` before announcing production readiness.
   - Run `pnpm run audit:goal` to see which parts are locally proven and which still require production evidence.
   - Initialize local `.production-evidence.json` with `pnpm run prod-evidence:init` after production deployment, fill real proof, then run `pnpm run check:prod-evidence`.

## Skills To Use

- `buyai-lovable-project-builder`: overall official-site/Lovable/TanStack coordination.
- `buyai-storefront-layout-ux`: homepage, nav, footer, policy links, mobile layout.
- `buyai-globepay-payment`: payment/return/notify/subscription routing.
- `buyai-globepay-config`: GlobePay host, env vars, signing, currency, credential errors.
- `browser:control-in-app-browser`: local preview and UI verification.
- `openai-developers:openai-platform-api-key`: OpenAI key setup when enabling OpenAI-backed guide.
- `github:yeet`: commit, push, and PR before cloud deployment.

## Local Commands

```bash
pnpm install --frozen-lockfile
pnpm run dev
pnpm run verify
pnpm run build
pnpm run cf:check
pnpm run check:launch
pnpm run check:github-source
pnpm run audit:goal
pnpm run prod-evidence:init
pnpm run check:prod-evidence
pnpm run smoke:local
pnpm run smoke:url -- --base-url https://www.buyna.ai/
pnpm run check:prod-env -- --env-file .env.production
pnpm run deploy:preflight -- --env-file .env.production
pnpm run cf:deploy:dry-run
```

`pnpm run cf:check` performs the Cloudflare `wrangler deploy --dry-run` validation without publishing.

If local development needs placeholder env values, copy `.env.example` to `.env` and fill only local-safe values.

For content editing details, see `docs/CONTENT_EDITING_GUIDE.md`.

For Cloudflare deployment details, see `docs/CLOUDFLARE_DEPLOYMENT.md`.

For the production launch checklist, see `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md`.

For a current gap report against the full goal, run `pnpm run audit:goal`. The strict form, `pnpm run audit:goal:strict`, should pass only after GitHub, Cloudflare, Supabase, GlobePay, real payment/subscription evidence, and local `.production-evidence.json` validation are all in place.
