# Fixed State Logic Batch 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`
> to implement this plan task-by-task. Use strict red-green-refactor for every
> behavior change.

**Goal:** Add fixed inventory and coupon lifecycles, deepen catalog and
Dashboard operation state, and route commerce projects to those modules while
leaving every merchant's UI design and infrastructure Adapter project-owned.

**Architecture:** Four framework-neutral domain modules own legal states,
transitions, validation, idempotency, and deterministic effects. Project
Adapters own PostgreSQL/ORM persistence, API/framework wiring, authentication,
and provider transport. Project components and styles own the complete visual
presentation.

**Tech Stack:** Node.js ES modules, `node:test`, JSON repository manifest,
Markdown Codex Skills, PowerShell repository validation.

**Spec:** `docs/superpowers/specs/2026-08-25-fixed-state-logic-design.md`

## Global Constraints

- Never copy a merchant name, domain, theme, CSS, price, credential, AWS
  identifier, or production configuration into a shared module.
- Every Adapter call carries server-owned `projectId` and `sellerId`.
- Inventory and coupon changes use stable reservation/event identities and are
  exact-once under retry.
- Product/SKU price, discount, and stock are recomputed server-side before the
  checkout snapshot is locked.
- Shared Dashboard code exports state/data contracts only; generated project
  code owns markup composition, labels/localization, components, and styles.
- Skill edits require a failing repository behavior test before prose changes.
- This batch performs no AWS, live database, DNS, deployment, or live payment
  mutation.

## Dependency Order

```text
inventory core ----\
                    +--> catalog/checkout project Adapters --> settlement Adapters
coupon core --------/

catalog core -------------------------------> Dashboard/API project Adapters
Dashboard operation state ------------------> generated merchant presentation
```

Tasks 1-4 are independent fixed-module producers. Task 5 registers them. Task
6 consumes all four through Skill routing. Task 7 verifies the complete batch.

---

### Task 1: Inventory Reservation Core

**Files:**
- Create: `packages/buyna-inventory-core/package.json`
- Create: `packages/buyna-inventory-core/src/index.mjs`
- Create: `packages/buyna-inventory-core/test/inventory.test.mjs`

**Interface:**
- Consume: `createInventoryModule({ projectId, sellerId, store, clock? })`.
- Expose: `reserve(input)`, `commit(input)`, `release(input)`, immutable
  `INVENTORY_STATES`, and immutable `INVENTORY_TRANSITIONS`.
- Store Adapter: `transaction(work)`; transaction scope supplies
  `getStockForUpdate`, `claimReservationEvent`, `createReservation`,
  `commitReservation`, and `releaseReservation`.

- [ ] **Step 1: Write failing validation and transition tests**

  Cover positive integer quantities, required product/SKU identity, required
  server scope, `available -> reserved -> committed`,
  `reserved -> released`, and rejection of commit/release from illegal states.
  Require stable errors such as `INVENTORY_INVALID_QUANTITY`,
  `INVENTORY_INSUFFICIENT`, `INVENTORY_SCOPE_MISMATCH`, and
  `INVENTORY_INVALID_TRANSITION`.

- [ ] **Step 2: Verify RED**

  Run: `node --test packages/buyna-inventory-core/test/inventory.test.mjs`

  Expected: failure because the package does not exist.

- [ ] **Step 3: Implement the minimum state machine**

  Lock authoritative stock inside one Adapter transaction, subtract existing
  active reservations, and return serializable state records. Do not add SQL,
  ORM models, routes, UI, or warehouse policy.

- [ ] **Step 4: Write failing exact-once and concurrency tests**

  Cover duplicate reservation/event IDs, two concurrent reservations for the
  last unit, commit once, release once, and release-after-commit rejection.

- [ ] **Step 5: Implement idempotent reservation effects**

  Claim event/reservation identity before mutation and require the Store
  Adapter to keep the locked stock read and write in the same transaction.

- [ ] **Step 6: Verify and commit**

  Run: `npm test --prefix packages/buyna-inventory-core`

  Commit: `feat: add fixed inventory reservation state`

### Task 2: Coupon Lifecycle Core

**Files:**
- Create: `packages/buyna-coupon-core/package.json`
- Create: `packages/buyna-coupon-core/src/index.mjs`
- Create: `packages/buyna-coupon-core/test/coupon.test.mjs`

**Interface:**
- Consume: `createCouponModule({ projectId, sellerId, store, clock? })`.
- Expose management operations `createDraft`, `activate`, `pause`, `archive`;
  checkout operations `quote`, `reserve`, `redeem`, `release`; immutable
  `COUPON_STATES` and `COUPON_TRANSITIONS`.
- Store Adapter: `transaction(work)`; transaction scope supplies
  `getCouponForUpdate`, `claimCouponEvent`, `createCoupon`,
  `createReservation`, `redeemReservation`, and `releaseReservation`.

- [ ] **Step 1: Write failing discount and eligibility tests**

  Cover normalized codes; percentage and fixed discounts; minimum item
  quantity; minimum order amount; optional maximum discount; JPY-safe integer
  math; validity windows; total/per-customer usage limits; and final totals
  that never become negative. Stable failures include
  `COUPON_NOT_ELIGIBLE`, `COUPON_EXPIRED`, `COUPON_USAGE_LIMIT`, and
  `COUPON_INVALID_MONEY`.

- [ ] **Step 2: Verify RED**

  Run: `node --test packages/buyna-coupon-core/test/coupon.test.mjs`

  Expected: failure because the package does not exist.

- [ ] **Step 3: Implement deterministic quote and management states**

  Own `draft -> active -> paused | expired | archived`. Return an immutable
  coupon/order discount snapshot containing policy version, original amount,
  discount amount, and payable amount. Do not render the coupon field or
  decide merchant-facing copy.

- [ ] **Step 4: Write failing reservation/idempotency tests**

  Cover `active -> reserved -> redeemed | released`, duplicate submit/provider
  events, competing last-use reservations, scope mismatch, and release after a
  failed/expired checkout. Assert that the settlement coupon Adapter can call
  redeem exactly once using the locked order snapshot.

- [ ] **Step 5: Implement transaction-safe reservation state**

  Lock and claim inside one transaction. The payable amount emitted by this
  module is the exact amount stored in the checkout snapshot and later
  reconciled by the settlement core.

- [ ] **Step 6: Verify and commit**

  Run: `npm test --prefix packages/buyna-coupon-core`

  Commit: `feat: add fixed coupon lifecycle state`

### Task 3: Deepen Merchant Catalog State

**Files:**
- Modify: `packages/buyna-merchant-catalog-core/src/catalog-core.mjs`
- Modify: `packages/buyna-merchant-catalog-core/test/catalog-core.test.mjs`
- Modify: `packages/buyna-merchant-catalog-core/package.json`

**Interface additions:**
- Export immutable `CATALOG_STATES` and `CATALOG_TRANSITIONS`.
- Add guarded `transitionProduct`, `restoreProduct`, `transitionCategory`,
  `restoreCategory`, `transitionVariant`, and configurable
  `setFeaturedProducts`.
- Preserve existing create/update/list/reorder calls for compatibility.

- [ ] **Step 1: Write failing lifecycle tests**

  Cover `draft -> active -> archived`, permitted restoration to `draft`,
  invalid transition rejection, active-product sellable price validation,
  category/SKU guards, and stable errors. Reject direct caller writes to
  `deleted_at` or unrestricted status values.

- [ ] **Step 2: Verify RED**

  Run: `npm test --prefix packages/buyna-merchant-catalog-core`

  Expected: new lifecycle tests fail against the current permissive service.

- [ ] **Step 3: Implement transition guards and restoration**

  Keep all persistence behind the existing scoped `dataCore` repositories.
  Record archived/restored timestamps through the injected clock and preserve
  existing public interfaces where their behavior remains valid.

- [ ] **Step 4: Write failing featured-limit and ordering tests**

  Cover configurable featured limits, duplicates, unknown/mixed-scope IDs,
  atomic featured updates, atomic product/category ordering, and rollback on
  one failed update.

- [ ] **Step 5: Implement transactional featured and order operations**

  Require Adapter read/lock support where ownership or existence must be
  confirmed. Do not generate multilingual database columns or UI sorting
  controls; those remain project mappings and presentation.

- [ ] **Step 6: Verify and commit**

  Run: `npm test --prefix packages/buyna-merchant-catalog-core`

  Commit: `feat: deepen fixed merchant catalog state`

### Task 4: Dashboard Page Operation State

**Files:**
- Create: `packages/buyna-merchant-dashboard-core/src/operation-state.mjs`
- Modify: `packages/buyna-merchant-dashboard-core/src/index.mjs`
- Modify: `packages/buyna-merchant-dashboard-core/test/dashboard-core.test.mjs`
- Modify: `packages/buyna-merchant-dashboard-core/package.json`

**Interface:**
- Export immutable `DASHBOARD_OPERATION_STATES` and
  `DASHBOARD_OPERATION_TRANSITIONS`.
- Expose `createDashboardOperation(initial?)` with `transition(event, data?)`,
  `snapshot()`, and request identity for stale-response rejection.
- Expose semantic attributes through data only, such as `dataState`,
  `dataStatus`, and `ariaBusy`; never emit CSS or a fixed component tree.

- [ ] **Step 1: Write failing page-read state tests**

  Cover `idle -> loading -> ready | empty | error | forbidden`, illegal
  transitions, stable error codes, and stale-response rejection when an older
  request finishes after a newer one.

- [ ] **Step 2: Verify RED**

  Run: `npm test --prefix packages/buyna-merchant-dashboard-core`

  Expected: failures because operation state does not exist.

- [ ] **Step 3: Implement read operation state**

  Keep serializable state and semantic attributes only. The project chooses
  skeletons, cards, tables, dialogs, animations, colors, and layout.

- [ ] **Step 4: Write failing edit/save state tests**

  Cover `ready -> editing -> saving -> saved | validation_error | error`,
  duplicate-save suppression, cancellation back to the last ready snapshot,
  permission denial, and retry after recoverable error.

- [ ] **Step 5: Implement edit/save state and compatibility mapping**

  Preserve `createTableView` behavior while mapping its output into the new
  operation-state vocabulary. Do not alter navigation labels or project theme
  contracts in this task.

- [ ] **Step 6: Verify and commit**

  Run: `npm test --prefix packages/buyna-merchant-dashboard-core`

  Commit: `feat: add fixed dashboard operation state`

### Task 5: Repository Module Contract

**Files:**
- Create: `tests/merchant-commerce-lifecycle-modules.test.mjs`
- Modify: `repository-manifest.json`
- Modify: `README.md`
- Modify: `docs/OPERATIONS_MANUAL.md`
- Modify: `tests/fixtures/shared-module-boundaries.json`

**Interface:**
- Register `buyna-inventory-core` and `buyna-coupon-core` in the repository and
  `website-builder` profile.
- Preserve catalog and Dashboard packages as fixed behavior modules.
- Keep the complete installer manifest-driven; do not introduce another
  profile-selection CLI in this batch.

- [ ] **Step 1: Write a failing manifest and boundary test**

  Require all four Batch 2 modules in the website-builder profile. Reject
  stylesheets, merchant identifiers, credentials, provider transport, SQL/ORM
  implementation, and AWS mutation from their shared source trees. Require
  docs to distinguish fixed state logic from generated project UI/Adapters.

- [ ] **Step 2: Verify RED**

  Run: `node --test tests/merchant-commerce-lifecycle-modules.test.mjs`

  Expected: failure because inventory/coupon packages are not registered.

- [ ] **Step 3: Update manifest, policy fixture, and concise docs**

  Document the invocation order and Adapter ownership without duplicating
  module API reference text across README, Operations Manual, and Skills.

- [ ] **Step 4: Verify and commit**

  Run:

  ```powershell
  node --test tests/merchant-commerce-lifecycle-modules.test.mjs
  powershell -ExecutionPolicy Bypass -File .\scripts\validate.ps1
  ```

  Commit: `docs: register merchant commerce lifecycle modules`

### Task 6: Skill Routing And Generated-UI Boundary

**Files:**
- Create: `skills/buyai-coupon-commerce/SKILL.md`
- Create: `skills/buyai-coupon-commerce/agents/openai.yaml`
- Create: `skills/buyai-coupon-commerce/references/coupon-adapter-contract.md`
- Create: `tests/merchant-commerce-lifecycle-routing.test.mjs`
- Modify: `skills/buyna-website-builder/references/routing-map.md`
- Modify: `skills/buyna-website-builder/scripts/route-builder.mjs`
- Modify: `skills/buyai-product-merchant-backend/SKILL.md`
- Modify: `skills/buyai-product-merchant-backend/references/merchant-catalog-fixed-core.md`
- Modify: `skills/buyai-dashboard-data-interaction/SKILL.md`
- Modify: `skills/buyna-frontend-builder/SKILL.md`
- Modify: `skills/buyna-frontend-builder/references/merchant-dashboard-functional-core.md`
- Modify: `skills/buyna-skill-operations/SKILL.md`
- Synchronize: `.agents/skills/buyna-website-builder/**`

**Routing contract:**
- Product stock/SKU capability selects inventory core.
- Coupon capability selects coupon core; its absence skips the module without
  skipping checkout.
- Product/category management selects catalog core.
- Every interactive Dashboard page selects Dashboard operation state.
- Project generation produces only persistence/API Adapters, configuration,
  localized copy, components, and project-owned styles.

- [ ] **Step 1: Record fresh-context baseline scenarios**

  Evaluate product-with-stock, product-with-coupon, product-without-coupon,
  Dashboard page repair, and static-site requests. Record regenerated state
  logic, missing module routes, unnecessary confirmations, and accidental UI
  standardization.

- [ ] **Step 2: Write failing executable routing tests**

  Exercise `route-builder.mjs`, not prose-only regex checks. Assert each
  capability selects the minimum modules and Skills exactly once, skips
  unrelated commerce for static sites, inherits bounded-work-package
  authorization, and never adds Git/AWS/deployment intent to local work.

- [ ] **Step 3: Verify RED**

  Run: `node --test tests/merchant-commerce-lifecycle-routing.test.mjs`

  Expected: missing inventory/coupon/operation-state selections fail.

- [ ] **Step 4: Implement deterministic routes and minimal Skill guidance**

  Add manifest verification and module names to route output. Make the coupon
  Skill the single coupon entrypoint. Remove duplicated business algorithms
  from Skills and point to module/Adapter contracts instead. Child Skills must
  inherit authorization and must not reopen approved design or repeat the same
  confirmation.

- [ ] **Step 5: Enforce the visual boundary**

  Skill guidance must state that fixed drawer/table/dialog/page-operation
  behavior may be imported, but colors, fonts, spacing, shell, components,
  page composition, transitions, and responsive visual treatment are generated
  from the approved project design. No shared default Dashboard skin.

- [ ] **Step 6: Synchronize canonical Builder and validate**

  Copy only the verified Builder files to `.agents/skills/buyna-website-builder`
  and run hash validation.

- [ ] **Step 7: Verify and commit**

  Run routing tests, every affected package test, `scripts/validate.ps1`, and
  the official Skill validator for each created/modified Skill.

  Commit: `feat: route merchant commerce lifecycle modules`

### Task 7: Batch 2 Full Verification

**Files:**
- Verify the complete Batch 2 branch; modify behavior only through a new
  red-green cycle if verification exposes a defect.

- [ ] **Step 1: Run every package test script and every root test**

  Expected: zero failures, zero cancelled tests, and no hidden package omitted.

- [ ] **Step 2: Run repository and official Skill validation**

  Expected: manifest/install/hash validation and every affected Skill pass.

- [ ] **Step 3: Inspect the full Batch 2 diff**

  Confirm no CSS/theme, named merchant, credential, provider secret/transport,
  SQL/ORM implementation, AWS mutation, live database change, deployment, or
  live payment-path change entered shared modules or Skills.

- [ ] **Step 4: Run integration contract scenarios**

  Verify coupon payable amount enters the immutable checkout snapshot;
  settlement calls inventory commit and coupon redeem exactly once; failed or
  expired checkout releases reservations; and Dashboard operations reject
  stale responses without defining appearance.

- [ ] **Step 5: Commit verification repairs if required**

  Commit: `test: verify merchant commerce lifecycle batch`

- [ ] **Step 6: Prepare the reviewed Batch 2 candidate**

  Record exact commands, counts, review findings, deferred minors, and the next
  batch boundary. Do not deploy, push, or implement Batch 3 in this task.
