---
name: buyai-coupon-mobile-checkout
description: "Integrate or repair the approved coupon-to-GlobePay checkout boundary for Buyna.ai product commerce. Use when one flow must reserve a coupon with a pending order, charge the discounted total, route mobile WeChat or Alipay through H5/JSAPI, and redeem or release the coupon from verified payment status."
---

# Buyai Coupon Mobile Checkout

Connect one approved coupon checkout slice without duplicating coupon, order, or payment rules.

## First Move

1. Execute only the user's current requested slice and stop after validation.
2. Require approved Phase 4 frontend code and the applicable Phase 5 cart, order, coupon, and Dashboard APIs. Otherwise return to the incomplete phase.
3. Resolve `packages/buyna-coupon-core`, `packages/buyna-cart-core`, and `packages/buyna-order-core`. Resolve the fixed GlobePay program API from `buyai-globepay-payment/scripts/`. Stop when a required module is absent; never regenerate it.
4. Read [references/integration-contract.md](references/integration-contract.md).

## Route

- Use `buyai-coupon-commerce` for coupon definitions, quote, reservation, limits, snapshots, redemption, and release.
- Use `buyai-product-merchant-backend` for catalog-backed cart, inventory, pending order, and seller order visibility.
- Use `buyai-checkout-address-ux` for buyer data and order confirmation.
- Use `buyai-globepay-checkout` for explicit payment selection and desktop/mobile next actions.
- Use `buyai-globepay-status-sync` for trusted notify/query transitions.
- Use `buyna-gmv-commerce` after the verified local paid/refund transaction.

Load only the routed Skill needed for the active slice. Do not execute every routed Skill in one turn.

## Workflow

1. Recalculate the catalog-backed cart and coupon on the server.
2. In one rollback-safe transaction, create the immutable `pending_payment` order and reserve coupon capacity.
3. Persist subtotal, shipping, tax, discount, final amount, coupon snapshot, buyer snapshot, selected method, ownership, provider identity, and expiry.
4. Obtain the final positive amount from `@buyna/coupon-core`; pass that exact amount to the fixed GlobePay checkout service.
5. Return the fixed next action: mobile H5 `redirect`, enabled wallet-browser `invoke_jsapi`, desktop `show_qr` or approved hosted page, and hosted-card `redirect`.
6. Treat browser return as untrusted. Query GlobePay on the server.
7. In the trusted status transaction, verify provider order, seller, currency, amount, signature, and replay protection; then mark paid and apply coupon, stock, customer, and GMV effects once.
8. Release only a still-reserved coupon after verified failure, cancellation, or expiry. Never release a redeemed reservation.

## Generate Per Project

Generate only PostgreSQL/store Adapters, migrations, routes, UI/API wiring, provider mapping, and project-specific configuration. Do not copy the fixed cores into project routes or components.

## Boundaries

- Scope every record by permanent `project_id + seller_id`.
- Keep credentials server-side and out of chat, Git, frontend code, logs, and Skill files.
- Never mark paid from order creation, redirect, button click, or client state.
- Never alter product prices to represent a coupon; persist the discount separately.
- Never switch the buyer's payment method or downgrade same-device mobile wallet payment to QR.
- Do not add unrequested coupon types, campaigns, membership, points, or platform administration.

## Validate

Run the coupon, cart, order, and GlobePay fixed-core tests before project tests. Verify concurrent claims, duplicate notify, amount/currency mismatch, early return, cancellation, retry, seller isolation, mobile H5, enabled JSAPI, desktop QR/hosted behavior, redemption once, release once, stock once, paid customer once, and GMV once.

Deliver real project files, test evidence, remaining blockers, and the exact active slice. Stop and require a later explicit instruction before continuing.
