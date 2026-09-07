---
name: buyai-product-merchant-backend
description: "Use when a single-merchant Buyna.ai store needs product, SKU, inventory, cart, order, paid-customer, CSV, or seller Dashboard backend behavior."
---

# Buyai Product Merchant Backend

Use for product ecommerce: jewelry, apparel, goods, SKU catalogs, and shippable products. Owns products, inventory, categories, variants, images, orders, and paid customers. Does not own payment, booking capacity, or styling.

## First Move

When invoked by `buyna-website-builder`, consume its
`executionCheckReceipt`. Use its approved frontend/API contract, fixed-module
selection, resource evidence, and matching package-test evidence directly. Do
not repeat Phase 4 inspection, module discovery, resource inspection, unchanged
package tests, onboarding, or confirmation. Return one structured
missing-evidence result to the Builder if the receipt does not cover this
product slice.

For standalone invocation, inspect the approved frontend/API contract and
resolve the fixed-module root once. In a repository/project installation it is
`packages/`; in a user installation it is
`$env:USERPROFILE/.codex/packages/`. Require only modules needed by the
requested product operation; payment-only modules are irrelevant until payment
is in scope. Do not regenerate a missing fixed core.

After the gate passes, read `references/product-commerce-rules.md` and use the
persisted languages, currency, product source, variants/SKUs, image limit, and
lifecycle capabilities. Do not repeat those confirmations. Do not ask for
missing product prices; default their source to merchant Dashboard maintenance.

For 商品管理 or 分类管理, also read
`references/merchant-catalog-fixed-core.md` and call
`packages/buyna-merchant-catalog-core`. Do not regenerate its field policies,
filter/sort rules, stock/visibility/lifecycle operations, or transactional
ordering. Generate only the project route and database Adapter required by the
approved API contract.

For product creation/editing with images, read
`references/product-media-fixed-core.md` and construct
`createProductMediaService` from the same catalog package with
`buyna-merchant-file-core`. Use the fixed API sequence:
`createDraft` -> prepare upload for the returned product ID -> transfer bytes
-> `attachUploadedImage` -> `setMainImage` / `reorderImages` /
`replaceUploadedImage` / `removeImage`, returning the complete product after
each success. Retain the draft ID on upload failure and retry on that same
product; do not create another draft. `createDraftWithImage` is only for an
already-uploaded file in a server-side import flow, not a browser file picker. Do not write `mainImageId` directly or improvise a
project-specific product/file join. Generate only the scoped media Store,
storage Adapter, signed-URL mapping, routes, and project-owned UI.

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

For an explicitly approved `order_notification`, call
`packages/buyna-delivery-state-core`; do not generate a notification state
machine. Write its immutable notification source event in the same transaction
as the matching order event, then let the reconciler create and dispatch the
delivery after commit/restart. Direct best-effort enqueue after commit is
forbidden. Notification failure does not change order or payment success.

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
approved Adapter contract, `executionCheckReceipt`, and `interactionMode`. An included
`dashboard_integration` or `checkout_payment` slice returns evidence to the
Builder and continues without another approval question. Standalone work uses
its ordinary current-step approval. The Builder's returned `skills` and
`fixedModules` are the complete selection: do not reinvoke or add sibling
Skills from `Combine Skills` when they are already returned or were not selected.
Do not repeat onboarding. Runtime identity must never inherit from the Builder:
for each protected request obtain fresh trusted auth and resolve the current server-observed host into one request-local immutable merchant context before
calling product, inventory, order, or file Adapters. Resolve anew for every
request and host; browser owner IDs are never authority.

Before models, migrations, uploads, or persistence code, reuse matching
resource evidence from `executionCheckReceipt`. Run the
`buyna-aws-data-layer` Existing Resource Gate only for standalone work or when
the Builder reports missing/changed resource evidence. Reuse the recorded
database and S3 bucket through `buyna-s3-storage`; never create a replacement.

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

Single-merchant backend: one merchant administrator, login, session, product CRUD with deletion, images/main image, categories, coupons, stock/variants, drag sorting, orders, paid customers, CSV, email, payment/subscription settings, and GlobePay portal. Route coupon rules to `buyai-coupon-commerce`; keep subscription status read-only and sourced server-to-server. Do not create a platform administrator, cross-merchant console, merchant switcher, or merchant-account management API.

Public site: backend list, category tabs, detail, checkout, payment methods, verified success, shared footer settings.

Images default max is 5 unless changed. If variants exist, detail shows options/gallery; checkout stores variant snapshot and uses SKU price/stock.

## Orders

Statuses: `pending_payment`, `paid`, `refunded`, `failed`, `expired`, `cancelled`. Orders/Paid Customers need filters, search, month, URL params, reset, pagination, CSV, and timezone. Expire unpaid older than 24h; never delete paid/refunded records. Use one silent page refresh button.

Create the pending order with the complete safe customer submission snapshot defined by `buyai-checkout-address-ux`. Return every saved entry from the seller-authorized order-detail API and display it in the approved Dashboard order detail, including custom and legacy fields. Order lists may remain summaries. Never return another project/seller's answers or payment/security secrets.

## Validate

For the behavior changed by the current slice, check build, UTF-8, login,
mandatory `project_id + seller_id` ownership, cross-merchant denial, and the
applicable product/category/stock/SKU/image/order synchronization. Do not rerun
unrelated payment, refund, CSV, cleanup, or mobile checks.

Run a fixed-package test only when `executionCheckReceipt.testEvidence` has no
passing entry for that package source digest. Standalone work records the same
evidence after its first run. Always run the minimum project tests changed by
the current product slice.

## Code Delivery

Deliver backend source, routes/APIs, migrations, authorization/ownership
checks, and applicable automated tests in the real project. Report changed
paths and verification results. A backend specification or generated prompt
alone is not complete.
