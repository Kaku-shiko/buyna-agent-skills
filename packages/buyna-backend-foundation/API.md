# Backend foundation API contract (0.1.0)

Import the installed packages/buyna-backend-foundation/src/index.mjs on the server.
Do not rewrite createOrderService, inventory or settlement rules: this package
composes those fixed implementations. Browser code calls the authenticated routes,
never imports the backend, database pool, credentials or provider verifier.

## Database

createPostgresRecords({pool,schema,projectId,sellerId}) returns scoped transactional
persistence. Values come from the verified server resource registry and fresh
merchant context, not request JSON. migrateBackend({pool,schema}) requires the
registered schema to exist; it installs versioned/checksummed tables without
creating a database. Run only in the authorized migration phase with backup and
rollback checks. Existing data needs a reviewed mapping/migration.

## Runtime

createBackend({records,provider,quote,readPaymentConfig,idGenerator?,clock?,holdMinutes?})
returns paymentStatus, createOrder, orderStatus, startPayment, settle, expireOrder.

- quote({scope,items,records}) loads current catalog prices and server shipping/tax
  rules and returns items, subtotal, shipping, discount, tax, total, currency. Money
  is integer minor units. Never trust browser prices or silently assume JPY.
- readPaymentConfig(scope) returns readStatus, configured, credentialVersion,
  validatedVersion, validationStatus, explicit disabled, and checkoutHosts. It reads
  current server-owned evidence. Never return Code/credentials. A missing switch is
  not explicit suspension. Unknown/read failures are not collection-disabled.
- provider.create/query({order,scope}) uses the existing approved GlobePay adapter,
  the same provider order identity, exact amount/currency and provider expiry no
  later than local reservation expiry. Return orderId, amount, currency and optional
  checkoutUrl. Transport timeouts are reconciled by query, not blind resubmission.
- provider.verify({rawBody,headers,projectId,sellerId}) verifies Notify or trusted
  Query, returning trusted, source, provider, eventId, orderId, projectId, sellerId,
  status, amount, currency and cumulative refundAmount when appropriate. Never
  expose the verified-event input to public callers. Redirects cannot confirm paid.

createOrder({customerRef,idempotencyKey,items,paymentMethod,submission}) atomically
persists the order, reserves stock and records an outbox source event. The guest
identity is resolved from the server's secure guest session, not a fingerprint or
request body. The same pending checkout is reused until expiry. A reused idempotency
key with changed data fails. Item prices come from quote.

orderStatus({customerRef,orderId}) returns only the owning guest's order status,
total/currency, expiry and refund/fulfillment status. startPayment uses the same
ownership check and never marks the order paid. settle applies only verified events,
checks exact money/scope, handles duplicates and partial/full refund reconciliation.
Late payment becomes paid with fulfillment review rather than taking another
customer's stock. Refund initiation remains an authenticated provider operation.

setStock(records,{productId,skuId,onHandQuantity}) requires server-admin authority.
It refuses stock below reserved quantity. Keep one authoritative stock ledger.

runExpiryBatch({records,backend: tx => createBackend({...options,records:tx}),limit?})
runs from the existing scheduler. It commits a durable cursor with idempotent expiry
and stock releases. A browser countdown is not the expiry worker.

## Routes and feedback

createBackendHandlers({resolveRequest}) returns createOrder, orderStatus,
startPayment, paymentNotify, paymentStatus. resolveRequest(request,mode) supplies
{backend,customerRef}; modes are customer, merchant, provider. The existing
middleware enforces authentication, host-to-merchant resolution, permissions,
CSRF, rate/body limits and raw Notify bytes. Client owner IDs are ignored.

Map POST /api/orders, GET /api/orders/:orderId/status,
POST /api/orders/:orderId/payment, POST /api/payment/notify and authenticated
GET /api/admin/payment-status while retaining existing merchant URLs on migration.
Use backendErrorResponse(error) at the HTTP boundary; it sanitizes errors and
returns stable error codes/retryability. Never expose SQL or provider secrets.

Outbox source records are transactional facts, not evidence of sent messages.
Selected notification work uses delivery-state-core retry/lease handling; sending
failure never reverses payment. CRM GMV keeps original and refund adjustment events.

This product-stock recipe does not silently activate booking, coupons or BUYNA
subscription billing. Those selected capabilities keep their existing fixed modules
and verified adapters. All externalActions flags/approvals remain in force.

## Distribution

inspectBackendBundle(repositoryRoot) verifies the manifest and every declared fixed
module. installBackendBundle({repositoryRoot,target}) atomically creates a new vendor
directory and backend.lock.json. Identical installs verify hashes; different existing
versions require a reviewed upgrade. Source scripts/backend-foundation.mjs provides
inspect/install commands. Code availability is not proof of deployment or payment.
