---
name: buyai-globepay-status-sync
description: "Implement or repair GlobePay status sync: notify URL, return URL, server query, paid writer, refund sync, paid_at repair, seller records, and refresh buttons."
---

# Buyai GlobePay Status Sync

Use after a provider order exists. Owns notify/webhook, return query fallback, paid/refunded transitions, idempotent writers, seller visibility, and refresh/repair logic.

## Gold

Never mark paid from redirect, opened payment page, or provider order creation. Mark paid only after verified notify/query returns provider success, such as `result_code=PAY_SUCCESS`. Refunded orders remain auditable.

## First Move

Read `references/status-sync-rules.md`. Inspect orders, payments, paid customers/bookings, provider ids, return URL, notify URL, webhook, refresh button, and dashboard queries.

Run `status.evaluate` through
`buyai-globepay-payment/scripts/globepay-cli.mjs` for every notify, provider
query, or reconciliation result. Use the returned transition, effects, and
idempotency key inside one project-owned database transaction. Never call it
with redirect/browser state as a trusted event, and never treat its output as a
completed write until the transaction and post-write read both succeed.

Use `createGlobepayService(...).syncPaymentStatus(...)` to enforce that flow.
Implement only the project store/provider adapters described in
`buyai-globepay-payment/references/service-adapter-contract.md`; route handlers
must not duplicate status, transaction, or idempotency orchestration.

## Required Flow

Notify and return query call one idempotent writer. It finds local order by provider id, sets paid/refunded status, stores raw data, creates paid record once, updates stock/capacity once, and logs write failures.

`paid_at` uses provider/local payment time when available, not refresh time. Expiration must not override verified success.

The mobile H5/JSAPI return route must restore the local order-result page,
query status on the server, and show pending, paid, failed, or cancelled
without trusting redirect parameters. A buyer closing the wallet or returning
before notify arrives keeps the order pending and may trigger a bounded query
or manual refresh.

Seller Orders may have one page-level silent refresh button. It checks unfinished orders and paid orders that may have been refunded. Do not add per-row refresh buttons.

## Combine With

Use `buyai-globepay-checkout` for provider order creation, `buyai-globepay-config` for signing/query failures, and product/booking skills for records, stock, capacity, CSV, and email.

## Validate

Check mobile return, early return before notify, cancelled/closed wallet,
`pending/expired/failed + PAY_SUCCESS -> paid`, `paid + refund success ->
refunded`, idempotency, real paid time, seller visibility, CSV, dashboard
totals, and no deletion of paid/refunded records.

Deliver notify/query/status-writer source, persistence changes, and applicable
idempotency/status tests in the real project. Report changed paths and
verification results; flow documentation alone is not complete.
