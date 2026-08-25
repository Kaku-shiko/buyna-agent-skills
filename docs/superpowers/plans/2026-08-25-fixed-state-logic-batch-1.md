# Fixed State Logic Batch 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver reusable checkout and trusted-settlement state modules, then route the relevant Buyna Skills to those modules.

**Architecture:** Add a pure checkout state module before provider payment and deepen the existing settlement module after provider verification. Provider, database, cart, coupon, inventory, customer, and GMV persistence stay behind project Adapters; all visual design stays inside merchant projects.

**Tech Stack:** Node.js ES modules, `node:test`, JSON repository manifest, Markdown Codex Skills, PowerShell repository validation.

**Spec:** `docs/superpowers/specs/2026-08-25-fixed-state-logic-design.md`

## Global Constraints

- No merchant name, domain, price, credential, theme, CSS, or production identifier in shared code.
- Every business call uses server-owned `projectId` and `sellerId`.
- No paid state may be accepted from browser return data.
- Exact amount and currency reconciliation precedes paid effects.
- A claimed provider event applies effects at most once.
- Skill edits require a failing repository behavior test before the edit.
- This batch performs no AWS, live database, DNS, or production payment mutation.

---

### Task 1: Checkout Flow Core

**Files:**
- Create: `packages/buyna-checkout-flow-core/package.json`
- Create: `packages/buyna-checkout-flow-core/src/index.mjs`
- Create: `packages/buyna-checkout-flow-core/test/checkout-flow.test.mjs`

**Interfaces:**
- Consumes: `createCheckoutFlow({ projectId, sellerId, cart, orders, submissions, policy? })`.
- Produces: `validateDraft(input)`, `createReview(input)`, `submit(input)`, and immutable `CHECKOUT_STATES`.

- [ ] **Step 1: Write a failing minimum-fields test**

Test that configured minimum fields are required, optional fields may stay empty,
card-number/CVV/token fields are rejected, and one configured payment method is
required. The expected stable errors are `CHECKOUT_MINIMUM_FIELDS_MISSING`,
`CHECKOUT_SENSITIVE_FIELD`, and `CHECKOUT_PAYMENT_METHOD_REQUIRED`.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test packages/buyna-checkout-flow-core/test/checkout-flow.test.mjs`

Expected: failure because the source module does not exist.

- [ ] **Step 3: Implement draft and review states**

Implement `draft`, `minimum_valid`, `review`, `submitting`, `order_locked`,
`redirecting`, and `failed`. Normalize configured minimum fields and payment
methods. Return serializable records without rendering or styling.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node --test packages/buyna-checkout-flow-core/test/checkout-flow.test.mjs`

Expected: the minimum-field test passes.

- [ ] **Step 5: Write failing idempotent-submit tests**

Test that `submit` revalidates the cart, creates one immutable checkout
snapshot, creates one local `pending_payment` order, stores one result per
idempotency key, and never calls a payment provider.

- [ ] **Step 6: Run the new tests and verify RED**

Expected: failure because submit/order locking is not implemented.

- [ ] **Step 7: Implement submit and order locking**

Require `cart.createCheckoutSnapshot`, `orders.createPendingOrder`,
`submissions.claim`, and `submissions.saveResult`. Return `order_locked` with
the order identity and provider-request inputs only.

- [ ] **Step 8: Verify and commit**

Run: `npm test --prefix packages/buyna-checkout-flow-core`

Expected: all checkout-flow tests pass.

Commit: `feat: add fixed checkout flow state core`

### Task 2: Trusted Settlement Core

**Files:**
- Modify: `packages/buyna-commerce-settlement-core/src/index.mjs`
- Modify: `packages/buyna-commerce-settlement-core/test/settlement.test.mjs`
- Modify: `packages/buyna-commerce-settlement-core/package.json`

**Interfaces:**
- Consumes: normalized provider events containing trust, event ID, provider,
  order ID, project/seller IDs, status, amount, currency, and refund amount.
- Produces: `createSettlementModule({ provider, store, capabilities? })` plus
  immutable status and transition contracts.

- [ ] **Step 1: Write failing transition and reconciliation tests**

Cover pending-to-paid/failed/expired/cancelled, paid-to-partial/full refund,
invalid paid-to-failed, scope mismatch, order mismatch, amount/currency
mismatch, and cumulative refund above the paid amount.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test --prefix packages/buyna-commerce-settlement-core`

Expected: failures for missing transition and reconciliation behavior.

- [ ] **Step 3: Implement normalized transitions**

Validate provider trust, event identity, server-owned scope, order state,
amount, currency, and cumulative refund. Export stable status/transition
constants and reject browser-source events.

- [ ] **Step 4: Run tests and verify GREEN**

Expected: all transition/reconciliation tests pass.

- [ ] **Step 5: Write failing exact-once effect tests**

Test one transaction applying payment, order, inventory, coupon,
paid-customer, GMV Outbox, and cart-clear marker once. Refund tests must append
only the new refund delta and never repeat paid effects.

- [ ] **Step 6: Run tests and verify RED**

Expected: failures for coupon/cart/refund-delta effects.

- [ ] **Step 7: Implement deep settlement effects**

Use explicit capability flags for optional coupon/cart effects. Return only a
sanitized settlement result.

- [ ] **Step 8: Verify and commit**

Run: `npm test --prefix packages/buyna-commerce-settlement-core`

Expected: all settlement tests pass.

Commit: `feat: deepen trusted commerce settlement state`

### Task 3: Repository Module Contract

**Files:**
- Create: `tests/commerce-state-modules.test.mjs`
- Modify: `repository-manifest.json`
- Modify: `README.md`
- Modify: `docs/OPERATIONS_MANUAL.md`

**Interfaces:**
- Consumes: `buyna-checkout-flow-core` and `buyna-commerce-settlement-core`.
- Produces: installable module inventory and concise team-facing guidance.

- [ ] **Step 1: Write a failing repository contract test**

Require both modules in the website-builder profile. Reject CSS files and
merchant-specific identifiers in shared state modules. Require documentation
to distinguish fixed behavior from project-generated presentation.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/commerce-state-modules.test.mjs`

Expected: failure because checkout-flow core is not registered.

- [ ] **Step 3: Update manifest and documentation**

Register the module. Explain that checkout/settlement state is fixed while
form presentation and provider/database Adapters are generated per project.
Replace documentation that requires confirmation after every node with the
approved bounded-work-package rule.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node --test tests/commerce-state-modules.test.mjs
powershell -ExecutionPolicy Bypass -File .\scripts\validate.ps1
```

Expected: both commands exit zero.

Commit: `docs: register fixed commerce state modules`

### Task 4: Website Builder And Domain Skill Routing

**Files:**
- Create: `tests/website-builder-state-routing.test.mjs`
- Modify: `skills/buyna-website-builder/SKILL.md`
- Modify: `skills/buyna-website-builder/agents/openai.yaml`
- Modify: `skills/buyna-website-builder/references/routing-map.md`
- Modify: `skills/buyna-website-builder/references/phase-06-payment.md`
- Modify: `skills/buyai-checkout-address-ux/SKILL.md`
- Modify: `skills/buyai-product-merchant-backend/SKILL.md`
- Modify: `skills/buyai-globepay-payment/SKILL.md`
- Modify: `skills/buyai-globepay-status-sync/SKILL.md`
- Modify: `skills/buyna-skill-operations/SKILL.md`
- Synchronize: `.agents/skills/buyna-website-builder/**`

**Interfaces:**
- Consumes: manifest, capabilities, approved work-package state, checkout-flow
  core, and settlement core.
- Produces: one discoverable entrypoint that chooses the minimum applicable
  route and generates only project Adapters/configuration/presentation.

- [ ] **Step 1: Record baseline scenario results**

Evaluate static, product-without-payment, product-with-GlobePay, and
checkout-repair requests. Record unnecessary routes, repeated confirmation,
fixed-logic regeneration, and unrequested Git/AWS actions.

- [ ] **Step 2: Write failing routing tests**

Require concrete Skill triggers, manifest lookup before generation,
checkout/settlement routing for payment-capable commerce, commerce skipping
for static sites, and no GitHub requirement for project preview.

- [ ] **Step 3: Run tests and verify RED**

Run: `node --test tests/website-builder-state-routing.test.mjs`

Expected: failures for missing routing contracts.

- [ ] **Step 4: Make minimal Skill edits**

Use a positive recipe: determine capabilities, load applicable references,
verify fixed modules, generate project Adapters/presentation, run minimum
tests, and continue inside the approved work package. Stop only for blockers,
scope change, cost, destructive work, paid activation, and production release
or traffic switching.

- [ ] **Step 5: Synchronize the canonical Builder copy**

Copy the verified canonical Builder files to `.agents/skills/buyna-website-builder`
so repository hash validation succeeds.

- [ ] **Step 6: Repeat scenarios and verify GREEN**

Every scenario must choose the minimum route, name the fixed modules, avoid
visual hard-coding, avoid unrequested Git/AWS work, and avoid repeated
confirmation inside the approved package.

- [ ] **Step 7: Validate and commit**

Run the routing test, `scripts/validate.ps1`, and the official Skill validator
for each modified Skill.

Expected: zero failures.

Commit: `feat: route website builds through fixed commerce states`

### Task 5: Batch 1 Full Verification

**Files:**
- Verify the complete branch; change code only through a new red-green cycle if
  verification exposes a defect.

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: a reviewed Batch 1 candidate and the Batch 2 plan.

- [ ] **Step 1: Run every package and root test**

Execute every `packages/*/package.json` test script plus all root tests.

Expected: zero failures and zero cancelled tests.

- [ ] **Step 2: Run repository and Skill validation**

Run `scripts/validate.ps1` and official validation for modified Skills.

Expected: zero validation failures.

- [ ] **Step 3: Inspect scope and secrets**

Confirm the diff contains no CSS, merchant-specific configuration, credential,
AWS mutation, live database change, or live payment-path change.

- [ ] **Step 4: Commit verification repairs if required**

Commit: `test: verify fixed commerce state batch`

- [ ] **Step 5: Write Batch 2 plan**

Create the TDD plan for inventory, coupon, catalog, and Dashboard operation
state from the approved spec. Do not implement Batch 2 inside Task 5.
