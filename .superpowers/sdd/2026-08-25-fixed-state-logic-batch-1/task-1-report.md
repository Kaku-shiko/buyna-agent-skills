# Task 1: Checkout Flow Core Report

## Scope

Implemented only `@buyna/checkout-flow-core` in the isolated
`fixed-state-logic` worktree. No AWS, live database, payment-provider, DNS, or
production mutations were made.

## TDD evidence

### Cycle 1: draft validation

1. Wrote `draft validation requires configured minimum fields and one approved
   payment method` before the source module existed. It names the protected
   behavior: an accidental removal of configured-field/payment validation or a
   sensitive-input gate would fail the test.
2. RED command:

   ```powershell
   node --test packages/buyna-checkout-flow-core/test/checkout-flow.test.mjs
   ```

   Observed expected RED: `ERR_MODULE_NOT_FOUND` for
   `packages/buyna-checkout-flow-core/src/index.mjs`; 1 test file failed.
3. Implemented the minimum module: immutable state constants, field/payment
   normalization, sensitive card-number/CVV/token rejection, `validateDraft`,
   and `createReview`.
4. GREEN command:

   ```powershell
   node --test packages/buyna-checkout-flow-core/test/checkout-flow.test.mjs
   ```

   Observed GREEN: 1 test passed, 0 failed.

### Cycle 2: idempotent submit and order lock

1. Added `submit locks one pending order and returns one idempotent provider
   request without provider access` before submit behavior existed. It protects
   cart revalidation/snapshot creation, one `pending_payment` order, immutable
   snapshot handoff, saved idempotent result reuse, and the provider-free
   boundary.
2. RED command:

   ```powershell
   node --test packages/buyna-checkout-flow-core/test/checkout-flow.test.mjs
   ```

   Observed expected RED: the new test failed with
   `CHECKOUT_SUBMIT_NOT_IMPLEMENTED`; 1 passed, 1 failed.
3. Implemented `submit`: validates the draft, requires the cart/order/
   submission adapter methods, acquires an idempotency key, creates and deeply
   freezes the checkout snapshot, creates a local pending order, saves one
   sanitized `order_locked` result, and returns the stored result for duplicate
   acquisitions. The returned provider request contains only order ID, payment method,
   amount, and currency.
4. GREEN commands:

   ```powershell
   node --test packages/buyna-checkout-flow-core/test/checkout-flow.test.mjs
   npm test --prefix packages/buyna-checkout-flow-core
   ```

   Observed GREEN for both: 2 tests passed, 0 failed, 0 cancelled, 0 skipped.

## Changed files

- `packages/buyna-checkout-flow-core/package.json`
- `packages/buyna-checkout-flow-core/src/index.mjs`
- `packages/buyna-checkout-flow-core/test/checkout-flow.test.mjs`

Final-review fix commit:
`bd01264849fb2e36ca25c00c07f605d18af11fbc`
(`fix: harden checkout submission state`).

## Final-review round 2 durable review repair

### Durable review and server-owned submission identity

Replaced the process-local review `Map` with the required `reviewState`
Adapter. Its `create`, `get`, and `update` operations are scoped by the
server-owned project/seller IDs and review token. `createReview` generates a
server-owned UUID `submissionId`, persists it atomically with the review, and
does not return it to callers. `submit` takes only the review token for its
identity; any caller-provided idempotency key is ignored. The persisted review
is read by whichever core instance handles submit, including after a process
restart/serverless worker transition.

The production Adapter contract is documented in source: durable `create`
must atomically save the generated submission ID; durable `update` must
atomically save state and sanitized pending results; the submissions Adapter
must atomically lease/replay the bound ID; and the order Adapter must enforce
that same ID as a persistent unique key. Card/CVV/token fields are rejected
before `reviewState.create`, so those raw values never reach durable storage.

RED command after adding the cross-instance regression test:

```powershell
node --test packages/buyna-checkout-flow-core/test/checkout-flow.test.mjs
```

Observed expected RED: the second core could not find the first core's local
review and returned `CHECKOUT_REVIEW_REQUIRED`; 6 passed, 1 failed. After the
durable Adapter implementation and test-fixture migration, it was GREEN: 7
passed, 0 failed. The concurrent cross-instance regression uses one review
token with two distinct attacker-supplied keys; it observed one order and an
atomic `CHECKOUT_SUBMISSION_IN_PROGRESS` conflict, proving caller keys cannot
split the server-bound identity.

### Currency-policy contract and mutation proof

`supportedCurrencies` now defaults to the explicit closed set `['JPY']` and,
when configured, requires a non-empty array of exact uppercase three-letter
codes (`/^[A-Z]{3}$/`). Transport currency is normalized to uppercase then
checked against that set. Configuration and server snapshot values `?`, `123`,
and `USDD` are rejected.

RED command before strict policy validation:

```powershell
node --test packages/buyna-checkout-flow-core/test/checkout-flow.test.mjs
```

Observed expected RED: invalid policy values did not throw; 7 passed, 1
failed. After the validator, the package test was GREEN: 8 passed, 0 failed.

Mutation command after temporarily disabling the strict currency regex:

```powershell
node --test --test-name-pattern "currency policy" packages/buyna-checkout-flow-core/test/checkout-flow.test.mjs
```

Observed mutation RED: `AssertionError: Missing expected exception`; 0 passed,
1 failed, 7 skipped. Restoring the validator produced GREEN: 1 passed, 0
failed, 7 skipped.

### Round-2 verification

```powershell
npm test --prefix packages/buyna-checkout-flow-core
$testFiles = Get-ChildItem tests -Filter '*.test.mjs' | ForEach-Object FullName; node --test $testFiles
powershell -ExecutionPolicy Bypass -File .\scripts\validate.ps1
git diff --check
```

Results: checkout 8 passed/0 failed; root 21 passed/0 failed; repository
validation passed; diff check was clean. No UI, AWS, database, provider
transport, or live-system action occurred.

Round-2 commit: `3dcd75da743547b2a7b7d3307603d807a6135af8`
(`fix: persist checkout review identity`).

## Final-review lifecycle handoff repair

Added `beginRedirect({reviewToken})`, the only executable handoff from
`order_locked` to `redirecting`. It reloads the durable scoped review, requires
the locked state and the persisted safe order/provider-request result, then
uses a compare-and-set durable update. Caller-supplied state and provider
request values are neither accepted nor used. The method returns only the
server-owned order identity and provider-request inputs; it does not call a
provider or render UI.

RED command after adding the lifecycle test:

```powershell
node --test packages/buyna-checkout-flow-core/test/checkout-flow.test.mjs
```

Observed expected RED: `second.beginRedirect is not a function`; 8 passed, 1
failed. After the minimum durable handoff implementation, the same test command
was GREEN: 9 passed, 0 failed. The test proves an unlocked review is rejected
with `CHECKOUT_REDIRECT_NOT_ALLOWED`, a second core can hand off the locked
durable review, and malicious caller state/request values are ignored.

Final verification:

```powershell
npm test --prefix packages/buyna-checkout-flow-core
$testFiles = Get-ChildItem tests -Filter '*.test.mjs' | ForEach-Object FullName; node --test $testFiles
powershell -ExecutionPolicy Bypass -File .\scripts\validate.ps1
git diff --check
```

Results: checkout 9 passed/0 failed; root 21 passed/0 failed; repository
validation and diff check passed.

## Self-review

- `CHECKOUT_STATES` is frozen and exposes all specified lifecycle values.
- Server-owned `projectId` and `sellerId` are required when the flow is built
  and forwarded to every adapter operation.
- The module has no rendering, styling, merchant-specific data, credentials, or
  payment-provider adapter/API.
- Historical note: this original in-process claim description is superseded by
  the durable final contract below.
- `git diff --check` completed without whitespace errors.

## Concerns

Final contract: `reviewState.create/get/update` durably persists the server
generated review and `submissionId`; `submissions.acquire/complete/release`
atomically leases, completes, replays, or releases that bound identity; and
the order Adapter enforces the same ID as a persistent unique key. This
persistence guarantee intentionally remains outside the pure flow module.

## Round 1/5: sensitive customer-field mutation proof

Changed `packages/buyna-checkout-flow-core/test/checkout-flow.test.mjs` only.
The draft-validation test now table-drives `card_number`, `cvv`, and `token` as
customer-field keys while keeping the configured required fields complete and
using the approved `wechat` payment method. Each case requires
`CHECKOUT_SENSITIVE_FIELD`, so the test exercises the public field-normalizing
behavior rather than payment-method validation.

Temporarily mutated `normalizeFields` to disable its sensitive-field rejection,
then ran:

```powershell
node --test packages/buyna-checkout-flow-core/test/checkout-flow.test.mjs
```

Observed expected mutation RED: the draft-validation subtest failed with
`AssertionError: Missing expected exception.` at the new field table; summary
was 1 passed, 1 failed. Restored the original sensitive-field rejection and
ran:

```powershell
node --test packages/buyna-checkout-flow-core/test/checkout-flow.test.mjs
npm test --prefix packages/buyna-checkout-flow-core
```

Observed restored GREEN for both commands: 2 passed, 0 failed, 0 cancelled,
and 0 skipped. `git diff --check` also completed without whitespace errors.

Committed the round-1 test-only fix as
`e3710c8545dc2e7d2ba5c2b184575aaa1540448a`
(`test: cover sensitive checkout fields`).

## Final-review P1 fix

### Lifecycle and recoverable idempotency contract

`createReview` now issues and records an unguessable review token. `submit`
requires that current token and therefore rejects a direct raw submission with
`CHECKOUT_REVIEW_REQUIRED`. A submit moves the record through `submitting`; a
downstream error exposes `checkoutState: 'failed'`, releases its lease, and
returns the review to `review` for retry. Completed results remain replayable.

The submissions Adapter contract is now explicit in `src/index.mjs`:

- `acquire` atomically returns `{status:'acquired',attemptToken}`,
  `{status:'completed',result}`, or `{status:'in_progress'}` for the scoped
  idempotency key.
- `complete` durably stores a lease-owned result for replay.
- `release` relinquishes every acquired lease after any downstream error.
- the orders Adapter receives `idempotencyKey` and must enforce it as its
  persistent unique key.

RED command after adding the review-token test:

```powershell
node --test packages/buyna-checkout-flow-core/test/checkout-flow.test.mjs
```

Observed expected RED: `submit` accepted raw input far enough to fail with
`MISSING_ADAPTER_CLAIM`, rather than `CHECKOUT_REVIEW_REQUIRED`; 2 passed and
1 failed. After implementing the token/state guard and lease interface, the
same command was GREEN: 3 passed, 0 failed.

The completion-retry regression test produced this separate RED before its
minimal recovery implementation:

```powershell
node --test packages/buyna-checkout-flow-core/test/checkout-flow.test.mjs
```

Observed `order-2` where the required reused order was `order-1`; 4 passed,
1 failed. The restored GREEN reused the pending result after a transient
`complete` failure: 5 passed, 0 failed. The concurrent-lease test then passed
with `CHECKOUT_SUBMISSION_IN_PROGRESS` and exactly one order creation.

### Provider money validation and mutation proof

Added table-driven invalid snapshot cases: missing, negative, fractional, and
unsafe amount; missing and unsupported currency. The configured/default
currency set normalizes to uppercase and defaults to `JPY`. Invalid money is
rejected before local order creation or pure provider-request construction.

RED command before implementing this validation:

```powershell
node --test packages/buyna-checkout-flow-core/test/checkout-flow.test.mjs
```

Observed expected RED: invalid snapshots reached `createPendingOrder` and then
failed with `MISSING_PENDING_ORDER_ID` instead of the required provider-money
error; 3 passed, 1 failed. After validation, the command was GREEN: 4 passed,
0 failed.

Mutation command (the amount guard was temporarily disabled):

```powershell
node --test --test-name-pattern "invalid server-derived provider money" packages/buyna-checkout-flow-core/test/checkout-flow.test.mjs
```

Observed mutation RED: the selected money test failed with
`MISSING_PENDING_ORDER_ID`; summary 0 passed, 1 failed, 5 skipped. Restoring
the amount guard made the same command GREEN: 1 passed, 0 failed, 5 skipped.

### Final validation

```powershell
npm test --prefix packages/buyna-checkout-flow-core
$testFiles = Get-ChildItem tests -Filter '*.test.mjs' | ForEach-Object FullName; node --test $testFiles
powershell -ExecutionPolicy Bypass -File .\scripts\validate.ps1
```

All final checks passed: checkout package 6 passed/0 failed; root tests 21
passed/0 failed; repository validation printed `All Skills and fixed modules
passed repository validation.` `git diff --check` also completed cleanly.

### Final-review changed files

- `packages/buyna-checkout-flow-core/src/index.mjs`
- `packages/buyna-checkout-flow-core/test/checkout-flow.test.mjs`
