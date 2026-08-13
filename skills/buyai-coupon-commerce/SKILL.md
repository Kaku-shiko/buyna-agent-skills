---
name: buyai-coupon-commerce
description: "Build or repair Buyna.ai merchant coupon management, storefront coupon use, order discount snapshots, PostgreSQL persistence, and GlobePay-linked reservation, redemption, and release. Use for percentage coupon codes or fixed-amount coupons triggered by quantity, amount, or AND/OR combinations."
---

# Buyai Coupon Commerce

Implement one approved coupon slice through fixed rules plus generated project adapters.

## Entry Gate

1. Require approved frontend and Dashboard source, API contract, build checks, and user approval. Otherwise return to `buyna-frontend-builder`.
2. Resolve `packages/buyna-coupon-core`, `packages/buyna-cart-core`, `packages/buyna-order-core`, `packages/buyna-merchant-dashboard-ui`, and `packages/buyna-postgres-merchant-core` from the project or user installation. If missing, stop with `BLOCKED: FIXED_COMMERCE_MODULES_NOT_INSTALLED`; never regenerate them.
3. Run the `buyna-aws-data-layer` Existing Resource Gate. Reuse the approved PostgreSQL database; do not create SQLite, DynamoDB, Supabase, or a replacement database.
4. Read `references/coupon-contract.md`.

## Fixed Code

Call `@buyna/coupon-core` for:

- coupon-code normalization;
- integer-JPY percentage and maximum-discount calculation;
- fixed-amount quantity/amount `AND` or `OR` eligibility;
- active-period and positive-final-total validation;
- immutable order coupon snapshots;
- atomic reservation limits;
- idempotent redemption;
- failed/cancelled/expired release;
- payment amount matching;
- `resolveCouponPaymentAmount` binding from the eligible coupon quote to the
  persisted order total used for the provider request.

Use `@buyna/merchant-dashboard-ui` for the seven-page navigation, coupon table, type-specific form fields, lifecycle, filters, actions, and responsive states. Do not reproduce those rules in project components.

## Generate Per Project

Generate only:

- PostgreSQL migration using the approved schema naming;
- Adapter implementing the fixed store contract with `project_id + seller_id` scope and row locks;
- merchant-authorized coupon CRUD/status routes;
- storefront available-coupon and validation routes;
- Dashboard API adapter and project styling;
- cart/order wiring to the fixed modules;
- project-specific labels, currency display, and customer-key derivation;
- payment-status hooks calling `redeem` or `release` inside the existing trusted transaction;
- GlobePay request mapping that assigns the fixed resolved amount to the
  provider amount field; never recalculate it in the route.

## Required Flow

1. Merchant creates `percentage_code` or `fixed_threshold`, saves draft, then activates it.
2. Percentage coupons require a customer-entered code, percentage basis points, optional minimum subtotal, and optional maximum discount.
3. Fixed coupons require a fixed discount and at least one of quantity or amount. When both exist, apply the configured `AND` or `OR` operator. Support manual or automatic application.
4. Revalidate server-side from the current catalog-backed cart. Shipping does not count toward the default threshold.
5. Create the local `pending_payment` order with the coupon snapshot and positive final amount before starting GlobePay. The final amount is `subtotal + shipping + tax - discount`.
6. Reserve coupon capacity in the same database transaction as pending-order preparation or through an equivalent rollback-safe sequence.
7. Call `resolveCouponPaymentAmount({quote, orderTotal})` and send only its
   return value as GlobePay's requested amount.
8. Redeem once only after trusted GlobePay notify/query confirms success and paid amount equals order total.
9. Release reserved capacity after failed, cancelled, or expired payment. Never release a redeemed reservation.

## Boundaries

- One order uses at most one coupon; percentage and fixed coupons do not stack.
- Frontend preview is not authoritative.
- Browser return is not payment success.
- Used coupons are archived, not deleted; later edits never change order snapshots.
- A guest customer key must be derived server-side from approved checkout/session data; local storage alone cannot enforce customer limits.
- Do not add products/categories targeting, points, membership tiers, campaigns, platform administration, or other marketing features unless explicitly approved.

## Validate

Run `npm test --prefix packages/buyna-coupon-core` and the Dashboard fixed-package tests, then verify CRUD authorization, merchant isolation, code normalization, percentage cap, quantity, amount, `AND`, `OR`, total/per-customer limits, concurrent reservation, order snapshot, shipping/tax total, provider request amount, positive GlobePay amount, duplicate notify, success redemption, and failure/cancel/timeout release.

Deliver actual migrations, adapters, routes, UI wiring, and tests. A specification alone is not implementation.
