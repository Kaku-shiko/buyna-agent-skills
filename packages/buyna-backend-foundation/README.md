# BUYNA backend foundation

Version 0.1.0: reusable PostgreSQL product-checkout runtime and complete fixed-module
distribution. This is a server library, not an independently exposed service.

## Entry points

- `createPostgresRecords`: scoped transactional persistence on an existing pool/schema.
- `migrateBackend`: checksum-pinned, transactional, repeatable database initialization.
- `rollbackEmptyBackend` (postgres export): empty-install rollback; refuses populated data.
- `createBackend`: fixed order creation, inventory reservation, payment initiation/query,
  verified settlement, partial/full refund reconciliation, expiry and guest order reads.
- `createBackendHandlers`: framework-neutral route handlers with a mandatory trusted
  request resolver; retains the project's auth/CSRF/body-limit middleware.
- `runExpiryBatch`: durable cursor-based expiry reconciliation for an existing scheduler.
- `backendErrorResponse`: safe public error codes and retry feedback.
- `paymentAvailability`: read failure is unknown, explicit suspension is disabled;
  current verified credentials are reusable without another artificial enable switch.
- `inspectBackendBundle` / `installBackendBundle`: checksum inventory and atomic,
  non-overwriting installation of all declared fixed modules.

Use the Builder's `references/backend-foundation.md` for route mapping and adapter
contracts. The order/stock/settlement rules import sibling fixed modules rather
than duplicating their business state machines. Catalog pricing, authenticated
merchant/guest identity, GlobePay transport, notification delivery and framework
bindings are explicit server adapters. Existing merchant storage must be mapped
or migrated deliberately; do not create a second live order or stock authority.

The shipped product runtime does not activate coupons or booking. Their fixed
modules are included for separately selected integration, not silently wired
into this recipe. Subscription billing remains a separate platform authority.

## Tests

Run `npm install` in this package for the pinned development-only PGlite engine,
then `npm test`. Alternatively set BUYNA_TEST_PGLITE to an absolute PGlite entry
file from an isolated development installation. No PostgreSQL emulator or cloud
credentials are required: tests use PostgreSQL compiled to WebAssembly.

Tests cover SQL migration/drift/rollback, tenant and guest separation, last-item
contention, idempotency, pending-order reuse, payment timeout reconciliation,
exact amount validation, partial/full refunds, expiry, late payment and outbox
atomicity. PGlite uses a queued single session; production multi-connection
contention, provider integration and deployment remain project acceptance checks.

Money uses integer minor units and exact ISO currency matching. Do not infer
JPY from symbols or convert amounts for settlement. Payment redirects never
mark an order paid. The outbox contains committed source events, not proof that
email, SMS or CRM delivery has happened.
