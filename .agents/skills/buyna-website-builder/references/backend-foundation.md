# Backend foundation installation and composition

Use `packages/buyna-backend-foundation` for database/order/payment backend work.
The package contains executable PostgreSQL persistence, versioned installation,
order/inventory/settlement composition and framework-neutral handlers. It is not
a declaration that every merchant is already connected or deployed.

## Install once

1. Inspect the existing project, registered resources and capability record.
   Reuse matching executionCheckReceipt evidence. Preserve the current framework.
2. Run `node scripts/backend-foundation.mjs inspect` in the source repository.
   Missing modules block installation; do not synthesize replacement cores.
3. For a new integration, run `node scripts/backend-foundation.mjs install
   <project>/backend/vendor/buyna`. The new directory is installed atomically;
   identical reinstallation verifies hashes, while different existing contents
   require a reviewed upgrade. Keep backend.lock.json with delivery evidence.
   In an installed Skill environment use the installed package's
   `installBackendBundle` with the complete source repository, or use an already
   verified vendor bundle. Do not assume the source scripts are installed Skills.
4. Bind the server's registered pool/schema and request-local project/seller
   context. Call `migrateBackend` only in the authorized migration phase after
   existing backup/migration checks. It requires an existing schema, records a
   checksum and never creates a database, cloud resource, user or listener.
5. Construct the selected services and wire the project's routes to the handlers.
   Verify against a disposable PostgreSQL database before any live migration.

## Supported product-checkout recipe

`createPostgresRecords` -> `createBackend` -> `createBackendHandlers`.
This recipe reuses order-core, inventory-core and commerce-settlement-core.
It supports product orders with stock reservations and verified paid/refund
results. It does not silently activate booking, coupons, subscriptions or email.
For those selected capabilities, compose their existing cores and project
adapters; include corresponding contract tests before claiming integration.
Legacy payment architectures retain their existing payment writer.

Supply these server adapters, never AI-generated status booleans:

| Adapter | Contract |
| --- | --- |
| PostgreSQL pool | Registered existing database; app-role permissions limited to the merchant schema. No browser connection strings. |
| quote | Load current catalog prices/currency and shipping/tax rules on the server; reject unavailable products. Never trust submitted prices. Use the passed transaction records where applicable. |
| readPaymentConfig | Return only scoped connection metadata: readStatus, configured, credentialVersion, validatedVersion, validationStatus, explicit disabled and approved checkoutHosts. No secrets. |
| provider.create/query | Existing GlobePay transport, stable order ID, exact amount/currency, payment method and provider expiry no later than local hold expiry. Return orderId, amount, currency and optional checkoutUrl. Ambiguous submissions query the same provider order, not a new charge. |
| provider.verify | Verify Notify signature or trusted Query; map merchant identity, order, amount, currency, eventId, source and cumulative refund amount. Never accept browser-supplied trusted=true or Return redirects as payment evidence. |
| resolveRequest | Existing auth-session and merchant-context cores, observed host, permission/CSRF/rate-limit/body-size checks. Guest cookie resolves customerRef server-side. Never trust owner IDs or customerRef in request bodies. |

Stock administration calls `setStock` after server-admin authorization; the
foundation stock ledger is authoritative for reservations. Existing catalog
stock fields need an explicit adapter; never keep two independently writable
stock counters. All writers must use the same store/transaction protocol.

Suggested route mapping (preserve existing URLs on migrations):

| Route | Handler / access |
| --- | --- |
| POST /api/orders | createOrder / authenticated guest session + CSRF |
| GET /api/orders/:orderId/status | orderStatus / same guest only |
| POST /api/orders/:orderId/payment | startPayment / same guest + CSRF |
| POST /api/payment/notify | paymentNotify / provider verifier, raw body retained |
| GET /api/admin/payment-status | paymentStatus / merchant configuration permission |

Use backendErrorResponse for public failures; log only sanitized diagnostic
codes and request IDs. Page copy localizes the stable error codes. Unknown
configuration is unavailable/unknown, not "collection disabled". Valid current
connection evidence is reused; real-transaction acceptance is separate.

## Recovery and feedback

- Same guest, same pending checkout reuses its order until expiry. An identical
  idempotency key returns current order state; changed content rejects reuse.
- Run `runExpiryBatch({records, backend: tx => createBackend({...options, records:tx})})`
  from the existing scheduler. It persists a keyset cursor with the expiry writes. A browser countdown is not the expiry worker.
- Paid/refund events and outbox source records commit together. Source records
  do not mean messages were sent. An approved notification worker consumes them
  using delivery-state-core leases/retries; GMV uses its existing delivery path.
- Refund initiation remains the authenticated provider refund adapter; settle
  applies only confirmed refunds. Never mark refunded on request submission.
- Late confirmed payment is recorded as paid with fulfillment review, without
  stealing another customer's inventory. Provide a visible admin review queue.
- On failed rollout, revert application artifact first. Empty installation
  rollback is available; populated tables require a data-preserving migration.

## Acceptance

Record bundle digest, migration version/checksum, adapter bindings and actual
checks: tenant/guest isolation, server pricing, duplicate order/Notify,
last-unit contention, expiry/late payment, partial/full refund, failed-transaction
rollback, provider timeout recovery, UI feedback and selected notification jobs.
Only then record backend delivery. Local tests are not live provider acceptance,
cloud migration, deployment or notification-delivery evidence.
