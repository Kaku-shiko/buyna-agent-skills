# Fixed State Logic Batch 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`
> to implement this plan task-by-task. Use strict red-green-refactor for every
> behavior or Skill change.

**Goal:** Add stable, merchant-scoped commerce read models and retry-safe
notification delivery state, then route only applicable Dashboard/backend
slices to those fixed modules while keeping SQL/ORM queries, charts, message
templates, email/SMS providers, and every visible design project-generated.

**Architecture:** `buyna-commerce-read-model-core` consumes canonical,
server-side facts through a narrow query Adapter and owns metric definitions,
validation, ordering, and timezone bucket semantics. `buyna-delivery-state-core`
owns notification state, attempts, retry eligibility, idempotency, and safe
provider receipts while template and provider Adapters own rendering and I/O.
Neither module imports a database/ORM, chart library, provider SDK, framework,
UI component, or merchant configuration.

**Tech Stack:** Node.js ES modules, `node:test`, `Intl.DateTimeFormat`, JSON
repository manifest, Markdown Codex Skills, PowerShell repository validation.

**Spec:** `docs/superpowers/specs/2026-08-25-fixed-state-logic-design.md`

## Global Constraints

- Never copy a merchant name, domain, theme, CSS, price, credential, AWS
  identifier, production URL, or live configuration into a shared module.
- Every query, notification record, transaction, and Adapter call carries
  server-owned `projectId` and `sellerId`; browser ownership is rejected.
- Merchant Dashboard sales amounts are ordinary order/payment read models, not
  Buyna CRM GMV. Do not import `buyna-gmv-core`, use a GMV label, or expose CRM
  events, credentials, ingestion state, or internal aggregation.
- Gross is the sum of provider-verified captured order amounts. Refund is the
  sum of provider-confirmed completed refund amounts. Net is gross minus refund.
  A browser return, redirect, frontend status, or unverified order row is never
  a captured/refunded fact.
- This batch supports the closed currency set `['JPY']`. Input is trimmed and
  uppercased before allowlist validation; every stored/output amount is an
  integer yen value. Period net may be negative when the period contains a
  completed refund for a capture outside that period.
- Fixed read-model code owns exact metric semantics, safe-integer money,
  timezone validation/buckets, bounded pagination, deterministic sorting, and
  stable errors.
- Fixed delivery code owns legal transitions, attempt count, retry eligibility,
  immutable notification intent, idempotency, and normalized provider receipt.
- SQL/ORM queries, API routes, chart-library mapping, chart UI, recipient
  lookup, templates, job runners, and email/SMS provider transports are project
  Adapters. Shared packages contain none of them.
- Skill prose changes require a failing executable Skill/routing contract test
  before the prose is edited.
- This batch performs no AWS call, SQL migration, live database query, provider
  request, deployment, DNS change, live notification, or payment-path change.

## Existing Composition Boundary

```text
buyna-commerce-settlement-core
  -> project transaction writes provider-verified captured/refund totals
  -> project SQL/ORM ReadFactsAdapter returns one canonical fact per order
  -> buyna-commerce-read-model-core validates/aggregates/time-buckets
  -> project ChartAdapter and project UI render the result

inquiry/order/booking domain service
  -> domain transaction commits immutable notification source event
  -> buyna-delivery-state-core reconciles one DeliveryRecord by sourceEventId
  -> project TemplateAdapter renders approved copy
  -> project EmailAdapter or SmsAdapter sends with stable request key
  -> buyna-delivery-state-core persists delivered/failed and safe receipt
```

`buyna-gmv-core` remains the internal Buyna CRM Outbox/ingestion module and is
not a dependency of the merchant read model. `buyna-order-core` remains the
order detail/list service and does not acquire aggregation or delivery state.
`buyna-merchant-dashboard-core` remains page-operation/headless behavior and
does not acquire SQL, metric calculation, chart rendering, or provider I/O.

## Dependency Order

Tasks 1 and 2 are independent fixed-module producers. Task 3 registers both
modules and their source boundaries. Task 4 consumes only their published
interfaces through deterministic Builder/Skill routing. Task 5 composes the
complete branch and runs full verification.

---

### Task 1: Commerce Read Model Core

**Files:**
- Create: `packages/buyna-commerce-read-model-core/package.json`
- Create: `packages/buyna-commerce-read-model-core/src/errors.mjs`
- Create: `packages/buyna-commerce-read-model-core/src/paged-source.mjs`
- Create: `packages/buyna-commerce-read-model-core/src/time-buckets.mjs`
- Create: `packages/buyna-commerce-read-model-core/src/metrics.mjs`
- Create: `packages/buyna-commerce-read-model-core/src/index.mjs`
- Create: `packages/buyna-commerce-read-model-core/test/read-model.test.mjs`

**Interfaces:**
- Consume:
  `createCommerceReadModel({ projectId, sellerId, source, clock? })`.
- `source` must implement
  `listCurrentPendingPage({ scope, currency, asOf, cursor, limit, order })`,
  `listSettlementFactPage({ scope, from, to, currency, cursor, limit, order })`,
  `listLowStockCandidatePage({ scope, threshold, cursor, limit, order })`, and
  `listRecentOrderCandidatePage({ scope, cursor, limit, order })`.
- Every page returns `{ items, nextCursor }`, where `nextCursor` is `null` or a
  nonempty opaque string. Every row repeats the exact frozen
  `projectId + sellerId`; the core rejects scope mismatches before aggregation.
- Current pending pages are ordered by
  `created_at_asc_order_id_asc` and contain only current
  `status: 'pending_payment'` rows:

  ```js
  {
    orderId, projectId, sellerId, status: 'pending_payment',
    payableAmount, currency, createdAt, updatedAt
  }
  ```

- Settlement pages are ordered by
  `event_time_asc_order_id_asc_event_id_asc`. They return canonical trusted
  capture/refund events, rather than precomputed merchant totals:

  ```js
  {
    eventId, orderId, projectId, sellerId,
    type: 'capture' | 'refund', amount, currency, occurredAt,
    settlementSource: 'trusted_settlement'
  }
  ```

  Capture events are positive; refund events are positive and independently
  provider-confirmed. The core rejects duplicate `eventId`. The project Adapter
  must reconcile cumulative order refunds before exposing delta events so a
  provider's cumulative callback never becomes a duplicate refund amount.
- Low-stock candidate pages are ordered by
  `available_asc_product_asc_variant_asc` and return scoped
  `{ productId, variantId, projectId, sellerId, availableQuantity,
  reservedQuantity, updatedAt }`.
  Recent-order candidate pages are ordered by
  `created_at_desc_order_id_asc` and return only
  `{ orderId, projectId, sellerId, status, payableAmount, capturedAmount,
  refundedAmount, currency, createdAt }`. The core derives
  `netPaidAmount = capturedAmount - refundedAmount`. `payableAmount` is the
  locked order total after discounts/shipping/tax, `capturedAmount` is the
  provider-verified charged amount, and `refundedAmount` is cumulative
  provider-confirmed completed refunds. Pending rows have captured/refunded
  zero; every row requires `0 <= refundedAmount <= capturedAmount <=
  payableAmount` for the currently supported single-capture model. Customer PII and form
  snapshots remain in the authorized order-detail Adapter.
- Source order and cursor rules are part of the Adapter contract, not hints.
  The core validates row order inside and across pages, rejects repeated
  cursors, and applies output limits only after validation. The Adapter may not
  arbitrarily pre-limit candidates outside the cursor contract.
- Produce:
  `getOverview({ from, to, timeZone, currency = 'JPY',
  interval = 'day', lowStockThreshold = 5, lowStockLimit = 10,
  recentOrderLimit = 10 })` returning an immutable object:

  `lowStockThreshold` is a nonnegative safe integer. Both output limits are
  integers from 1 through 100; invalid values fail `READ_MODEL_LIMIT_INVALID`.

  ```js
  {
    scope: { projectId, sellerId },
    window: { from, to, asOf, timeZone, interval },
    currency,
    metrics: {
      pendingOrders, paidOrders, refundedOrders,
      pendingAmount, grossAmount, refundAmount, netAmount
    },
    trends: [{
      key, startUtc, endUtc, paidOrders, refundedOrders,
      grossAmount, refundAmount, netAmount
    }],
    lowStock: [{ productId, variantId, availableQuantity,
      reservedQuantity, updatedAt }],
    recentOrders: [{
      orderId, status, payableAmount, capturedAmount, refundedAmount,
      netPaidAmount, currency, createdAt
    }]
  }
  ```
- Export immutable `SUPPORTED_CURRENCIES` (`['JPY']`),
  `COMMERCE_READ_STATUSES`, `TREND_INTERVALS`, `READ_PAGE_LIMIT` (`200`),
  `MAX_FACT_ROWS` (`10000` total across pending plus settlement streams),
  `MAX_FACT_PAGES` (`50` per fact stream),
  `MAX_CANDIDATE_ROWS` (`2000` per candidate stream),
  `MAX_CANDIDATE_PAGES` (`10` per candidate stream),
  `MAX_DAY_BUCKETS` (`93`), and `MAX_MONTH_BUCKETS` (`36`). Export pure
  `buildTimeBuckets({ from, to, timeZone, interval })`; each bucket has
  `{ key, startUtc, endUtc }`, where local calendar midnight/month boundaries
  are represented as UTC instants and membership is `startUtc <= t < endUtc`.
  The cap counts intersecting local calendar buckets (at most 93 days or 36
  months), not a fixed millisecond duration, so DST cannot bypass or overcount
  the bound.
- Dependency on prior modules: the project ReadFactsAdapter reads the results
  already persisted by `buyna-commerce-settlement-core` and inventory
  Adapters. The new package does not import settlement, inventory, order, GMV,
  PostgreSQL, an ORM, or a chart package.

- [ ] **Step 1: Write failing scope, fact, and money tests**

  In `read-model.test.mjs`, import the nonexistent package entrypoint and use an
  in-memory `source` that records every call. Cover:

  - missing/blank `projectId` or `sellerId`;
  - every Adapter call receiving the exact immutable server scope;
  - rejection of cross-seller/cross-project rows;
  - duplicate settlement `eventId` rows or a second capture for one order;
  - unsafe, negative, fractional, or mixed-currency source amounts (derived
    period/bucket net remains allowed to be negative);
  - current-pending pages containing any non-`pending_payment` row;
  - capture/refund rows without `trusted_settlement`;
  - lowercase/space-padded `jpy` normalizing to `JPY` and every other currency
    failing closed;
  - stable errors `READ_MODEL_SCOPE_REQUIRED`,
    `READ_MODEL_SCOPE_MISMATCH`, `READ_MODEL_DUPLICATE_EVENT`,
    `READ_MODEL_DUPLICATE_CAPTURE`,
    `READ_MODEL_MONEY_INVALID`, `READ_MODEL_CURRENCY_UNSUPPORTED`, and
    `READ_MODEL_SETTLEMENT_UNTRUSTED`.

  Include this first happy-path assertion:

  ```js
  assert.deepEqual(result.metrics, {
    pendingOrders: 1,
    paidOrders: 2,
    refundedOrders: 1,
    pendingAmount: 3000,
    grossAmount: 12000,
    refundAmount: 2000,
    netAmount: 10000,
  });
  ```

- [ ] **Step 2: Run the focused test to verify RED**

  Run:

  ```powershell
  node --test packages/buyna-commerce-read-model-core/test/read-model.test.mjs
  ```

  Expected: FAIL because the package entrypoint does not exist. Record the
  command and failure in the Batch 4 task report before creating source files.

- [ ] **Step 3: Implement scope and stable metric semantics**

  `errors.mjs` exports `fail(code)` and exact validators. `metrics.mjs` exports
  `normalizePendingRows(rows, scope, currency)`,
  `normalizeSettlementEvents(rows, scope, currency)`, and
  `summarizeCommerceFacts({ pendingRows, settlementEvents })`. Pending is a
  current snapshot and counts only rows still `pending_payment` at `asOf`; it is
  not reconstructed from historical created events. Paid/refunded order counts
  are distinct order IDs with an in-period capture/refund event. Gross sums
  captures, refund sums refunds, and signed safe-integer net is their
  difference; negative net is valid. Freeze normalized rows and summary. Do
  not add a GMV alias or accept Adapter-precomputed totals.

- [ ] **Step 4: Write failing timezone and deterministic-list tests**

  Add tests for:

  - invalid IANA timezone and invalid/reversed range;
  - inclusive `from` and exclusive `to`;
  - `Asia/Tokyo` midnight changing the UTC calendar day;
  - a daylight-saving transition in `America/New_York` without duplicate or
    missing local date keys;
  - `day` and `month` buckets sorted chronologically and zero-filled across the
    requested range;
  - local bucket boundaries represented by exact UTC instants across Tokyo
    midnight and New York DST; events are assigned by those UTC boundaries;
  - captures/refunds appearing in their authoritative `occurredAt` bucket;
  - a period refund for an older capture producing a negative period/bucket net;
  - more than 93 day buckets, more than 36 month buckets, more than 10,000
    settlement/current-pending rows, more than 2,000 candidate rows, a page over
    200 rows, repeated cursor, cursor without progress, and out-of-order rows;
  - low stock sorted by `availableQuantity`, then stable product/variant ID,
    limited after validation;
  - recent orders sorted newest-first, then `orderId`, and limited after scope
    validation;
  - stable errors `READ_MODEL_TIME_ZONE_INVALID`,
    `READ_MODEL_RANGE_INVALID`, `READ_MODEL_SPAN_EXCEEDED`,
    `READ_MODEL_INTERVAL_INVALID`, `READ_MODEL_PAGE_INVALID`,
    `READ_MODEL_CURSOR_LOOP`, `READ_MODEL_FACT_LIMIT_EXCEEDED`,
    `READ_MODEL_SOURCE_ORDER_INVALID`, and `READ_MODEL_FACT_INVALID`.
    Threshold/output-limit mutations also fail `READ_MODEL_LIMIT_INVALID`.

- [ ] **Step 5: Implement timezone buckets and the read service**

  `paged-source.mjs` owns the bounded cursor iterator, ordering comparator,
  cursor-loop detection, and fact/candidate caps. `time-buckets.mjs` validates
  zones with `Intl.DateTimeFormat`, derives local
  calendar parts through `formatToParts`, and converts each local boundary to
  an exact UTC instant; never change process timezone or parse display strings.
  Reject the span before reading facts. `index.mjs` uses one bounded page
  iterator with page size 200, cursor-loop detection, cross-page ordering
  validation, and the declared row caps. It calls all four Adapter methods with
  the same frozen scope, normalizes rows, calculates current pending plus
  period trends, and returns deep-frozen serializable data. It emits no chart
  label, tooltip, CSS token, component, SQL, or query builder.

- [ ] **Step 6: Run package tests and commit**

  Run:

  ```powershell
  npm test --prefix packages/buyna-commerce-read-model-core
  ```

  Expected: all read-model tests pass, including the DST, zero-fill, scope,
  duplicate, and money mutation cases.

  Commit:

  ```powershell
  git add packages/buyna-commerce-read-model-core
  git commit -m "feat: add fixed commerce read models"
  ```

### Task 2: Notification Delivery State Core

**Files:**
- Create: `packages/buyna-delivery-state-core/package.json`
- Create: `packages/buyna-delivery-state-core/src/errors.mjs`
- Create: `packages/buyna-delivery-state-core/src/canonical-json.mjs`
- Create: `packages/buyna-delivery-state-core/src/retry-policy.mjs`
- Create: `packages/buyna-delivery-state-core/src/state-machine.mjs`
- Create: `packages/buyna-delivery-state-core/src/index.mjs`
- Create: `packages/buyna-delivery-state-core/test/delivery-state.test.mjs`

**Interfaces:**
- Consume:
  `createDeliveryStateCore({ projectId, sellerId, store, clock?,
  deliveryIdGenerator, attemptIdGenerator, retryPolicy?, leaseSeconds = 60 })`.
- Export immutable `DELIVERY_STATES`, `DELIVERY_TRANSITIONS`,
  `DELIVERY_KINDS` (`inquiry`, `order`, `booking`), and
  `DELIVERY_CHANNELS` (`email`, `sms`).
- Expose:
  pure `createNotificationSourceEvent(input)`,
  `reconcileSourceEvent(sourceEvent)`, `claim({ deliveryId, workerId })`,
  `markDelivered({ deliveryId, attemptId, receipt })`,
  `markFailed({ deliveryId, attemptId, failure })`,
  `retry({ deliveryId, workerId })`, `recoverExpired({ deliveryId, workerId })`,
  `dispatch({ deliveryId, workerId, recipients, templates, providers })`, and
  `get({ deliveryId })`.
- The order/booking/inquiry domain transaction writes one immutable source
  event/outbox row before commit. `sourceEvent` accepts exactly:

  ```js
  {
    sourceEventId, projectId, sellerId,
    domainRecordId, domainEventId, occurredAt,
    intent: { kind, channel, templateKey, locale, recipientRef, payload }
  }
  ```

  `createNotificationSourceEvent` requires stable domain record/event IDs and
  derives `sourceEventId` as
  `notification-source:v1:<sha256>` over canonical JSON
  `{ version: 1, projectId, sellerId, kind, domainRecordId, domainEventId,
  channel, templateKey }`. The project inserts its returned frozen row inside
  the order/booking/inquiry transaction. The same domain event/channel/template
  therefore always reconciles to the same source identity; changed intent data
  under that identity is detected by `intentDigest` conflict rather than
  silently creating another notification.

  `reconcileSourceEvent` validates scope and creates exactly one DeliveryRecord
  under unique `(projectId, sellerId, sourceEventId)`. Project domain code must
  insert this source event in the same transaction as the order/booking/inquiry
  change. A reconciler pages committed source events after restart and calls
  this function; payment/order success never depends on immediate delivery.
- Canonical JSON for the immutable digest accepts only null, booleans, strings,
  safe integers, arrays, and plain objects. Normalize every string/key to NFC,
  sort object keys by Unicode code-point order, preserve array order, and encode
  UTF-8 without whitespace. Reject undefined, sparse arrays, nonfinite or
  fractional numbers, BigInt, Date, Buffer, functions, symbols, cycles,
  non-plain prototypes, and keys `__proto__`, `prototype`, or `constructor`.
  Reject duplicate keys after NFC normalization. `intentDigest` is lowercase
  SHA-256 over canonical JSON containing
  `{ version: 1, projectId, sellerId, sourceEventId, domainRecordId,
  domainEventId, occurredAt, intent }`.
  `idempotencyKey` is `delivery:v1:<intentDigest>` and `requestKey` is
  `delivery-request:v1:<intentDigest>`; neither is caller-selected.
- Every persisted record has this exact deep-frozen public shape:

  ```js
  {
    version,
    deliveryId, projectId, sellerId, sourceEventId,
    domainRecordId, domainEventId,
    idempotencyKey, intentDigest,
    intent: { kind, channel, templateKey, locale, recipientRef, payload },
    state: 'pending' | 'sending' | 'delivered' | 'failed',
    requestKey,
    attempts: [{
      attemptId, attemptNumber, workerId, claimedAt, leaseUntil,
      state: 'sending' | 'delivered' | 'failed',
      deliveredAt, failedAt, receipt, failure
    }],
    currentAttempt: { attemptId, attemptNumber } | null,
    attemptCount, nextRetryAt,
    createdAt, updatedAt
  }
  ```

  Nonapplicable attempt timestamps/receipt/failure are exactly `null`; no
  undocumented property is allowed. `currentAttempt` is `null` for pending and
  otherwise must point to the matching entry in `attempts`; delivered/failed
  history remains immutable. `version` is a positive safe integer starting at
  1. Every mutation increments it
  by one, preserves `createdAt`, and sets monotonic `updatedAt` from the injected
  clock.
  `attemptCount === attempts.length`; pending has no attempts/current attempt;
  sending/delivered/failed current attempt points to the last attempt. Sending
  has nonnull `leaseUntil` and null receipt/failure. Terminal attempts retain
  `claimedAt`/`workerId`, clear `leaseUntil`, and set exactly one of
  `deliveredAt + receipt` or `failedAt + failure`.
  `nextRetryAt` is nonnull only for a retryable failed current attempt below the
  maximum; it is null for every other state.
- Store Adapter: `transaction(work)`; transaction scope supplies
  `getBySourceEventForUpdate({ scope, sourceEventId })`,
  `createDelivery({ scope, record })`,
  `getDeliveryForUpdate({ scope, deliveryId })`, and
  `saveDelivery({ scope, expectedVersion, record })`. `get` uses
  `store.getDelivery({ scope, deliveryId })`. A project source-event Adapter
  supplies `listCommittedNotificationEvents({ scope, cursor, limit })` to its
  reconciler; the fixed core never scans another merchant.
- `templates.render({ scope, kind, templateKey, locale, payload })` returns an
  immutable `{ subject?, text?, html? }`. `providers.email.send(...)` or
  `providers.sms.send(...)` accepts
  `{ scope, requestKey, recipient, message, metadata }` and returns
  `{ providerMessageId, acceptedAt, providerStatus? }`.
  `metadata` is exactly `{ deliveryId, sourceEventId, attemptId }`; it contains
  no customer, order amount, credential, or arbitrary intent payload.
- `recipients.resolve({ scope, recipientRef, channel })` returns a transient
  `{ address }`; address is passed to the provider as `recipient` but is never
  persisted in DeliveryRecord, receipt, failure, or logs. Every Store,
  TemplateAdapter, RecipientAdapter, and ProviderAdapter call receives and must
  validate the exact frozen `{ projectId, sellerId }`.
- The provider `requestKey` is stable for the delivery, not regenerated per
  attempt. `attemptId` changes for each legal retry. This lets the provider
  Adapter deduplicate a crash after external acceptance while the store records
  each local attempt.
- Default retry policy is immutable
  `{ maxAttempts: 5, delaysSeconds: [60, 300, 900, 3600] }`; an injected policy
  must have `maxAttempts >= 1`, one nonnegative safe-integer delay for every
  retry slot, and no more than 10 attempts. `leaseSeconds` must be a safe
  integer from 5 through 900; invalid policy/lease fails
  `DELIVERY_RETRY_POLICY_INVALID` or `DELIVERY_LEASE_INVALID` before Store I/O.
- Normalized receipt stores only `providerMessageId`, `acceptedAt`, and
  optional `providerStatus`. Normalized failure stores only `code` and
  `retryable`; `failedAt` belongs to the attempt and `nextRetryAt` belongs to
  DeliveryRecord. Raw provider bodies, exception
  stacks, addresses, message text, and secrets never enter the state record.

- [ ] **Step 1: Write failing lifecycle and intent tests**

  Cover `pending -> sending -> delivered`,
  `pending -> sending -> failed`, and eligible `failed -> sending` retry.
  Reject every other transition, wrong scope in source event or any Store row,
  missing/unknown kind/channel,
  unsafe/noncanonical payload values, blank template/recipient reference,
  stale attempt ID,
  invalid/nonmonotonic source/record/provider timestamps,
  completion from `pending`, retry before `nextRetryAt`, retry after a permanent
  failure, and retry at `maxAttempts`. Require stable errors:
  `DELIVERY_SCOPE_REQUIRED`, `DELIVERY_SCOPE_MISMATCH`,
  `DELIVERY_SOURCE_EVENT_INVALID`, `DELIVERY_INTENT_INVALID`,
  `DELIVERY_IDEMPOTENCY_CONFLICT`, `DELIVERY_INVALID_TRANSITION`,
  `DELIVERY_ATTEMPT_STALE`, `DELIVERY_RETRY_NOT_READY`, and
  `DELIVERY_RETRY_EXHAUSTED`.

  Assert the exact DeliveryRecord key set at pending, sending, delivered, and
  failed states, exact attempt key set/null fields, version/timestamp behavior,
  and deep immutability. Assert NFC-equivalent/reordered object input produces
  the same canonical JSON/digest while array reordering or any intent/scope/
  source-event change produces a different digest. Assert identical stable
  domain record/event/channel/template input produces the same deterministic
  `sourceEventId`, while changing any identity component changes it.

- [ ] **Step 2: Run the focused test to verify RED**

  Run:

  ```powershell
  node --test packages/buyna-delivery-state-core/test/delivery-state.test.mjs
  ```

  Expected: FAIL because the package entrypoint does not exist. Record the
  command and failure before creating source files.

- [ ] **Step 3: Implement immutable state, claims, and retry policy**

  `canonical-json.mjs` implements and exports
  `canonicalizeDeliveryIntent(value)` and `digestDeliveryIntent(value)` with the
  exact normalization/rejection rules above; no generic `JSON.stringify`
  digest is accepted.

  `state-machine.mjs` owns only:

  ```text
  pending -> sending -> delivered
                     \-> failed -> sending (only when retry eligible)
  ```

  `claim` and legal `retry` lock the row inside one transaction, allocate
  exactly one new `attemptId`, increment `attemptCount` once, and persist the
  stable provider request key. A nonexpired `sending` lease returns
  `DELIVERY_LEASE_ACTIVE`. `recoverExpired` locks an expired `sending` row and
  resumes the same `attemptId`, `attemptNumber`, and `requestKey`; it updates
  that attempt's `workerId`, `claimedAt`, and `leaseUntil` without incrementing
  `attemptCount` or creating a new external-effect identity. The transaction
  Adapter decides SQL/ORM locking syntax. Freeze returned records and never
  expose mutable persisted rows.

- [ ] **Step 4: Write failing idempotency, concurrency, and receipt tests**

  Add tests for:

  - duplicate source-event reconciliation with the same canonical intent
    returning the first record;
  - the same source-event ID with changed scope, occurrence time, kind, channel,
    template, recipient, or payload failing closed;
  - two workers racing to claim one pending delivery, with one winner;
  - nonexpired lease denial, expired lease recovery by a new worker, process
    restart recovery, and repeated recovery races preserving one attempt;
  - replayed `markDelivered` for the same attempt returning the original result;
  - delivered state never being sent again;
  - repeated `markFailed` not incrementing attempts or moving `nextRetryAt`;
  - recoverable failure delays of 60, 300, 900, and 3600 seconds;
  - permanent failure having `nextRetryAt: null`;
  - provider receipt allowlist rejecting raw response, token, secret, body,
    address, or arbitrary metadata;
  - failure allowlist rejecting raw exception/stack/message content;
  - every Store, Template, Recipient, and Provider call receiving the exact same
    frozen scope, with mutation/cross-seller fixtures failing before effects;
  - Recipient/Template/Provider business errors transitioning the current
    sending attempt to failed, while Store transaction, lock, OCC/version, read,
    `saveDelivered`, and `saveFailed` errors propagate by object identity and
    never cause a second state write;
  - one stable provider request key across attempts, same attempt on lease
    recovery, and a new attempt ID only after a persisted failed-state retry.

- [ ] **Step 5: Implement dispatch through template/provider Adapters**

  `dispatch` preflights the Recipient/Template/Provider methods, then claims or
  recovers the leased attempt. Store/transaction/lock/OCC/version calls are
  outside every business-Adapter catch boundary. It then calls
  RecipientAdapter, exactly one approved TemplateAdapter, and the provider
  matching the persisted channel. Every call includes the same frozen scope.
  It passes only transient recipient output, immutable intent payload, and the
  stable request key.

  Catch only errors thrown by those three business calls. A business error
  shaped `{ code: <stable string>, retryable: <boolean> }` is normalized and
  passed to `markFailed`; unknown recipient/template/provider values become
  `DELIVERY_RECIPIENT_ERROR`, `DELIVERY_TEMPLATE_ERROR`, or
  `DELIVERY_PROVIDER_ERROR` with `retryable: false`. The fixed core never logs
  or persists thrown text. The `markFailed` Store call itself is outside that
  catch: if it fails, propagate the exact Store error and leave the persisted
  record at `sending`.

  On provider success, normalize the receipt and call `markDelivered` outside
  the provider catch. Any Store/transaction/OCC/save error from claim,
  recovery, `markFailed`, or `markDelivered` propagates unchanged; `dispatch`
  must never reinterpret it as a business failure, call `markFailed`, or write
  another version. A missing provider/template/recipient method fails before
  claim/state transition with `DELIVERY_RECIPIENT_ADAPTER_REQUIRED`,
  `DELIVERY_TEMPLATE_ADAPTER_REQUIRED`, or
  `DELIVERY_PROVIDER_ADAPTER_REQUIRED`.

- [ ] **Step 6: Add provider crash/replay behavior tests**

  Simulate provider acceptance followed by `saveDelivered` throwing one exact
  OCC/Store error object. Assert `dispatch` rejects with that same object,
  `saveFailed` is never called, no failed/version write exists, and the
  persisted record remains the prior `sending` version. Before lease expiry,
  another worker is rejected. After expiry, recover the same
  `attemptId + requestKey`; the fake provider idempotency store returns the same
  receipt and the record reaches `delivered` with one external effect. Mutation
  tests repeat this for claim/read/transaction/OCC/save errors shaped like
  `{ code, retryable }` to prove shape alone cannot cross the Store/business
  boundary. Also assert template rendering is project-owned and may differ by
  locale without changing state semantics.

  Add a domain-transaction recovery test: commit one order/booking plus its
  immutable notification source event, crash before reconciliation, restart the
  worker, page that committed event, and reconcile/dispatch it. Replay the same
  source event and assert one DeliveryRecord and one external provider effect.
  A domain transaction rollback must leave no source event and therefore no
  delivery. This is the required commit-before-enqueue exact-once recovery
  contract; direct best-effort `enqueue` after commit is not allowed.

- [ ] **Step 7: Run package tests and commit**

  Run:

  ```powershell
  npm test --prefix packages/buyna-delivery-state-core
  ```

  Expected: all transition, retry, concurrency, redaction, idempotency, and
  Adapter-orchestration tests pass.

  Commit:

  ```powershell
  git add packages/buyna-delivery-state-core
  git commit -m "feat: add fixed notification delivery state"
  ```

### Task 3: Repository Registration And Source Boundary

**Files:**
- Create: `tests/read-model-delivery-state-modules.test.mjs`
- Modify: `repository-manifest.json`
- Modify: `tests/fixtures/shared-module-boundaries.json`
- Modify: `README.md`
- Modify: `docs/OPERATIONS_MANUAL.md`

**Interfaces:**
- Register `buyna-commerce-read-model-core` and `buyna-delivery-state-core`
  exactly once in `manifest.packages` and
  `manifest.profiles['website-builder'].packages`.
- Extend the boundary fixture with `readModelDeliverySourceBoundary` containing
  scanned source extensions, stylesheet/component extensions, known merchant
  and production identifier patterns, raw-secret signatures, and forbidden
  module specifiers for UI frameworks, chart libraries, SQL/ORM, AWS SDK,
  provider transports/SDKs, SMTP/SMS clients, and project routes.
- The repository contract names the packages and points to their package APIs;
  it does not duplicate their algorithms in README/Operations Manual.

- [ ] **Step 1: Write the failing executable repository contract**

  Test all of the following before editing manifest/docs:

  - both packages exist, have a `test` script, and export only their documented
    framework-neutral entrypoints;
  - both appear exactly once in the complete package list and website profile;
  - the complete installer derives package installation from the manifest and
    therefore includes both without a package-specific copy list;
  - shared source has no CSS/SCSS/LESS/Stylus, JSX/TSX/Vue/Svelte, UI framework,
    chart library, SQL/ORM, AWS SDK, provider SDK/transport, SMTP/Twilio-like
    client, project route import, known merchant identifier, production
    domain/IP/ARN, or raw credential literal;
  - read-model source has no `gmv` import/export/label and does not import
    `buyna-gmv-core`;
  - delivery source contains no template copy, email address, phone number,
    message body, provider hostname, or credential-selection code;
  - runtime outputs from mutation fixtures contain only documented keys and no
    password, token, cookie, card, CVV, secret, raw provider response, stack, or
    customer contact value;
  - DeliveryRecord/attempt shapes, canonical JSON/digest vectors, lease fields,
    version/timestamps, and scope are repository-visible and mutation-tested;
  - read adapters expose only the bounded page/cursor/order contract and no
    unbounded `listAll`, arbitrary pre-limit total, or caller-provided aggregate;
  - README and Operations Manual state fixed behavior versus generated
    SQL/ORM/chart/template/provider/UI boundaries without naming a standard
    Dashboard design.

- [ ] **Step 2: Run the repository test to verify RED**

  Run:

  ```powershell
  node --test tests/read-model-delivery-state-modules.test.mjs
  ```

  Expected: FAIL because the new packages are not registered and the new
  boundary fixture/docs are absent.

- [ ] **Step 3: Update manifest, boundary fixture, and concise docs**

  Keep arrays deterministic and alphabetized in the repository's existing
  compact JSON style. Document this ownership table once:

  | Fixed module | Project-generated Adapter/presentation |
  |---|---|
  | metric definitions, trusted-fact validation, timezone buckets, sorting | scoped SQL/ORM facts query, API, chart mapping, labels, cards, tables, charts, CSS |
  | canonical notification intent/digest, source-event reconciliation, transition, lease/attempts, retry, idempotency, safe receipt | transactional source-event row Adapter, recipient lookup, template copy, email/SMS provider, worker schedule, provider credentials |

  State explicitly that merchant Dashboard sales metrics are not Buyna CRM GMV.

- [ ] **Step 4: Verify and commit**

  Run:

  ```powershell
  node --test tests/read-model-delivery-state-modules.test.mjs
  powershell -ExecutionPolicy Bypass -File .\scripts\validate.ps1
  ```

  Expected: zero failures, including manifest/install and source-boundary
  mutations.

  Commit:

  ```powershell
  git add repository-manifest.json tests/fixtures/shared-module-boundaries.json tests/read-model-delivery-state-modules.test.mjs README.md docs/OPERATIONS_MANUAL.md
  git commit -m "docs: register read model and delivery state modules"
  ```

### Task 4: Skill And Builder Routing For Read/Delivery State

**Files:**
- Record baseline in:
  `.superpowers/sdd/2026-08-26-fixed-state-logic-batch-4/task-4-report.md`
- Create: `tests/read-model-delivery-state-routing.test.mjs`
- Create: `tests/read-model-delivery-skill-contract.test.mjs`
- Create: `skills/buyai-dashboard-data-interaction/references/commerce-read-model-adapter-contract.md`
- Create: `skills/buyai-dashboard-data-interaction/references/delivery-state-adapter-contract.md`
- Modify: `skills/buyna-website-builder/SKILL.md`
- Modify: `skills/buyna-website-builder/scripts/route-builder.mjs`
- Modify: `skills/buyna-website-builder/references/routing-map.md`
- Modify: `skills/buyna-website-builder/references/phase-05-dashboard-integration.md`
- Modify: `packages/buyna-workflow-state-core/src/index.mjs`
- Modify: `packages/buyna-workflow-state-core/test/workflow-state.test.mjs`
- Modify: `packages/buyna-workflow-state-core/test/verified-file-store.test.mjs`
- Modify: `skills/buyai-dashboard-data-interaction/SKILL.md`
- Modify: `skills/buyai-product-merchant-backend/SKILL.md`
- Modify: `skills/buyai-booking-service-backend/SKILL.md`
- Modify: `skills/buyna-frontend-builder/SKILL.md`
- Modify: `skills/buyna-skill-operations/SKILL.md`
- Synchronize: `.agents/skills/buyna-website-builder/**`

**Routing contract:**
- Extend the public
  `planWebsiteRoute({ capabilities, workflowState, requestedSlice,
  releaseIntent = false, mode = 'build', dashboardSlice = null,
  notificationOperation = null })` signature. Do not add a website gate or a
  free-form notification flag.
- Add the authoritative workflow transition
  `setApprovedNotificationOperations({ state, operations, approvedBy, now })`.
  Allowed operations are exactly `order_notification` and
  `booking_notification`. It runs only after approved design/page structure and
  before frontend delivery, validates persisted domain capabilities and
  approved Dashboard slices, and writes
  `configuration.notificationOperations` plus provenance-checked approval
  evidence. Order notification requires `orders` plus product/order capability;
  booking notification requires `bookings` plus `requiresBooking`. A later
  addition returns `NOTIFICATION_OPERATION_SCOPE_CHANGE_REQUIRED`; callers
  never edit configuration directly. The operation list is captured in the
  same approved design/work-package decision as its matching Dashboard slice;
  it does not create a second confirmation prompt.
- Define immutable internal selection data:

  ```js
  const readModelDashboardSlices = ['dashboard'];
  const notificationOperationSlices = {
    order_notification: 'orders',
    booking_notification: 'bookings'
  };
  ```

- An approved Dashboard route selects
  `buyna-commerce-read-model-core` exactly once when its normalized persisted
  `dashboardSlices` intersects `readModelDashboardSlices`.
- Inventory, order, booking, customer, and paid-customer lists/details continue
  using their existing fixed cores and project APIs. They do not select the
  commerce read model merely because they display rows or amounts.
- It selects `buyna-delivery-state-core` exactly once only when the caller asks
  for one `notificationOperation` already persisted through the workflow
  transition, the operation matches the selected approved `orders`/`bookings`
  slice, and persisted domain capabilities match. Omission selects no delivery
  module. Customer and paid-customer lists never select it. Unknown/unapproved
  operations block with `NOTIFICATION_OPERATION_NOT_APPROVED`; slice/domain
  mismatch blocks with `NOTIFICATION_OPERATION_NOT_APPLICABLE` before adding
  dependencies.
- Static/local preview, design, frontend-only, file-only `products/services`,
  checkout-only payment repair, testing, and release routes do not select the
  two modules unless the actual target is an approved matching Dashboard slice.
- Existing auth -> merchant context -> business Adapter order remains intact.
  Read/delivery Adapters consume the fresh request-local immutable context and
  never accept browser `projectId`/`sellerId`.

- [ ] **Step 1: Record fresh-context baseline scenarios**

  Run the current router for: Dashboard overview, inventory low-stock,
  product orders, booking records, paid customers, product image-only slice,
  static preview, checkout-only GlobePay repair, and a cross-seller notification
  repair. Under `## BASELINE_SCENARIOS` record input, observed route, expected
  route, and mismatch. Note any regenerated metric/retry logic, missing fixed
  module, extra confirmation, fixed UI, unrelated Skill, Git/AWS intent, GMV
  exposure, or provider/template generation. This report is transient evidence,
  not repository product documentation.

- [ ] **Step 2: Write failing executable routing tests**

  Exercise `planWebsiteRoute`, not only prose matching. Build canonical workflow
  fixtures through `createWorkflow`, approved gate transitions, and
  `setApprovedDashboardSlices`. Assert:

  ```js
  const overview = planWebsiteRoute({
    capabilities, workflowState: stateWithSlices(['dashboard']),
    requestedSlice: 'dashboard_integration', dashboardSlice: 'dashboard'
  });
  assert.equal(overview.fixedModules.filter(
    x => x === 'buyna-commerce-read-model-core').length, 1);
  assert.ok(!overview.fixedModules.includes('buyna-delivery-state-core'));
  assert.deepEqual(overview.externalActions, { git: false, aws: false });
  ```

  Required matrix:

  - `dashboard` selects read model once;
  - `inventory`, `orders`, `bookings`, `customers`, and `paid_customers` do not
    select read model;
  - explicit persisted `order_notification` on `orders` selects delivery once;
  - explicit persisted `booking_notification` on `bookings` selects delivery
    once;
  - omission, ordinary order/booking list, and customer/paid-customer list work
    select no delivery module;
  - product `products` and booking `services` select neither new module;
  - static/local preview and checkout-only repair select neither;
  - `dashboardSlice: 'all'` selects read model once only when `dashboard` is
    persisted and never implies delivery; the explicit persisted notification
    operation remains required;
  - unapproved/unknown slices block before adding either module;
  - unknown/unapproved/mismatched operations block before dependencies, and a
    caller cannot forge product/booking capabilities to acquire delivery;
  - dependency closure and manifest verification preserve exact-once ordering;
  - every result preserves stable `dashboardSlice`, `dashboardSlices`,
    `notificationOperation`, `continueWithoutConfirmation`, and
    `externalActions`.

  Add workflow-core tests proving notification approval cannot run before
  design approval, cannot name an unknown operation, cannot approve an
  operation without its matching persisted domain/slice, cannot be forged by
  direct configuration mutation, and cannot expand after frontend work starts.
  Provenance/serialization tests cover the new approval evidence.

- [ ] **Step 3: Write the failing Skill/Adapter contract test**

  Before editing any Skill/reference, assert:

  - Dashboard Skill links both new Adapter contracts and orders fresh auth,
    merchant context, read/delivery service, then project presentation/provider;
  - Dashboard guidance confines read model to the overview and confines
    delivery to explicit approved order/booking notification operations; list
    slices keep their existing order/inventory/booking/customer services;
  - read-model contract defines exact fact/output keys, inclusive-start/
    exclusive-end range, IANA timezone, day/month buckets, SQL/ORM Adapter
    ownership, and chart Adapter ownership;
  - the contract rejects browser status/amount authority and requires facts
    written by trusted settlement;
  - delivery contract defines exact Store/Template/Email/SMS Adapter methods,
    stable request key, attempt/retry behavior, safe receipt, and worker recovery;
  - product and booking Skills call the fixed delivery module for approved
    inquiry/order/booking notification work instead of generating a state
    machine;
  - frontend Skill imports stable data/state but generates every chart,
    component, message copy, label, color, font, spacing, responsive behavior,
    and CSS per project;
  - operations installs/checks both manifest modules;
  - Builder remains the single entrypoint, routes overview by persisted slice
    and delivery only by the explicit persisted notification operation, and
    does not add a rigid phase or repeat approval inside an authorized package;
  - `buyna-gmv-commerce` remains CRM-only and no edited merchant-facing file
    labels gross/refund/net as GMV;
  - no Skill requires one fixed Dashboard shell, chart library, template text,
    email/SMS vendor, provider account, SQL schema name, or ORM.

- [ ] **Step 4: Run routing/Skill tests to verify RED**

  Run:

  ```powershell
  node --test tests/read-model-delivery-state-routing.test.mjs
  node --test tests/read-model-delivery-skill-contract.test.mjs
  ```

  Expected: routing fails because overview/delivery dependencies and the
  provenance-backed notification-operation transition are absent;
  Skill contract fails because Adapter contracts and guidance are absent. Both
  tests must be red before `route-builder.mjs` or any Skill is edited.

- [ ] **Step 5: Implement deterministic route selection**

  First implement `setApprovedNotificationOperations` in workflow core using the
  same immutable transition/provenance pattern as approved Dashboard slices;
  extend state validation, serialization, verified history, and exact-key
  checks so a hand-built configuration is rejected.

  Add the overview slice set and operation-to-slice map near the existing
  file-capable slice set. Normalize `notificationOperation` from verified
  persisted workflow configuration before `routeForGate`; a request field alone
  has no authority. Inside `dashboard_integration`, select read model only for
  `dashboard` and delivery only for the explicit approved operation/matching
  slice/domain. Add each through `addUnique`; update dependency validation and
  closure so missing manifest entries fail closed. Preserve canonical gate
  readiness, payment architecture, work-package authorization, and external
  action flags.

- [ ] **Step 6: Write exact SQL/ORM/chart and delivery Adapter guidance**

  The read-model reference must provide:

  - scoped, cursor-paged current pending rows, trusted capture/refund events,
    low-stock candidates, and recent-order candidates with the exact fixed
    ordering contract;
  - captured/refunded events sourced from provider-verified settlement records;
  - the fixed 200-row page size, row/span/bucket caps, cursor/order validation,
    and stable limit errors; indexes/query plans remain project responsibilities;
  - fixed output passed into a generated ChartAdapter such as
    `toProjectChartSeries({ trends, locale, labels })`, without a chart-library
    import in the fixed package;
  - ordinary merchant sales wording and an explicit prohibition on CRM GMV
    events, keys, labels, or endpoints.

  The delivery reference must provide:

  - exact Store transaction methods from Task 2;
  - transactional domain source-event/outbox creation and deterministic
    source-event reconciliation after commit/restart;
  - project RecipientAdapter, TemplateAdapter, and channel ProviderAdapter,
    each validating the same frozen scope;
  - server-side transient recipient resolution from `recipientRef`;
  - a queue/worker that calls `dispatch`, persists lease/retry timestamps, and
    resumes the same expired sending attempt after process restart;
  - the exact business-error catch boundary: recipient/template/provider errors
    may mark failed, while Store/transaction/OCC/save errors propagate and leave
    the sending record for lease recovery;
  - stable provider request-key handling and receipt redaction;
  - no browser authority, frontend provider call, provider secret in a message
    record, or customer payment data in templates.

- [ ] **Step 7: Make minimal Skill guidance changes**

  Dashboard Skill consumes the fixed read/delivery modules only when selected
  by the authoritative route. Product/booking Skills write the immutable
  notification source event inside the relevant domain transaction, then let a
  reconciler create/dispatch it; direct best-effort enqueue after commit is
  forbidden. Notification failure never changes order/booking/payment success.
  Frontend Skill consumes
  stable metrics/state and generates presentation. Operations verifies package
  presence and versions. Every child inherits Builder work package and Adapter
  contract; none repeats intake, design approval, onboarding, or confirmation.

- [ ] **Step 8: Synchronize canonical Builder copy**

  Copy only verified Builder files to `.agents/skills/buyna-website-builder`.
  Assert byte/hash equality for `SKILL.md`, `agents/openai.yaml`, routing map,
  phase references, workflow contract, and `scripts/route-builder.mjs`.

- [ ] **Step 9: Verify Skills/routing and commit**

  Run:

  ```powershell
  node --test tests/read-model-delivery-state-routing.test.mjs
  node --test tests/read-model-delivery-skill-contract.test.mjs
  npm test --prefix packages/buyna-workflow-state-core
  npm test --prefix packages/buyna-commerce-read-model-core
  npm test --prefix packages/buyna-delivery-state-core
  powershell -ExecutionPolicy Bypass -File .\scripts\validate.ps1
  python -X utf8 "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" skills/buyna-website-builder
  python -X utf8 "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" skills/buyai-dashboard-data-interaction
  python -X utf8 "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" skills/buyai-product-merchant-backend
  python -X utf8 "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" skills/buyai-booking-service-backend
  python -X utf8 "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" skills/buyna-frontend-builder
  python -X utf8 "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" skills/buyna-skill-operations
  ```

  Expected: all commands exit zero; no test uses a prose-only route assertion
  as a substitute for executable `planWebsiteRoute` behavior.

  Commit:

  ```powershell
  git add packages/buyna-workflow-state-core skills .agents/skills/buyna-website-builder tests/read-model-delivery-state-routing.test.mjs tests/read-model-delivery-skill-contract.test.mjs
  git commit -m "feat: route commerce read and delivery state"
  ```

### Task 5: Batch 4 Integration And Full Verification

**Files:**
- Create: `tests/read-model-delivery-state-integration.test.mjs`
- Verify the complete Batch 4 branch. A behavior repair requires a new failing
  test and a focused red-green cycle before production code changes.

**Integration contract:**
- Consume: existing `buyna-commerce-settlement-core`,
  `buyna-inventory-core`, `buyna-merchant-dashboard-core`, Tasks 1-4,
  repository manifest, and Builder routing.
- Produce: a reviewed Batch 4 candidate with no live-resource mutation and no
  fixed visual design/provider/database implementation.

- [ ] **Step 1: Write the end-to-end in-memory composition test**

  Compose this exact flow with in-memory Adapters:

  ```text
  trusted provider paid event
    -> settlement transaction persists captured total
    -> trusted partial refund persists cumulative refund
    -> scoped paged ReadFactsAdapter returns trusted capture/refund delta events
    -> commerce read model returns gross/refund/net and timezone trend
    -> Dashboard operation moves loading -> ready with stable data
    -> order transaction commits immutable notification source event
    -> simulated crash before reconciliation, then restart reconciliation
    -> RecipientAdapter + TemplateAdapter + EmailAdapter dispatch once
    -> delivered state stores normalized receipt
  ```

  Assert gross `10000`, refund `2000`, net `8000`; one paid order; one refunded
  order; the expected `Asia/Tokyo` day bucket; newest recent-order ordering; and
  low-stock rows from the scoped inventory fixture. Replay the paid/refund
  events, paged reads, source-event reconciliation, and dispatch, and assert
  totals, DeliveryRecord, attempt identity, and external effects do not
  duplicate. Assert every fact row and Store/Recipient/Template/Provider call
  carries the same frozen scope.

- [ ] **Step 2: Add failure/retry and isolation integration cases**

  Use a second notification whose SMS Adapter fails once with a retryable error.
  Advance the injected clock to `nextRetryAt`, retry with a new attempt ID and
  the same provider request key, and assert one final delivered receipt. Then
  simulate a provider-accepted send followed by `saveDelivered`/OCC failure.
  Assert the exact Store error propagates, `saveFailed` is not called, no
  failed/version write occurs, and persisted state remains the prior `sending`
  record. Expire its lease, restart with a new worker, and assert recovery uses
  the same attempt ID/request key, reaches delivered, and the provider fake
  records one external effect. Inject a Store error shaped like a retryable
  provider error and prove it still follows this Store path.
  Run a period containing only the refund of an older capture and assert
  negative net is preserved, not clamped. Then
  execute the same read/delivery calls for a second seller and assert every
  first-seller row is rejected before query aggregation, template rendering,
  or provider send. Prove notification failure never rolls back the already
  paid order and never changes gross/refund/net.

- [ ] **Step 3: Run the integration test and make only contract repairs**

  Run:

  ```powershell
  node --test tests/read-model-delivery-state-integration.test.mjs
  ```

  Expected: PASS using Tasks 1-4 published interfaces. If a public interface
  mismatch makes it red, keep the test, change only that mismatch under a
  focused red-green cycle, and rerun both affected package suites. Do not add
  SQL, provider, AWS, route, DOM, or visual code to a shared package.

- [ ] **Step 4: Run every package and root test with fail-on-any propagation**

  Run this exact block:

  ```powershell
  $ErrorActionPreference = 'Stop'
  $packageDirs = Get-ChildItem -LiteralPath .\packages -Directory | Sort-Object Name
  foreach ($packageDir in $packageDirs) {
    $packageJsonPath = Join-Path $packageDir.FullName 'package.json'
    if (-not (Test-Path -LiteralPath $packageJsonPath)) { continue }
    $packageJson = Get-Content -Raw -LiteralPath $packageJsonPath | ConvertFrom-Json
    if (-not $packageJson.scripts.test) { continue }
    & npm test --prefix $packageDir.FullName
    if ($LASTEXITCODE -ne 0) { throw "PACKAGE_TEST_FAILED:$($packageDir.Name):$LASTEXITCODE" }
  }
  $rootTests = @(Get-ChildItem -LiteralPath .\tests -Filter '*.test.mjs' -File | Sort-Object Name | ForEach-Object FullName)
  if ($rootTests.Count -eq 0) { throw 'ROOT_TESTS_NOT_FOUND' }
  & node --test @rootTests
  if ($LASTEXITCODE -ne 0) { throw "ROOT_TEST_FAILED:$LASTEXITCODE" }
  ```

  Expected: zero failed, cancelled, skipped-by-error, or omitted package/root
  suites.

- [ ] **Step 5: Run repository and official Skill validation**

  Run `scripts/validate.ps1` and `quick_validate.py` for every Skill modified in
  Task 4. Re-run the manifest/source-boundary test with mutation fixtures.
  Expected: all manifest, installer, canonical-copy hash, source-boundary, and
  Skill structure checks pass.

- [ ] **Step 6: Inspect the complete Batch 4 diff**

  Confirm no merchant identifier, CRM GMV exposure, CSS/theme/component/chart
  UI, SQL/ORM implementation, database migration, AWS SDK, provider SDK/host,
  template copy, recipient contact, credential, secret, payment path, live
  resource call, deployment, or rigid new website phase entered the branch.
  Confirm fixed modules own behavior only and generated project files own every
  visible/design/provider/database choice.

- [ ] **Step 7: Commit integration evidence or red-green repairs**

  ```powershell
  git add packages tests skills .agents repository-manifest.json README.md docs
  git commit -m "test: verify commerce read and delivery state batch"
  ```

  Create this commit only when the integration test or a verified repair changed
  tracked files. Never create an empty evidence commit.

- [ ] **Step 8: Record Batch 4 handoff**

  Record exact commits, commands, test counts, source-boundary results, review
  findings, deferred minors, and confirmation that AWS/live payment/live
  notification state was untouched. The branch is ready for the parent
  repository's final whole-plan review and explicit main-branch integration;
  this task itself does not push, deploy, or activate a provider.

## Self-Review Checklist

- [ ] Every Batch 4 spec requirement maps to Tasks 1 or 2 and is consumed by
  Tasks 3-5.
- [ ] Metric keys and definitions are identical in unit tests, Adapter contract,
  Skills, routing tests, and integration tests.
- [ ] Read facts come only from server-scoped trusted settlement persistence;
  browser return/status/amount never becomes paid/refunded authority.
- [ ] Provider cumulative refund callbacks are converted by the project Adapter
  into unique completed delta events; the read core rejects duplicate event IDs
  and never double counts them.
- [ ] Timezone buckets use IANA zones and local calendar parts, with explicit
  DST, local-boundary-to-UTC-instant, and inclusive-start/exclusive-end tests.
- [ ] Day/month span caps, page/fact/candidate caps, cursor progress, and
  within/cross-page ordering are consistent in code, contracts, and tests.
- [ ] Currency normalizes only to allowlisted JPY, pending means current
  `pending_payment`, recent-order payable/captured/refunded/net amounts are
  explicit, and negative period net remains valid.
- [ ] Merchant read models contain no GMV import, label, CRM endpoint, Outbox,
  credential, or internal event exposure.
- [ ] DeliveryRecord, attempts/currentAttempt, lease, version/timestamps,
  canonical digest, source-event reconciliation, retry time, stable provider
  request key, and receipt/failure property names match across all contracts.
- [ ] Provider acceptance/store-crash replay is tested without promising
  impossible exactly-once I/O: production ProviderAdapters must honor the fixed
  request key through provider idempotency/query before claiming this guarantee.
- [ ] Only Recipient/Template/Provider call errors enter the business-failure
  transition. Store/transaction/OCC/save errors retain object identity, never
  call `markFailed`, and recover the same sending attempt after lease expiry.
- [ ] Template/provider/recipient errors cannot leak raw PII, message bodies,
  exception stacks, credentials, or provider responses into state.
- [ ] Builder selects read model only for overview and delivery only for an
  explicit provenance-checked order/booking notification operation; lists do
  not acquire either module, no gate is added, and work-package behavior remains.
- [ ] Static, file-only, frontend-only, checkout-only, testing, and release
  routes do not acquire unrelated read/delivery modules.
- [ ] SQL/ORM, charts, templates, email/SMS, worker schedules, APIs, UI/UX, and
  CSS remain project-generated Adapters/presentation.
- [ ] Every Skill edit follows a failing executable contract test and the
  canonical Builder copy remains synchronized.
- [ ] Full verification propagates every package/root failure and performs no
  live mutation.
