---
name: buyai-globepay-status-sync
description: "Use when an existing GlobePay order needs notify, return, or query reconciliation, paid or refund persistence, idempotent repair, seller visibility, or refresh behavior."
---

# Buyai GlobePay Status Sync

Use after a provider order exists. Owns notify/webhook, return query fallback, paid/refunded transitions, idempotent writers, seller visibility, and refresh/repair logic.

When invoked by the Website Builder, consume `executionCheckReceipt`. Reuse
unchanged payment architecture, server-config boundary, selected Module, and
package-test evidence for the same package source digest; do not repeat the
static payment checks already performed by the payment Skill. Each notify/query
event still receives fresh authenticity, local order, amount, currency,
idempotency, and transaction verification. Standalone invocation performs the
applicable static checks once without claiming Builder authorization.

## Gold

Never mark paid from redirect, opened payment page, or provider order creation. Mark paid only after verified notify/query returns provider success, such as `result_code=PAY_SUCCESS`. Refunded orders remain auditable.

## First Move

Read `references/status-sync-rules.md`. Inspect orders, payments, paid customers/bookings, provider ids, return URL, notify URL, webhook, refresh button, and dashboard queries.

Use `status.evaluate` only for the legacy recipe below. Do not run its state
machine before the fixed settlement core. Each recipe owns one state writer;
browser redirects are never trusted settlement events.

Select one status recipe from the persisted workflow:

- With `paymentArchitecture: fixed-cores`, the project verification Adapter
  supplies a trusted notify/query event with server-owned
  `projectId + sellerId` to `packages/buyna-commerce-settlement-core`. The core
  reconciles the exact local order, amount, and currency before one idempotent
  transition and its transactional effects. Read
  [the settlement contract](references/settlement-adapter-contract.md), including
  late-payment reconciliation and fulfillment review after reservations were released.
- With `paymentArchitecture: legacy-globepay-service`, use the legacy-only
  `createGlobepayService(...).syncPaymentStatus(...)` Interface described by
  `buyai-globepay-payment/references/service-adapter-contract.md`. Verify notify
  authenticity, confirm success through provider Query, reconcile its exact
  amount and currency to the local order, and perform one idempotent write. This
  recipe imports neither `buyna-checkout-flow-core` nor
  `buyna-commerce-settlement-core` orchestration.

Missing or unknown architecture blocks status mutation. Project code supplies
only the provider/database Adapters, configuration, routes, and presentation
for the selected recipe.

## Required Flow

Notify and return query call the writer selected by the persisted architecture.
It finds the local order by provider id, sets paid/refunded status, stores raw
data, creates the paid record once, updates stock/capacity once, and logs write
failures.

`paid_at` uses provider/local payment time when available, not refresh time. Expiration must not override verified success.

The mobile H5/JSAPI return route must restore the local order-result page,
query status on the server, and show pending, paid, failed, or cancelled
without trusting redirect parameters. A buyer closing the wallet or returning
before notify arrives keeps the order pending and may trigger a bounded query
or manual refresh.

Seller Orders may have one page-level silent refresh button. It checks unfinished orders and paid orders that may have been refunded. Do not add per-row refresh buttons.

## Combine With

Use `buyai-globepay-checkout` for provider order creation, `buyai-globepay-config` for signing/query failures, and product/booking skills for records, stock, capacity, CSV, and email.

For every Buyna merchant, route the verified paid/refund transition to
`buyna-gmv-commerce`. Insert its fixed outbox event in the same transaction;
never call CRM before the local payment write commits. A payment deployment
fails its release gate when this integration or its sync test is missing.

## Validate

Check mobile return, early return before notify, cancelled/closed wallet,
`pending/expired/failed + PAY_SUCCESS -> paid`, partial and full refund amounts,
released-reservation fulfillment review, idempotency, real paid time, seller visibility, CSV, dashboard
totals, and no deletion of paid/refunded records.

Deliver notify/query/status-writer source, persistence changes, and applicable
idempotency/status tests in the real project. Report changed paths and
verification results; flow documentation alone is not complete.
