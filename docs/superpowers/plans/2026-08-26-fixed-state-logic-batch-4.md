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
- Fixed read-model code owns exact metric semantics, safe-integer money,
  timezone validation/buckets, deterministic sorting, and stable errors.
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
  -> buyna-delivery-state-core enqueues immutable intent once
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
- Create: `packages/buyna-commerce-read-model-core/src/time-buckets.mjs`
- Create: `packages/buyna-commerce-read-model-core/src/metrics.mjs`
- Create: `packages/buyna-commerce-read-model-core/src/index.mjs`
- Create: `packages/buyna-commerce-read-model-core/test/read-model.test.mjs`

**Interfaces:**
- Consume:
  `createCommerceReadModel({ projectId, sellerId, source, clock? })`.
- `source` must implement
  `listOrderFacts({ scope, from, to, currency })`,
  `listLowStockFacts({ scope, threshold, limit })`, and
  `listRecentOrderFacts({ scope, limit })`.
- `listOrderFacts` returns exactly one canonical row per order whose pending,
  capture, or refund event intersects the requested range:

  ```js
  {
    orderId, projectId, sellerId,
    status: 'pending_payment' | 'paid' | 'partially_refunded' | 'refunded',
    pendingAmount, capturedAmount, refundedAmount, currency,
    createdAt, capturedAt,
    refunds: [{ refundId, amount, completedAt }],
    settlementSource: 'trusted_settlement' | null
  }
  ```

  Pending rows use `capturedAmount: 0`, `capturedAt: null`,
  `refundedAmount: 0`, `refunds: []`, and `settlementSource: null`.
  Paid/refunded rows require
  `settlementSource: 'trusted_settlement'`, `capturedAmount > 0`, and
  `0 <= refundedAmount <= capturedAmount`. Each provider-confirmed completed
  partial/full refund appears once in `refunds`, refund IDs are unique, and the
  safe-integer sum equals `refundedAmount`. The fixed core rejects duplicate
  `orderId` or `refundId` rows rather than double counting them.
- `listLowStockFacts` returns scoped
  `{ productId, variantId, availableQuantity, reservedQuantity, updatedAt }`.
  `listRecentOrderFacts` returns only
  `{ orderId, status, amount, currency, createdAt }`; customer PII and form
  snapshots remain in the authorized order-detail Adapter.
- Produce:
  `getOverview({ from, to, timeZone, currency = 'JPY',
  interval = 'day', lowStockThreshold = 5, lowStockLimit = 10,
  recentOrderLimit = 10 })` returning an immutable object:

  ```js
  {
    scope: { projectId, sellerId },
    window: { from, to, timeZone, interval },
    currency,
    metrics: {
      pendingOrders, paidOrders, refundedOrders,
      pendingAmount, grossAmount, refundAmount, netAmount
    },
    trends: [{
      key, start, end, pendingOrders, paidOrders, refundedOrders,
      grossAmount, refundAmount, netAmount
    }],
    lowStock: [{ productId, variantId, availableQuantity,
      reservedQuantity, updatedAt }],
    recentOrders: [{ orderId, status, amount, currency, createdAt }]
  }
  ```
- Export immutable `COMMERCE_READ_STATUSES`, `TREND_INTERVALS`, and pure
  `bucketTimestamp({ timestamp, timeZone, interval })` for `day` and `month`.
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
  - duplicate `orderId` or `refundId` rows and refund-sum mismatch;
  - unsafe, negative, fractional, or mixed-currency amounts;
  - pending rows carrying captured/refund money;
  - paid/refunded rows without `trusted_settlement`;
  - cumulative refund above captured amount;
  - stable errors `READ_MODEL_SCOPE_REQUIRED`,
    `READ_MODEL_SCOPE_MISMATCH`, `READ_MODEL_DUPLICATE_ORDER`,
    `READ_MODEL_MONEY_INVALID`, `READ_MODEL_CURRENCY_MISMATCH`, and
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
  `normalizeOrderFacts(rows, scope, currency)` and
  `summarizeCommerceFacts(facts, window)`. Count a paid order when its trusted
  `capturedAt` is inside the inclusive-start/exclusive-end window; count a
  refunded order once when at least one completed refund is inside the window.
  Count a pending order when its `createdAt` is inside the window. Gross sums
  in-window captures, refund sums in-window refund entries, and net is their
  difference. Calculate all totals with safe-integer overflow checks. Freeze
  normalized rows and the returned summary. Do not add a GMV alias or accept
  precomputed totals from the Adapter.

- [ ] **Step 4: Write failing timezone and deterministic-list tests**

  Add tests for:

  - invalid IANA timezone and invalid/reversed range;
  - inclusive `from` and exclusive `to`;
  - `Asia/Tokyo` midnight changing the UTC calendar day;
  - a daylight-saving transition in `America/New_York` without duplicate or
    missing local date keys;
  - `day` and `month` buckets sorted chronologically and zero-filled across the
    requested range;
  - captures appearing in their authoritative `capturedAt` bucket and every
    partial/full refund appearing in its own authoritative `completedAt` bucket;
  - low stock sorted by `availableQuantity`, then stable product/variant ID,
    limited after validation;
  - recent orders sorted newest-first, then `orderId`, and limited after scope
    validation;
  - stable errors `READ_MODEL_TIME_ZONE_INVALID`,
    `READ_MODEL_RANGE_INVALID`, `READ_MODEL_INTERVAL_INVALID`, and
    `READ_MODEL_FACT_INVALID`.

- [ ] **Step 5: Implement timezone buckets and the read service**

  `time-buckets.mjs` must validate zones with `Intl.DateTimeFormat` and derive
  local calendar keys through `formatToParts`; never change process timezone or
  parse locale-formatted display strings. `index.mjs` calls all three Adapter
  methods with the same frozen scope, normalizes their rows, calculates the
  summary/trends, and returns deep-frozen serializable data. It emits no chart
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
- Create: `packages/buyna-delivery-state-core/src/retry-policy.mjs`
- Create: `packages/buyna-delivery-state-core/src/state-machine.mjs`
- Create: `packages/buyna-delivery-state-core/src/index.mjs`
- Create: `packages/buyna-delivery-state-core/test/delivery-state.test.mjs`

**Interfaces:**
- Consume:
  `createDeliveryStateCore({ projectId, sellerId, store, clock?,
  deliveryIdGenerator, attemptIdGenerator, retryPolicy? })`.
- Export immutable `DELIVERY_STATES`, `DELIVERY_TRANSITIONS`,
  `DELIVERY_KINDS` (`inquiry`, `order`, `booking`), and
  `DELIVERY_CHANNELS` (`email`, `sms`).
- Expose:
  `enqueue(intent)`, `claim({ deliveryId, workerId })`,
  `markDelivered({ deliveryId, attemptId, receipt })`,
  `markFailed({ deliveryId, attemptId, failure })`,
  `retry({ deliveryId, workerId })`,
  `dispatch({ deliveryId, workerId, templates, providers })`, and
  `get({ deliveryId })`.
- `enqueue(intent)` accepts exactly:

  ```js
  {
    idempotencyKey, kind, channel, templateKey, locale,
    recipientRef, payload
  }
  ```

  It stores an immutable normalized intent and payload digest. The fixed core
  never resolves an email/phone number, renders copy, or stores card/payment
  credentials. Reusing an idempotency key with the same digest returns the
  existing delivery; a different digest fails
  `DELIVERY_IDEMPOTENCY_CONFLICT`.
- Store Adapter: `transaction(work)`; transaction scope supplies
  `getByIdempotencyKey`, `createDelivery`, `getDeliveryForUpdate`,
  `saveSendingAttempt`, `saveDelivered`, and `saveFailed`. Every method receives
  the exact scope. `get` uses `store.getDelivery({ scope, deliveryId })`.
- `templates.render({ kind, templateKey, locale, payload })` returns an
  immutable `{ subject?, text?, html? }`. `providers.email.send(...)` or
  `providers.sms.send(...)` accepts
  `{ requestKey, recipientRef, message, metadata }` and returns
  `{ providerMessageId, acceptedAt, providerStatus? }`.
- The provider `requestKey` is stable for the delivery, not regenerated per
  attempt. `attemptId` changes for each legal retry. This lets the provider
  Adapter deduplicate a crash after external acceptance while the store records
  each local attempt.
- Default retry policy is immutable
  `{ maxAttempts: 5, delaysSeconds: [60, 300, 900, 3600] }`; an injected policy
  must have `maxAttempts >= 1`, one nonnegative safe-integer delay for every
  retry slot, and no more than 10 attempts.
- Normalized receipt stores only `providerMessageId`, `acceptedAt`, and
  optional `providerStatus`. Normalized failure stores only `code`,
  `retryable`, `failedAt`, and `nextRetryAt`; raw provider bodies, exception
  stacks, addresses, message text, and secrets never enter the state record.

- [ ] **Step 1: Write failing lifecycle and intent tests**

  Cover `pending -> sending -> delivered`,
  `pending -> sending -> failed`, and eligible `failed -> sending` retry.
  Reject every other transition, wrong scope, missing/unknown kind/channel,
  unsafe payload values, blank template/recipient reference, stale attempt ID,
  completion from `pending`, retry before `nextRetryAt`, retry after a permanent
  failure, and retry at `maxAttempts`. Require stable errors:
  `DELIVERY_SCOPE_REQUIRED`, `DELIVERY_SCOPE_MISMATCH`,
  `DELIVERY_INTENT_INVALID`, `DELIVERY_INVALID_TRANSITION`,
  `DELIVERY_ATTEMPT_STALE`, `DELIVERY_RETRY_NOT_READY`, and
  `DELIVERY_RETRY_EXHAUSTED`.

- [ ] **Step 2: Run the focused test to verify RED**

  Run:

  ```powershell
  node --test packages/buyna-delivery-state-core/test/delivery-state.test.mjs
  ```

  Expected: FAIL because the package entrypoint does not exist. Record the
  command and failure before creating source files.

- [ ] **Step 3: Implement immutable state, claims, and retry policy**

  `state-machine.mjs` owns only:

  ```text
  pending -> sending -> delivered
                     \-> failed -> sending (only when retry eligible)
  ```

  `claim` and `retry` lock the row inside one transaction, allocate exactly one
  new `attemptId`, increment `attemptCount` once, and persist the stable provider
  request key. The transaction Adapter decides SQL/ORM locking syntax. Freeze
  returned state and never expose the mutable persisted row.

- [ ] **Step 4: Write failing idempotency, concurrency, and receipt tests**

  Add tests for:

  - duplicate enqueue with the same intent returning the first record;
  - duplicate enqueue with changed kind/channel/template/recipient/payload
    failing closed;
  - two workers racing to claim one pending delivery, with one winner;
  - replayed `markDelivered` for the same attempt returning the original result;
  - delivered state never being sent again;
  - repeated `markFailed` not incrementing attempts or moving `nextRetryAt`;
  - recoverable failure delays of 60, 300, 900, and 3600 seconds;
  - permanent failure having `nextRetryAt: null`;
  - provider receipt allowlist rejecting raw response, token, secret, body,
    address, or arbitrary metadata;
  - failure allowlist rejecting raw exception/stack/message content;
  - one stable provider request key across attempts and a new attempt ID per
    explicit retry.

- [ ] **Step 5: Implement dispatch through template/provider Adapters**

  `dispatch` claims first, calls exactly one approved TemplateAdapter, then the
  provider matching the persisted channel. It passes only the immutable intent
  payload and stable request key. On success it normalizes and saves the safe
  receipt. On a project Adapter error shaped
  `{ code: <stable string>, retryable: <boolean> }`, it saves the normalized
  failure and returns the failed state. Unknown thrown values become
  `DELIVERY_PROVIDER_ERROR` with `retryable: false`; the fixed core never logs
  or persists their text. A missing provider/template method fails before any
  state transition with `DELIVERY_TEMPLATE_ADAPTER_REQUIRED` or
  `DELIVERY_PROVIDER_ADAPTER_REQUIRED`.

- [ ] **Step 6: Add provider crash/replay behavior tests**

  Simulate provider acceptance followed by a store failure. On the next
  dispatch, assert the Adapter receives the same `requestKey`; its fake
  idempotency store returns the same receipt and the delivery reaches
  `delivered` without a second external effect. Also assert template rendering
  is project-owned and may differ by locale without changing state semantics.

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
  | notification transition, attempts, retry, idempotency, receipt | recipient lookup, template copy, email/SMS provider, worker schedule, provider credentials |

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
- Modify: `skills/buyai-dashboard-data-interaction/SKILL.md`
- Modify: `skills/buyai-product-merchant-backend/SKILL.md`
- Modify: `skills/buyai-booking-service-backend/SKILL.md`
- Modify: `skills/buyna-frontend-builder/SKILL.md`
- Modify: `skills/buyna-skill-operations/SKILL.md`
- Synchronize: `.agents/skills/buyna-website-builder/**`

**Routing contract:**
- Preserve the existing public
  `planWebsiteRoute({ capabilities, workflowState, requestedSlice,
  releaseIntent = false, mode = 'build', dashboardSlice = null })` signature.
  Do not add a website gate, confirmation, or free-form notification flag.
- Define immutable internal slice sets:

  ```js
  const readModelDashboardSlices = [
    'dashboard', 'inventory', 'orders', 'bookings', 'paid_customers'
  ];
  const deliveryDashboardSlices = [
    'orders', 'bookings', 'customers', 'paid_customers'
  ];
  ```

- An approved Dashboard route selects
  `buyna-commerce-read-model-core` exactly once when its normalized persisted
  `dashboardSlices` intersects `readModelDashboardSlices`.
- It selects `buyna-delivery-state-core` exactly once when its persisted slices
  intersect `deliveryDashboardSlices` and the persisted capabilities contain a
  product domain (`requiresCatalog`/`requiresCart`) or booking domain
  (`requiresBooking`). `orders` is product/order notification work;
  `bookings` is booking/inquiry notification work. `customers` and
  `paid_customers` may reuse delivery records/actions only inside the same
  approved domain slice; they do not create a new marketing system.
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

  - `dashboard`, `inventory`, `orders`, `bookings`, and `paid_customers` select
    read model once;
  - product `orders`, product `customers`, booking `bookings`, booking
    `customers`, and applicable `paid_customers` select delivery once;
  - `dashboard` alone does not select delivery;
  - product `products` and booking `services` do not select read/delivery;
  - static/local preview and checkout-only repair select neither;
  - `dashboardSlice: 'all'` unions dependencies once from the approved persisted
    slice array and retains the existing full-scope approval requirement;
  - unapproved/unknown slices block before adding either module;
  - persisted capabilities remain authoritative and a caller cannot forge a
    product/booking domain to acquire delivery;
  - dependency closure and manifest verification preserve exact-once ordering;
  - every result preserves stable `dashboardSlice`, `dashboardSlices`,
    `continueWithoutConfirmation`, and `externalActions`.

- [ ] **Step 3: Write the failing Skill/Adapter contract test**

  Before editing any Skill/reference, assert:

  - Dashboard Skill links both new Adapter contracts and orders fresh auth,
    merchant context, read/delivery service, then project presentation/provider;
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
  - Builder remains the single entrypoint, routes by persisted slices, and does
    not add a rigid phase or repeat approval inside an authorized work package;
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

  Expected: routing fails because the two package dependencies are absent;
  Skill contract fails because Adapter contracts and guidance are absent. Both
  tests must be red before `route-builder.mjs` or any Skill is edited.

- [ ] **Step 5: Implement deterministic route selection**

  Add the two frozen slice sets near the existing file-capable slice set. Inside
  `routeForGate`'s `dashboard_integration` branch, derive dependencies only from
  the already normalized `dashboardSelection.dashboardSlices` and persisted
  capabilities. Add each module through `addUnique`; update dependency
  validation/closure so an unregistered or missing selected module fails
  closed. Do not change canonical gate readiness, payment architecture,
  Dashboard slice approval, work-package authorization, or external action
  flags.

- [ ] **Step 6: Write exact SQL/ORM/chart and delivery Adapter guidance**

  The read-model reference must provide:

  - one canonical fact per order from scoped SQL/ORM queries;
  - captured/refunded totals sourced from provider-verified settlement records;
  - indexes/query plans and pagination remaining project responsibilities;
  - fixed output passed into a generated ChartAdapter such as
    `toProjectChartSeries({ trends, locale, labels })`, without a chart-library
    import in the fixed package;
  - ordinary merchant sales wording and an explicit prohibition on CRM GMV
    events, keys, labels, or endpoints.

  The delivery reference must provide:

  - exact Store transaction methods from Task 2;
  - a project TemplateAdapter and channel ProviderAdapter;
  - server-side recipient resolution from `recipientRef`;
  - a queue/worker that calls `dispatch`, persists retry timestamps, and resumes
    after process restart;
  - stable provider request-key handling and receipt redaction;
  - no browser authority, frontend provider call, provider secret in a message
    record, or customer payment data in templates.

- [ ] **Step 7: Make minimal Skill guidance changes**

  Dashboard Skill consumes the fixed read/delivery modules only when selected
  by the authoritative route. Product/booking Skills enqueue their approved
  notification intent after the relevant domain transaction and never make
  payment success depend on notification delivery. Frontend Skill consumes
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
  git add skills .agents/skills/buyna-website-builder tests/read-model-delivery-state-routing.test.mjs tests/read-model-delivery-skill-contract.test.mjs
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
    -> scoped ReadFactsAdapter returns one canonical order fact
    -> commerce read model returns gross/refund/net and timezone trend
    -> Dashboard operation moves loading -> ready with stable data
    -> order notification intent enqueued once
    -> TemplateAdapter + EmailAdapter dispatch once
    -> delivered state stores normalized receipt
  ```

  Assert gross `10000`, refund `2000`, net `8000`; one paid order; one refunded
  order; the expected `Asia/Tokyo` day bucket; newest recent-order ordering; and
  low-stock rows from the scoped inventory fixture. Replay the paid/refund
  events, read, enqueue, and dispatch, and assert totals and external delivery
  effects do not duplicate.

- [ ] **Step 2: Add failure/retry and isolation integration cases**

  Use a second notification whose SMS Adapter fails once with a retryable error.
  Advance the injected clock to `nextRetryAt`, retry with a new attempt ID and
  the same provider request key, and assert one final delivered receipt. Then
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
- [ ] Partial/full refunds are cumulative per canonical order fact and never
  double counted.
- [ ] Timezone buckets use IANA zones and local calendar parts, with explicit
  DST and inclusive-start/exclusive-end tests.
- [ ] Merchant read models contain no GMV import, label, CRM endpoint, Outbox,
  credential, or internal event exposure.
- [ ] Delivery intent, state, attempt count, retry time, stable provider request
  key, and safe receipt property names match across module, contracts, Skills,
  and integration tests.
- [ ] Provider acceptance/store-crash replay is tested without promising
  impossible exactly-once I/O from an Adapter that lacks idempotency.
- [ ] Template/provider/recipient errors cannot leak raw PII, message bodies,
  exception stacks, credentials, or provider responses into state.
- [ ] Builder selection uses only persisted capabilities and approved Dashboard
  slices, selects each dependency once, adds no gate, and preserves current
  work-package/repair behavior.
- [ ] Static, file-only, frontend-only, checkout-only, testing, and release
  routes do not acquire unrelated read/delivery modules.
- [ ] SQL/ORM, charts, templates, email/SMS, worker schedules, APIs, UI/UX, and
  CSS remain project-generated Adapters/presentation.
- [ ] Every Skill edit follows a failing executable contract test and the
  canonical Builder copy remains synchronized.
- [ ] Full verification propagates every package/root failure and performs no
  live mutation.
