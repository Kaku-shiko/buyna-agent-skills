# Buyna Fixed State Logic Design

## Goal

Move reusable storefront and merchant-backend state behavior into tested fixed
modules while keeping every merchant's visual design project-specific. Update
the website-building Skills so a teammate can start from one clear entrypoint,
reuse the modules automatically, and finish an applicable website flow without
repeated confirmation loops.

## Scope

This design covers reusable code and repository guidance. It does not deploy a
merchant site, change AWS resources, alter a live database, or change a live
payment path.

MEDINANCE is a behavior reference only. No merchant name, domain, price,
credential, color, font, layout, or CSS is copied into a shared module.

## Chosen Approach

Use several deep domain modules with narrow Adapter seams.

- Fixed modules own states, valid transitions, validation, idempotency, and
  deterministic effects.
- Project Adapters own PostgreSQL/ORM calls, GlobePay transport, S3 transport,
  routing, and framework bindings.
- Project configuration owns fields, labels, locale, pricing policy, theme, and
  optional capabilities.

Rejected alternatives:

1. One universal state machine: it would couple unrelated domains and make
   small changes risky.
2. Copy MEDINANCE code into every merchant: it would preserve drift and repeat
   payment, coupon, and Dashboard bugs.
3. Skill-only generation: prose cannot guarantee legal transitions,
   idempotency, or exact-once effects.

## Global Invariants

1. Shared modules never bundle merchant UI styling.
2. Every merchant operation receives server-owned `projectId` and `sellerId`.
3. Browser return values never establish payment success.
4. Paid state requires a trusted provider result with exact order, amount, and
   currency reconciliation.
5. Inventory, coupon, paid-customer, GMV Outbox, and cart-clear effects are
   idempotent and tied to verified settlement.
6. Invalid state transitions fail with stable error codes.
7. Fixed modules never read secrets and never select payment credentials from
   browser input.
8. Skill routing uses capabilities and dependency readiness, not a rigid list
   that calls every Skill.
9. Design approval, production release/traffic switching, paid activation,
   cost, destructive changes, and scope expansion remain explicit approvals.
10. An approved bounded implementation package may continue through its ready
    code and minimum-test slices without repeated confirmation.

## Batch 1: Checkout And Trusted Settlement

### `buyna-checkout-flow-core`

Own the pre-provider checkout lifecycle:

```text
draft -> minimum_valid -> review -> submitting -> order_locked -> redirecting
                                              \-> failed
```

The module validates the configured minimum customer fields, requires one
approved payment method, prevents duplicate submission, creates the checkout
snapshot, and locks a local `pending_payment` order before returning a provider
request. It does not render a form or call GlobePay.

### Deepen `buyna-commerce-settlement-core`

Own the provider-confirmed lifecycle:

```text
pending_payment -> paid | failed | expired | cancelled
paid -> partially_refunded | refunded
partially_refunded -> partially_refunded | refunded
```

The provider Adapter returns a normalized trusted event. The module validates
scope, order identity, transition legality, amount, currency, refund totals,
and event idempotency before applying one transaction.

Paid effects are applied once: payment record, order state, inventory commit,
coupon redemption, paid-customer snapshot, GMV Outbox, and cart-clear marker.
Refund effects update cumulative refund amount, coupon policy if configured,
and GMV refund Outbox without exceeding the paid amount.

## Batch 2: Merchant Commerce Lifecycle

### `buyna-inventory-core`

```text
available -> reserved -> committed
                    \-> released
available/reserved -> insufficient
```

The module owns quantity validation, reservation identity, exact-once commit,
release, and oversell rejection. A project Adapter persists inventory rows.

### `buyna-coupon-core`

```text
draft -> active -> paused | expired | archived
active -> reserved -> redeemed | released
```

It owns code normalization, percent/fixed discounts, quantity/amount
eligibility, maximum discount, usage limits, order snapshots, reservation,
redemption, and release. The resulting order total is the amount sent to the
payment provider.

### Deepen `buyna-merchant-catalog-core`

Keep `draft`, `active`, and `archived` product/category/SKU states. Add explicit
transition guards, restore behavior, configurable featured limits, atomic
ordering, and stable errors. Project Adapters map multilingual fields and
database columns.

### Deepen `buyna-merchant-dashboard-core`

Add framework-neutral page-operation states:

```text
idle -> loading -> ready | empty | error | forbidden
ready -> editing -> saving -> saved | validation_error | error
```

The module owns state behavior only. Headless markup exposes semantic data
attributes; merchant projects generate all CSS and presentation components.

## Batch 3: Supporting Interaction State

### Deepen `buyna-merchant-file-core`

Add an upload queue around the existing confirmed/replaced/deleted lifecycle:

```text
selected -> validating -> uploading -> confirming -> ready
                  \-> failed <---------------------/
ready -> removing -> removed | failed
```

The queue owns retry eligibility, progress normalization, ordering, cover
selection, and cancellation. S3 and metadata remain Adapters.

### `buyna-auth-session-core`

```text
anonymous -> authenticating -> authenticated
authenticated -> expired | forbidden | logging_out -> anonymous
```

It owns session-state interpretation and stable 401/403 behavior. Password
verification, cookies, and framework middleware remain project Adapters.

### `buyna-merchant-context-core`

Resolve a server-observed host and authenticated identity into one immutable
merchant context. Reject inactive merchants, caller-provided ownership, and
scope mismatches. Database lookup and framework request objects remain
Adapters.

### Storefront gallery behavior

Add a small fixed interaction module only if it remains independent from
visual markup: closed/open, current index, previous/next, Escape close, focus
return, and reduced-motion preference. Do not create a shared gallery theme.

## Batch 4: Read Models And Delivery State

### `buyna-commerce-read-model-core`

Define stable metrics for pending, paid, refunded, gross, refund, net,
low-stock, recent orders, and timezone-aware trends. SQL/ORM queries are
Adapters and Dashboard charts are project presentation.

### `buyna-delivery-state-core`

Own `pending -> sending -> delivered | failed`, attempt count, retry
eligibility, and provider receipt for inquiry, order, and booking notifications.
Email/SMS providers and message templates remain Adapters.

## Skill And Team Routing

`buyna-website-builder` remains the single team entrypoint. It will:

1. Default to team-facing language.
2. Determine capabilities from the approved brief.
3. Route only applicable slices.
4. Check the manifest for required fixed modules before generation.
5. Generate only project Adapters, configuration, presentation, and missing
   project code.
6. Ask once for an approved bounded implementation package.
7. Continue across ready included code slices and minimum tests.
8. Stop only for a real blocker or one of the explicit approval categories.

The following Skills receive direct module guidance:

- `buyai-checkout-address-ux`: checkout-flow state and minimum-field policy.
- `buyai-globepay-payment` and status sync: trusted settlement state.
- `buyai-product-merchant-backend`: catalog, inventory, coupon, order, and
  merchant-context state.
- `buyai-dashboard-data-interaction`: Dashboard operation state, read models,
  file queue, and auth state.
- `buyna-frontend-builder`: headless behavior plus project-generated design.
- `buyna-skill-operations`: installation, discovery, update, and module checks.

Repository docs and `agents/openai.yaml` prompts will use one consistent start
instruction and will not require Git operations during website preview or
development.

## Verification

Every code batch must show red-green-refactor evidence and pass:

- package unit tests for legal/illegal transitions;
- idempotency and duplicate-event tests;
- project/seller scope tests;
- repository manifest validation;
- Skill structure validation;
- routing scenarios for static, product, booking, and payment-capable sites;
- no-CSS/no-merchant-name checks for shared packages.

The final merged tree must pass every package test and repository validation
from a clean worktree before it is pushed to GitHub `main`.
