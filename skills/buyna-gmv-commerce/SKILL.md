---
name: buyna-gmv-commerce
description: "Connect Buyna.ai merchant payment and completed-refund events to admin.buyna.ai CRM GMV. Use when adding GMV to an existing merchant, onboarding GMV for a new merchant, building the CRM ingestion/read path, repairing GMV sync, or validating merchant/project GMV without regenerating payment, idempotency, signing, retry, or aggregation logic."
---

# Buyna GMV Commerce

Connect every Buyna merchant identity to CRM and make GMV event delivery mandatory
for every merchant with checkout or paid booking capability. GMV is an internal
Buyna.ai metric and must never be shown or exposed to a merchant.

## Gate

1. Inspect the real merchant order, payment, refund, PostgreSQL transaction, worker, CRM customer record, and deployment architecture.
2. Confirm server-owned `project_id`, `seller_id`, merchant name, JPY currency, provider event ids, and the existing CRM endpoint.
3. Resolve `packages/buyna-gmv-core` from the project or user installation. Stop with `BLOCKED: FIXED_GMV_MODULE_NOT_INSTALLED` when absent; never regenerate it.
4. Read [references/integration-contract.md](references/integration-contract.md). For CRM APIs or identity binding also read [references/crm-contract.md](references/crm-contract.md).
5. Stop with `BLOCKED: EXISTING_RESOURCES_NOT_CONFIRMED` rather than creating a database, table service, queue, port, server, bucket, or CRM replacement.

## Workflow

Complete one step, validate it, report evidence, and stop for approval before the next step.

1. **Identity binding** — Add `project_id + seller_id` to every CRM merchant record. Payment-capable merchants receive an active server credential; merchants without payment remain registered with GMV disabled until payment is enabled. Prefer per-merchant HMAC; allow bearer only for an explicitly approved transition.
2. **Outbox migration** — Generate only the project migration and Adapter described in the integration contract. Insert immutable events with a unique provider event key.
3. **Payment writer** — After verified notify/query returns `PAY_SUCCESS`, update the order and insert `paymentCaptured(...)` in the same PostgreSQL transaction. Use the actual charged amount after discounts, shipping, and tax.
4. **Refund writer** — After provider-confirmed refund completion, update the refund and insert `refundCompleted(...)` in the same transaction. Reject cumulative refunds above the paid amount.
5. **Sync worker** — Call fixed `sendPendingGmvEvents(...)`; generate only the Adapter, schedule, and environment wiring. Checkout success must not depend on CRM availability.
6. **CRM ingestion** — Verify HMAC identity binding, event idempotency, immutable storage, and merchant/project aggregation. Never accept browser authority for merchant identity, amount, paid status, or refund status.
7. **CRM-only read integration** — Expose GMV summary, trends, and events only inside authenticated `admin.buyna.ai` CRM administrator routes. Do not create merchant-facing GMV routes, queries, dashboard cards, navigation, labels, exports, or public APIs.
8. **Verification** — Test paid, coupon-adjusted amount, duplicate notify, partial/full refund, CRM outage and retry, wrong seller denial, signature replay, CRM totals, and absence of GMV from merchant storefront/admin/API bundles.

A payment-capable merchant cannot pass onboarding, Phase 6, or production release
without the outbox, worker, CRM binding, and executed sync tests. CRM downtime may
delay analytics but must never fail or roll back the customer payment.

## Fixed Versus Generated

Call `@buyna/gmv-core` for event validation, event ids, paid/refund factories, HMAC signing/verification, CRM client behavior, retry scheduling, worker orchestration, and aggregation. Generate only database migrations, project Adapters, server-only environment binding, scheduled-worker configuration, CRM ingestion routes, and Buyna.ai CRM administrator UI.

## Boundaries

- Count only provider-verified paid amounts; subtract only completed refunds.
- Keep subscription revenue separate from commerce GMV.
- Never send customer names, addresses, phones, product images, or payment secrets to the GMV ledger.
- Never share one merchant credential with unrelated independent backends.
- Never expose CRM or GMV credentials in frontend variables, Git, logs, Skill files, or chat.
- GMV visibility is `BUYNA_CRM_ONLY`: never display or expose GMV in a merchant storefront, merchant admin, merchant API, public API, client bundle, export, or navigation.
- A merchant may view its ordinary order, payment, and refund records, but those screens must not be labelled, aggregated, or exposed as Buyna.ai GMV.
- Treat any merchant-facing GMV field, endpoint, component, or bundle string as a release-blocking failure.
- Never delete or edit accepted GMV events; add an approved correcting event.
- Do not add attribution GMV, fees, forecasting, ERP, CRM sales pipelines, or unrelated analytics unless explicitly requested.

## Delivery

Deliver real migration, Adapter, payment/refund integration, worker, CRM ingestion/admin route, and automated tests for the approved step. A design document alone is not complete. Report implemented paths, executed tests, merchant-surface absence checks, deployment state, and the next approval only.
