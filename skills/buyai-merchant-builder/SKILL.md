---
name: buyai-merchant-builder
description: "Route a single Buyna.ai merchant request to the minimum onboarding, product, booking, Dashboard integration, checkout, payment, database, S3, or AWS Skill. Use for new-merchant registration, merchant-backend scope classification, and coordination without implementing every adjacent module."
---

# Buyai Merchant Builder

Act only as a narrow router for one merchant and one primary merchant administrator.

## Entry

1. Classify the request before loading a database or migration Skill. Resolve
   `buyna-merchant-onboarding/scripts/classify-merchant-scope.mjs` from the
   project installation, then the user installation, and run it with the
   user's explicit intent and host. Supply `project_id` and `seller_id` only
   when already known; never ask for them merely to classify the request.
   `new_independent` routes only to `buyna-merchant-onboarding`;
   `existing_alias` routes to resource reconciliation; and only
   `existing_migration` routes to `buyna-unified-merchant-architecture`.
   After routing, run the onboarding identity resolver: reuse an exact
   registered identity or generate and validate a new pair before resource
   registration.
2. Inspect the real repository and environment.
   Resolve fixed modules from project `packages/` or
   `$env:USERPROFILE/.codex/packages/`; never regenerate a missing fixed core.
3. Confirm product, booking/service, or mixed scope; languages; currency; runtime; and existing data.
4. For adding one merchant to an already verified multi-tenant backend, route directly to `buyna-merchant-onboarding`; do not require a new frontend before its intake and preflight steps.
5. Before other backend work, require the approved Phase 4 frontend/Dashboard code record and API contract. Otherwise route only to `buyna-frontend-builder`.
6. Before persistence/storage, run `buyna-project-resource-registry`; route `shared_ec2_postgresql` to `buyna-aws-data-layer` and preserve registered serverless/static/external architecture unless a separate migration is approved. Stop rather than create replacements.
7. Route only the user's current function and stop after its validation.

## Routing

- New merchant registration and fixed local project layout on existing resources → `buyna-merchant-onboarding`

- Dashboard page-to-API work → `buyai-dashboard-data-interaction`
- Products, SKU, stock, categories, orders, paid customers → `buyai-product-merchant-backend`
- Shopping cart and local pending orders → `buyai-product-merchant-backend`
- Services, availability, capacity, bookings, deposits → `buyai-booking-service-backend`
- Buyer/customer forms → `buyai-checkout-address-ux`
- GlobePay → `buyai-globepay-payment`
- Merchant and project GMV linked to CRM → `buyna-gmv-commerce`
- Structured data → `buyna-aws-data-layer`
- Project resource inventory/classification → `buyna-project-resource-registry`
- Files/images and fixed lifecycle → `buyna-s3-storage`
- Storefront UI → `buyai-storefront-layout-ux`
- AWS release → `buyna-aws-release`

For mixed scope, complete one domain and one Dashboard slice at a time.

## Boundaries

- Do not add optional modules, fields, reports, integrations, or future suggestions.
- Do not duplicate narrower Skill rules or start them merely because they appear above.
- Do not create a platform administrator, merchant switcher, or cross-merchant console.
- Use `project_id + seller_id` ownership and the approved S3 project prefix.
- Cross-project access must use an authenticated, audited server API and default to read-only.
- Keep credentials server-side; do not introduce Supabase or Lovable unless an inspected retained legacy dependency explicitly requires them.
- Mention only immediate security, data-loss, payment, or execution blockers.
