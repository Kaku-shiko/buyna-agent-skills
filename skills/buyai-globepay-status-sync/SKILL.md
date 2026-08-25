---
name: buyai-globepay-status-sync
description: "Use when an existing GlobePay order needs notify, return, or query reconciliation, paid or refund persistence, idempotent repair, seller visibility, or refresh behavior."
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

For the new fixed-core path, the project verification Adapter supplies a trusted
notify/query event with server-owned `projectId + sellerId`; pass it directly to
`packages/buyna-commerce-settlement-core`. The core reconciles exact local
order, amount, and currency before a legal transition and idempotent effects.
Project code supplies only provider/database Adapters, configuration, routes,
and presentation.

When an existing project explicitly records the legacy service architecture,
`createGlobepayService(...).syncPaymentStatus(...)` remains a legacy-only
maintenance Interface described by
`buyai-globepay-payment/references/service-adapter-contract.md`. The legacy
service and new fixed-core path are selected separately.

## Required Flow

Notify and return query call one idempotent writer. It finds local order by provider id, sets paid/refunded status, stores raw data, creates paid record once, updates stock/capacity once, and logs write failures.
For product commerce, implement this writer through
`packages/buyna-commerce-settlement-core`; provider and PostgreSQL code are
project Adapters. The core owns order/amount/currency reconciliation, legal
paid/refund transitions, idempotency, and transactional effects; project code
owns only provider/database Adapters, configuration, routes, and presentation.

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
`pending/expired/failed + PAY_SUCCESS -> paid`, `paid + refund success ->
refunded`, idempotency, real paid time, seller visibility, CSV, dashboard
totals, and no deletion of paid/refunded records.

Deliver notify/query/status-writer source, persistence changes, and applicable
idempotency/status tests in the real project. Report changed paths and
verification results; flow documentation alone is not complete.
