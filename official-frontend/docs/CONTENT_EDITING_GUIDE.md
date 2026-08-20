# Official Site Content Editing Guide

This guide explains where to change Buyna.ai official-site content before local preview and cloud deployment.

## Main Editable Content

Edit static official-site copy in:

```text
src/content/official-site.ts
```

Use this file for:

- Home page title, SEO description, and Open Graph description.
- Header navigation labels and links.
- Hero headline, description, and CTA labels.
- Home page stat labels.
- Ecosystem, merchant scenario, AI guide, and "why choose Buyna" sections.
- Home page subscription plan cards.
- Home page pricing labels, recommended badge, setup-fee text, and payment trust note.
- `/pricing` page copy, loading state, error prefix, CTA text, and monthly-price labels.
- Basic/Pro plan feature text.
- Which plan is marked as recommended.

Recommended staged edits:

1. Brand and homepage positioning: update `officialSiteMeta`, `officialNavLinks`, `homeHeroContent`, `homeStats`, `homeEcosystemSection`, and `homeWhyChooseSection`.
2. Merchant offer and subscription packaging: update `homeMerchantSection`, `homePricingSection`, `homepageSubscriptionPlans`, `pricingPageContent`, `subscriptionPlanFeatures`, and `recommendedSubscriptionPlanCode`.
3. AI shopping guide positioning: update `homeAiGuideSection` and the opening copy in `src/components/AIShoppingGuideInline.tsx` only when the chat UI wording itself needs to change.

After editing it, run:

```bash
pnpm run check:content
pnpm run verify
pnpm run cf:check
```

`pnpm run check:content` verifies that Chinese, Japanese, and English official-site copy keep the same structure, non-empty strings, matching plan feature keys, and no mojibake.
`pnpm run cf:check` performs a Cloudflare `wrangler deploy --dry-run`; it validates the generated Worker output without publishing.

## Pricing Sources

There are two pricing surfaces:

- Home page pricing preview: configured in `src/content/official-site.ts`.
- `/pricing` live pricing page: loaded from the public plans API/Supabase, with feature text from `src/content/official-site.ts`.

For production price changes, update the backend/Supabase plan records first. Keep the homepage preview in sync so visitors do not see conflicting prices.

## Do Not Put These In Content Files

Never add secrets or real credentials to `src/content/official-site.ts`, route files, or documentation examples:

- Supabase service role key.
- AI API keys.
- GlobePay credential code.
- Billing token encryption key.
- Platform subscription API key.

Set production values in Cloudflare environment variables/secrets. Use `.env.example` only as the variable checklist.

## Payment And Callback Text

If payment copy changes, confirm it still matches the actual GlobePay flow:

- One-time/hosted-card notify: `/api/public/globepay/notify`
- Recurring notify: `/api/public/globepay-recurring-notify`
- Subscription return: `/subscription/return`

Do not change these URLs in public copy without updating GlobePay dashboard settings and Cloudflare production environment variables.

## Recommended Edit Workflow

1. Edit `src/content/official-site.ts`.
2. Run `pnpm exec prettier --write src/content/official-site.ts`.
3. Run `pnpm run check:content`.
4. Run `pnpm run verify`.
5. Run `pnpm run cf:check` for the Cloudflare dry-run check.
6. Run `pnpm run smoke:local`.
7. Preview locally with `pnpm run preview:local` and open `http://127.0.0.1:8080/`.
8. Only deploy after production secrets, Supabase migrations, domain, and GlobePay callback URLs are verified.
