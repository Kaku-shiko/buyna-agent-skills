---
name: buyai-product-merchant-backend
description: "Use when a single-merchant Buyna.ai store needs product, SKU, inventory, cart, order, paid-customer, CSV, or seller Dashboard backend behavior."
---

# Buyai Product Merchant Backend

Use for product ecommerce: jewelry, apparel, goods, SKU catalogs, and shippable products. Owns products, inventory, categories, variants, images, orders, and paid customers. Does not own payment, booking capacity, or styling.

## First Move

Resolve the fixed-module root before implementation. In a repository/project
installation it is `packages/`; in a user installation it is
`$env:USERPROFILE/.codex/packages/`. For every payment-capable Buyna merchant,
also require `buyna-gmv-core`. Stop with
`BLOCKED: FIXED_COMMERCE_MODULES_NOT_INSTALLED` when Dashboard, catalog, cart,
order, PostgreSQL, or file core is missing. Do not regenerate a missing core.

Read the approved Phase 4 frontend code completion record and API contract.
Inspect the actual public product frontend and merchant Dashboard source and
confirm that the applicable frontend build/type checks passed. If the record,
source code, API contract, verification, or user approval is missing, stop and
return to `buyna-frontend-builder` Phase 4. Do not create database models,
migrations, storage rules, APIs, or backend business logic.

After the gate passes, read `references/product-commerce-rules.md` and use the
persisted languages, currency, product source, variants/SKUs, image limit, and
lifecycle capabilities. Do not repeat those confirmations. Do not ask for
missing product prices; default their source to merchant Dashboard maintenance.

For 商品管理 or 分类管理, also read
`references/merchant-catalog-fixed-core.md` and call
`packages/buyna-merchant-catalog-core`. Do not regenerate its field policies,
filter/sort rules, stock/visibility/archive operations, or transactional
ordering. Generate only the project route and database Adapter required by the
approved API contract.

When persisted `requiresInventory=true`, call
`packages/buyna-inventory-core` for reserve/commit/release and generate only
the transaction-safe project Store Adapter. When persisted
`requiresCoupons=true`, route to the single `buyai-coupon-commerce` Skill and
`packages/buyna-coupon-core`. If coupons are false, skip only coupon work; cart,
checkout, and order work remain applicable.

For shopping-cart, checkout-order creation, seller Orders, order detail, or
order CSV, read `references/cart-order-fixed-cores.md`. Call
`packages/buyna-cart-core` and `packages/buyna-order-core`; generate only the
project Store/Database Adapters, routes, pricing configuration, custom-field
mapping, and notification templates.

Select one checkout recipe from the persisted workflow:

- With no provider payment, use `packages/buyna-checkout-flow-core` with the
  cart/order modules for local review, submission, snapshot, and order lock.
- With `paymentArchitecture: fixed-cores`, use
  `packages/buyna-checkout-flow-core` to lock the local order and
  `packages/buyna-commerce-settlement-core` for trusted paid/refund transitions
  and idempotent transactional effects.
- With `paymentArchitecture: legacy-globepay-service`, use the legacy-only
  `createGlobepayService` Interface after the cart/order modules. Provider Query
  must confirm success, reconcile the exact local amount and currency, and feed
  one idempotent write. This recipe imports neither checkout-flow nor settlement
  core orchestration.

The no-payment route marks only the provider portion skipped while
`checkout_payment` remains applicable. Project code supplies only the Adapters,
configuration, API wiring, and presentation for the selected recipe.

For a mixed product-and-booking capability set, the Builder returns this Skill
and `buyai-booking-service-backend` once each. This Skill keeps product/cart/order
ownership while the booking Skill keeps reservation/capacity ownership; both
share the selected checkout/payment cores and project Adapters.

When invoked by `buyna-website-builder`, inherit the saved
`configuration.workPackage` authorization, approved fixed-module selection,
approved Adapter contract, and `interactionMode`. An included
`dashboard_integration` or `checkout_payment` slice returns evidence to the
Builder and continues without another approval question. Standalone work uses
its ordinary current-step approval. The Builder's returned `skills` and
`fixedModules` are the complete selection: do not reinvoke or add sibling
Skills from `Combine Skills` when they are already returned or were not selected.
Do not repeat onboarding. Runtime identity must never inherit from the Builder:
for each protected request obtain fresh trusted auth and resolve the current server-observed host into one request-local immutable merchant context before
calling product, inventory, order, or file Adapters. Resolve anew for every
request and host; browser owner IDs are never authority.

Before models, migrations, uploads, or persistence code, run the `buyna-aws-data-layer` Existing Resource Gate. Reuse the recorded database and S3 bucket through `buyna-s3-storage`. Stop instead of creating a database, SQLite file, DynamoDB table, bucket, or replacement AWS resource.

## Dashboard Contract Boundary

Implement authentication, authorization, persistence, products, stock, orders,
and payment-related state behind the approved Dashboard API contract. Do not
redesign Dashboard navigation, layouts, forms, visible fields, or interactions.
If backend correctness requires an interface change, stop and return a focused
change request to `buyna-frontend-builder` for user approval.

Require the approved product Dashboard UI to follow the canonical contract in
`buyna-frontend-builder/references/product-merchant-dashboard-ui.md`. Treat its
navigation as frontend-owned; this Skill implements server behavior only.

## Combine Skills

Use with `buyai-globepay-payment`, `buyai-checkout-address-ux`, `buyai-storefront-layout-ux`, and `aws-project-deployer` when AWS infrastructure or deployment is in scope.
Use `buyna-gmv-commerce` for every payment-capable Buyna merchant. The Builder's
bounded work-package authorization controls confirmation; GMV remains required
once provider payment is enabled.

## Gold

Product data is source of truth. Import customer-supplied prices when present. When absent, continue without confirmation, expose price maintenance in 商品管理, and keep the product draft/unpublished until it has a valid sellable price. Never invent a price. Backend changes to name, price, category, status, images, stock, variants, featured flag, and sort order update public pages, checkout, and seller preview.

Checkout requires buyer/shipping form and local `pending_payment`. When provider
payment is enabled, the locked local order precedes GlobePay transport. A
no-provider checkout completes local review/order flow without settlement.

## MVP

Single-merchant backend: one merchant administrator, login, session, product CRUD/archive, images/main image, categories, coupons, stock/variants, drag sorting, orders, paid customers, CSV, email, payment/subscription settings, and GlobePay portal. Route coupon rules to `buyai-coupon-commerce`; keep subscription status read-only and sourced server-to-server. Do not create a platform administrator, cross-merchant console, merchant switcher, or merchant-account management API.

Public site: backend list, category tabs, detail, checkout, payment methods, verified success, shared footer settings.

Images default max is 5 unless changed. If variants exist, detail shows options/gallery; checkout stores variant snapshot and uses SKU price/stock.

## Orders

Statuses: `pending_payment`, `paid`, `refunded`, `failed`, `expired`, `cancelled`. Orders/Paid Customers need filters, search, month, URL params, reset, pagination, CSV, and timezone. Expire unpaid older than 24h; never delete paid/refunded records. Use one silent page refresh button.

Create the pending order with the complete safe customer submission snapshot defined by `buyai-checkout-address-ux`. Return every saved entry from the seller-authorized order-detail API and display it in the approved Dashboard order detail, including custom and legacy fields. Order lists may remain summaries. Never return another project/seller's answers or payment/security secrets.

## Validate

Check build, UTF-8, login, mandatory `project_id + seller_id` ownership on every record/query/constraint/index, cross-merchant denial, product/category/stock/SKU/image/sort sync, complete customer snapshot storage and order-detail rendering, verified paid once, refund sync, CSV, cleanup, and mobile backend.

When catalog behavior is in scope, run
`npm test --prefix packages/buyna-merchant-catalog-core` before project tests.
When stock/SKU or coupons are in scope, also run
`npm test --prefix packages/buyna-inventory-core` or
`npm test --prefix packages/buyna-coupon-core` respectively.
When cart or order behavior is in scope, also run the matching fixed-package
tests before project integration tests.

## Code Delivery

Deliver backend source, routes/APIs, migrations, authorization/ownership
checks, and applicable automated tests in the real project. Report changed
paths and verification results. A backend specification or generated prompt
alone is not complete.
