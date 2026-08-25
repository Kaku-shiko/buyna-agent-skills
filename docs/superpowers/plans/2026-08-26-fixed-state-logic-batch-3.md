# Fixed State Logic Batch 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Every behavior change uses strict
> red-green-refactor; do not edit a Skill before its repository behavior test
> is red.

**Goal:** Add reusable upload-queue, authentication-session, and server-owned
merchant-context state, then route applicable website work to those modules
without fixing any merchant's UI design; record why the current gallery idea
fails the depth/deletion threshold and remains project-generated.

**Architecture:** Framework-neutral modules own legal state transitions,
stable errors, idempotency, and immutable server scope. S3/PostgreSQL,
password/session-cookie, HTTP-request, framework, and DOM bindings remain
project Adapters. Merchant projects continue to generate all visual markup,
copy, components, motion treatment, and CSS.

**Tech Stack:** Node.js ES modules, `node:test`, JSON repository manifest,
Markdown Codex Skills, PowerShell repository validation.

**Spec:** `docs/superpowers/specs/2026-08-25-fixed-state-logic-design.md`

## Global Constraints

- Never copy a merchant name, domain, theme, CSS, price, credential, AWS
  identifier, or production configuration into shared code.
- Every file and merchant-context operation uses server-owned `projectId` and
  `sellerId`; browser query/form values never establish ownership.
- The upload queue owns interaction state only. S3 transport, presigned URLs,
  PostgreSQL metadata, and public delivery URLs remain project Adapters.
- The auth module never verifies passwords, parses framework cookies, stores
  secrets, exposes an internal session-record ID, or implements middleware. It
  interprets trusted Adapter results and emits stable `401`/`403` decisions.
- The merchant-context module reads the observed host and authenticated
  identity from server Adapters; its public resolver does not accept caller
  ownership IDs.
- Shared packages contain no JSX/TSX, HTML templates, CSS, icon assets, fixed
  labels, layout, colors, fonts, spacing, animation curves, or Dashboard skin.
- Skill edits require a failing executable repository test before prose
  changes.
- This batch performs no AWS, live database, DNS, deployment, live login, or
  live payment-path mutation.

## Fixed Behavior Versus Generated Project Work

| Area | Fixed package owns | Project generates or adapts |
|---|---|---|
| File upload | queue states, retry target, progress normalization, order, cover identity, cancellation | picker/dropzone, preview cards, S3 upload/abort, metadata API, styles |
| Authentication | legal session states, stale-attempt rejection, expiry, logout, stable 401/403 decisions, secret redaction | password/SSO verification, cookie/token storage, middleware, login page |
| Merchant context | host normalization, active-merchant/membership comparison, immutable scope, stable denial codes | request host extraction/trusted proxy policy, session lookup, PostgreSQL/ORM directory queries |
| Gallery, deferred in Batch 3 | no fixed package until two real consumers prove depth | state, thumbnails, modal/carousel markup, focus wiring, gestures, transitions, image component, CSS |

## Dependency Order

```text
auth-session core ----\
                       +--> merchant-context core --> merchant API Adapters
merchant directory ---/

merchant-context core --> file upload route --> merchant-file service
                                          \--> upload-queue interaction state

gallery evaluation --> defer --> generated storefront UI
```

Tasks 1 and 2 are independent. Task 3 consumes the authenticated identity
contract from Task 2. Task 4 records the evidence-backed no-go decision and
produces no package. Task 5 registers Tasks 1-3 only. Task 6 routes those
modules; Task 7 verifies the full batch.

---

### Task 1: Deepen Merchant File Core With Upload Queue State

**Files:**
- Create: `packages/buyna-merchant-file-core/src/upload-queue.mjs`
- Create: `packages/buyna-merchant-file-core/test/upload-queue.test.mjs`
- Modify: `packages/buyna-merchant-file-core/src/file-core.mjs`
- Modify: `packages/buyna-merchant-file-core/package.json`

**Interfaces:**
- Preserve: `buildMerchantObjectKey`, `scaffoldMerchantProject`, and
  `createMerchantFileService` without changing their existing Adapter calls.
- Produce: `createUploadQueue({ projectId, sellerId, policy?, idGenerator?, clock? })`,
  where `idGenerator(kind)` returns identities for `kind === 'item'` and
  `kind === 'attempt'`.
- Queue methods: `select(input)`, `transition({ itemId, event, attemptId?, data? })`,
  `retry({ itemId })`, `setProgress({ itemId, attemptId, loaded, total })`,
  `reorder({ itemIds })`, `setCover({ itemId })`, `cancel({ itemId })`, and
  `snapshot()`.
- Produce: `createUploadEffectExecutor({ projectId, sellerId, effectStore,
  handlers })` with `execute(effect)`.
- Every state-changing call returns `{ snapshot, effects }`. Every effect has
  this exact immutable shape:

  ```js
  {
    effectId,             // deterministic; same value on state replay
    idempotencyKey,       // equal to effectId in v1
    type,                 // validate_file | upload_object | confirm_upload | remove_file | abort_upload
    projectId,
    sellerId,
    itemId,
    attemptId,
    payload,              // safe file metadata only; no bytes, credentials, bucket, URL, or owner input
  }
  ```

- `effectId` is exactly
  `upload:{projectId}:{sellerId}:{itemId}:{attemptId}:{type}`. Item identity is
  allocated by `select`. Attempt identity is allocated once when validation or
  removal starts and once again before every explicit retry; later events in
  that attempt reuse it.
- Exact queue events are `start_validation`, `validation_succeeded`,
  `validation_failed`, `upload_succeeded`, `upload_failed`,
  `confirmation_succeeded`, `confirmation_failed`, `start_removal`,
  `removal_succeeded`, `removal_failed`, `cancel`, and `retry`.
- Effect mapping is exact: `start_validation -> validate_file`,
  `validation_succeeded -> upload_object`,
  `upload_succeeded -> confirm_upload`, `start_removal -> remove_file`, and
  `cancel -> abort_upload` only while uploading. `validation_failed`,
  `upload_failed`, `confirmation_succeeded`, `confirmation_failed`,
  `removal_succeeded`, and `removal_failed` emit no new external effect.
  `retry` allocates a new attempt and emits the effect for its remembered
  target: validating/uploading/confirming/removing maps to
  `validate_file`/`upload_object`/`confirm_upload`/`remove_file`.
- Effect Store Adapter:
  `acquireEffect({ projectId, sellerId, effectId, idempotencyKey })` returns
  `{ outcome: 'acquired' | 'completed' | 'in_progress', result? }`;
  `completeEffect({ projectId, sellerId, effectId, idempotencyKey, result })`;
  `failEffect({ projectId, sellerId, effectId, idempotencyKey, errorCode })`.
  Its generated persistence Adapter enforces one unique record per
  `(project_id, seller_id, idempotency_key)`. `completed` replays the stored
  result without calling a handler; `in_progress` fails with
  `UPLOAD_EFFECT_IN_PROGRESS`; a failed record may be reacquired for the same
  external request key.
- Handler Adapter methods are keyed by the five effect `type` values above.
  Each has the exact signature `handlers[type](effect)` and returns a
  serializable result. The fixed executor owns claim/replay ordering; handlers
  own validation, S3, metadata, and abort transport. On handler failure the
  executor records `failEffect` with a stable error code and rethrows; it never
  marks a failed call complete.

- [ ] **Step 1: Write failing lifecycle and scope tests**

  Add black-box tests for the complete legal path and stable failures:

  ```js
  const queue = createUploadQueue({
    projectId: 'project_alpha',
    sellerId: 'seller_alpha',
    idGenerator: kind => kind === 'item' ? 'file_1' : 'attempt_1',
  });
  queue.select({ name: 'item.webp', size: 1200, type: 'image/webp' });
  queue.transition({ itemId: 'file_1', event: 'start_validation' });
  queue.transition({ itemId: 'file_1', event: 'validation_succeeded', attemptId: 'attempt_1' });
  queue.transition({ itemId: 'file_1', event: 'upload_succeeded', attemptId: 'attempt_1' });
  queue.transition({ itemId: 'file_1', event: 'confirmation_succeeded', attemptId: 'attempt_1' });
  assert.equal(queue.snapshot().items[0].state, 'ready');
  assert.throws(
    () => queue.transition({ itemId: 'file_1', event: 'validation_failed', attemptId: 'attempt_1' }),
    error => error.code === 'UPLOAD_QUEUE_INVALID_TRANSITION',
  );
  ```

  Also reject missing/invalid server scope and caller-supplied `projectId` or
  `sellerId` on item operations with `UPLOAD_QUEUE_SCOPE_OVERRIDE_FORBIDDEN`.

- [ ] **Step 2: Run the focused test and verify RED**

  Run:

  ```powershell
  node --test packages/buyna-merchant-file-core/test/upload-queue.test.mjs
  ```

  Expected: `ERR_MODULE_NOT_FOUND` for `upload-queue.mjs` or a missing
  `createUploadQueue` export.

- [ ] **Step 3: Implement the minimum queue state machine**

  Implement exactly these transitions:

  ```text
  selected -> validating (`start_validation`, allocate attempt)
  validating -> uploading | failed
  uploading -> confirming | failed
  confirming -> ready | failed
  failed -> validating | uploading | confirming (`retry`, allocate new attempt)
  ready -> removing (`start_removal`, allocate attempt)
  removing -> removed | failed
  selected/validating/uploading/confirming/failed -> removed (cancel)
  ```

  A failure record stores `failedStage`, `retryTarget`, stable `errorCode`, and
  the current `attemptId`. A legal transition returns the exact effect schema
  above but never calls S3, metadata, DOM, or framework APIs.

- [ ] **Step 4: Run the lifecycle test and verify GREEN**

  Run the focused test. Expected: lifecycle and illegal-transition cases pass.

- [ ] **Step 5: Write failing progress, retry, ordering, cover, and cancellation tests**

  Cover all of the following in named tests:

  - progress is derived from safe integer `loaded/total`, clamped to `0..100`,
    and rejects `total <= 0`, negative bytes, and non-current `attemptId`;
  - retry first creates a new attempt identity, returns to the remembered retry
    target, and emits a new effect/request key; it cannot retry a non-failed or
    cancelled item;
  - duplicate `validation_succeeded`, `upload_succeeded`,
    `confirmation_succeeded`, `removal_succeeded`, and matching failure events
    for the same attempt return the cached transition result without a new
    attempt or request key; specifically, duplicate `upload_succeeded` returns
    the identical `confirm_upload` effect/key, while duplicate
    `confirmation_succeeded` returns the same `ready` snapshot with
    `effects: []` and does not re-emit confirmation; stale attempts cannot
    mutate current state;
  - `reorder` requires every current non-removed item exactly once and never
    changes ownership or state;
  - cover selection accepts only one `ready` item and automatically chooses the
    first remaining ready item when the current cover is removed;
  - cancellation emits `abort_upload` only for an active upload, replays the
    same abort effect identity on a duplicate cancellation, and never deletes
    a confirmed object directly;
  - two concurrent executor calls with one idempotency key call the handler at
    most once; a completed replay returns the saved result and never calls the
    handler again.

- [ ] **Step 6: Run tests and verify RED for the new behavior**

  Expected: failures for missing progress/attempt/order/cover/cancel behavior,
  not failures caused only by test syntax.

- [ ] **Step 7: Implement deterministic queue effects and public export**

  Deep-freeze every snapshot and effect returned to project code. Implement the
  executor claim-before-handler and complete/fail-after-handler sequence.
  Re-export the queue/executor API from `file-core.mjs`. Update the package test
  script to run both test files:

  ```json
  "test": "node --test test/file-core.test.mjs test/upload-queue.test.mjs"
  ```

  Do not change existing object-key, replacement, soft-delete, or orphan
  cleanup ordering.

- [ ] **Step 8: Verify and commit**

  Run:

  ```powershell
  npm test --prefix packages/buyna-merchant-file-core
  ```

  Expected: all old lifecycle tests plus queue-state and effect-executor
  uniqueness/replay tests pass. State replay and external effect replay are two
  separate assertions: the queue must not mint a new effect, and the executor
  must not repeat a claimed external call.

  Commit:

  ```powershell
  git add packages/buyna-merchant-file-core
  git commit -m "feat: deepen merchant file upload queue state"
  ```

### Task 2: Add Fixed Authentication Session State

**Files:**
- Create: `packages/buyna-auth-session-core/package.json`
- Create: `packages/buyna-auth-session-core/src/index.mjs`
- Create: `packages/buyna-auth-session-core/test/auth-session.test.mjs`

**Interfaces:**
- Produce: `createAuthSession({ clock?, initialIdentity? })`. `initialIdentity`
  is a previously verified server session used to interpret one request; the
  core does not load or persist it.
- Methods: `beginAuthentication({ attemptId })`,
  `acceptAuthentication({ attemptId, identity })`,
  `rejectAuthentication({ attemptId, code? })`,
  `requireAuthorization({ permissions? })`, `expire({ reason? })`,
  `forbid({ reason? })`, `beginLogout()`, `completeLogout()`, and `snapshot()`.
- The only accepted and exported trusted identity keys are exactly
  `{ subjectId, permissions, issuedAt, expiresAt }`. `permissions` is a string
  array. Any internal database/session record ID stays in the project Adapter's
  private state and is never accepted or returned by this package.
- `sessionId`, `password`, `passwordHash`, `token`, `accessToken`,
  `refreshToken`, `cookie`, `credential`, provider secrets, and card/payment
  fields are outside the allowlist and are rejected rather than copied.
- Produce immutable `AUTH_SESSION_STATES`, `AUTH_SESSION_TRANSITIONS`, and
  decisions `{ allowed, statusCode, code, identity? }`.

- [ ] **Step 1: Write failing legal-transition and stale-attempt tests**

  ```js
  const auth = createAuthSession({ clock: () => new Date('2026-08-26T00:00:00Z') });
  auth.beginAuthentication({ attemptId: 'attempt_1' });
  auth.acceptAuthentication({
    attemptId: 'attempt_1',
    identity: {
      subjectId: 'user_1', permissions: ['catalog:write'],
      issuedAt: '2026-08-25T23:59:00Z', expiresAt: '2026-08-26T01:00:00Z',
    },
  });
  assert.equal(auth.snapshot().state, 'authenticated');
  assert.throws(
    () => auth.acceptAuthentication({ attemptId: 'attempt_old', identity: {} }),
    error => error.code === 'AUTH_STALE_ATTEMPT',
  );
  ```

  Cover `anonymous -> authenticating -> authenticated`, authenticated expiry,
  explicit forbidden, `authenticated -> logging_out -> anonymous`, and illegal
  transitions with `AUTH_INVALID_TRANSITION`.

- [ ] **Step 2: Verify RED**

  Run:

  ```powershell
  node --test packages/buyna-auth-session-core/test/auth-session.test.mjs
  ```

  Expected: package/source module missing.

- [ ] **Step 3: Implement the minimum state and immutable snapshot**

  Keep the module synchronous and framework-neutral. Validate ISO timestamps,
  unique string permissions, current attempt identity, and expiry against the
  injected clock. Deep-freeze snapshots and never persist them.

- [ ] **Step 4: Write failing stable 401/403 and redaction tests**

  Require these exact decisions:

  ```js
  assert.deepEqual(anonymous.requireAuthorization(), {
    allowed: false, statusCode: 401, code: 'AUTH_SESSION_REQUIRED',
  });
  assert.deepEqual(authenticated.requireAuthorization({ permissions: ['orders:write'] }), {
    allowed: false, statusCode: 403, code: 'AUTH_PERMISSION_FORBIDDEN',
  });
  ```

  An expired identity returns `401/AUTH_SESSION_EXPIRED`; explicit policy
  denial returns `403/AUTH_SESSION_FORBIDDEN`. Reject every identity key not in
  the four-key allowlist with `AUTH_IDENTITY_FIELD_FORBIDDEN`, including
  `sessionId`, `password`, `passwordHash`, `cookie`, `token`, `accessToken`,
  `refreshToken`, `credential`, `cardNumber`, and `cvv`. Test every named key
  separately and one unknown benign-looking key. Verify the public snapshot
  contains only `state`, `attemptId`, `identity`, `errorCode`, and timestamps;
  when present, `identity` contains exactly the four allowed keys. Snapshot
  mutation attempts cannot alter permissions or identity.

- [ ] **Step 5: Verify RED, implement authorization decisions, then verify GREEN**

  Run the focused test before and after implementation. The green run must show
  all transition, stale-attempt, expiry, 401/403, and redaction cases passing.

- [ ] **Step 6: Commit**

  ```powershell
  git add packages/buyna-auth-session-core
  git commit -m "feat: add fixed merchant auth session state"
  ```

### Task 3: Add Server-Owned Merchant Context Resolution

**Files:**
- Create: `packages/buyna-merchant-context-core/package.json`
- Create: `packages/buyna-merchant-context-core/src/index.mjs`
- Create: `packages/buyna-merchant-context-core/test/merchant-context.test.mjs`

**Interfaces:**
- Consume: the Task 2 authenticated identity shape.
- Produce:
  `createMerchantContextResolver({ requestAdapter, sessionAdapter, directory })`.
- `resolve(input?)` accepts no ownership values. It rejects input containing
  `host`, `projectId`, `sellerId`, `subjectId`, or `role` with
  `MERCHANT_CONTEXT_CALLER_SCOPE_FORBIDDEN`.
- Request Adapter: `getObservedHost()`.
- Session Adapter: `getAuthenticatedIdentity()` returning a Task 2
  authenticated identity or `null`.
- Directory Adapter: `findMerchantByHost({ host })` and
  `findMembership({ subjectId, projectId, sellerId })`.
- Produce an immutable context:
  `{ projectId, sellerId, host, subjectId, role, merchantStatus: 'active' }`.

- [ ] **Step 1: Write failing host, membership, and immutable-scope tests**

  ```js
  const resolver = createMerchantContextResolver({
    requestAdapter: { async getObservedHost() { return 'SHOP.EXAMPLE.COM:443'; } },
    sessionAdapter: { async getAuthenticatedIdentity() { return identity; } },
    directory: {
      async findMerchantByHost({ host }) {
        assert.equal(host, 'shop.example.com');
        return { projectId: 'project_alpha', sellerId: 'seller_alpha', status: 'active' };
      },
      async findMembership() {
        return { projectId: 'project_alpha', sellerId: 'seller_alpha', role: 'admin', status: 'active' };
      },
    },
  });
  const context = await resolver.resolve();
  assert.deepEqual(context, {
    projectId: 'project_alpha', sellerId: 'seller_alpha', host: 'shop.example.com',
    subjectId: 'user_1', role: 'admin', merchantStatus: 'active',
  });
  assert.equal(Object.isFrozen(context), true);
  ```

  Cover lowercase/trailing-dot/port normalization and reject schemes, paths,
  comma-separated forwarded-host chains, wildcards, empty host, and IP/path
  ownership guesses.

- [ ] **Step 2: Verify RED**

  Run:

  ```powershell
  node --test packages/buyna-merchant-context-core/test/merchant-context.test.mjs
  ```

  Expected: package/source module missing.

- [ ] **Step 3: Implement host lookup before scope construction**

  Call the Adapters in this order: observed host, authenticated identity,
  merchant-by-host, membership. Construct scope only after the active merchant
  and active membership match exactly. Never fall back to a sample ID, default
  seller, browser owner, or another host.

- [ ] **Step 4: Write failing denial-code and cross-merchant tests**

  Require the stable decisions below as thrown errors carrying `statusCode`:

  | Condition | Code | HTTP status |
  |---|---|---|
  | no authenticated identity | `MERCHANT_CONTEXT_AUTH_REQUIRED` | 401 |
  | unknown or inactive host | `MERCHANT_CONTEXT_NOT_FOUND` | 404 |
  | missing/inactive membership | `MERCHANT_CONTEXT_FORBIDDEN` | 403 |
  | membership project/seller differs from host | `MERCHANT_CONTEXT_SCOPE_MISMATCH` | 403 |
  | caller supplies ownership keys | `MERCHANT_CONTEXT_CALLER_SCOPE_FORBIDDEN` | 400 |

  Assert that no context is returned and no later business Adapter is called
  after any denial. Test two sellers sharing one EC2/RDS foundation but with
  distinct host records; shared infrastructure must not weaken seller scope.

- [ ] **Step 5: Verify RED, implement fail-closed comparison, then verify GREEN**

  Run the focused test before and after implementation. The green run must
  prove exact host/membership matching, correct 401/403/404 behavior, and
  immutable context output.

- [ ] **Step 6: Commit**

  ```powershell
  git add packages/buyna-merchant-context-core
  git commit -m "feat: add fixed merchant context resolution"
  ```

### Task 4: Record The Storefront Gallery Depth/Deletion Decision

**Current evaluation:** Repository inspection found gallery requirements only
in Skills/specifications and no two runnable storefront gallery consumers with
behavior tests. The existing Dashboard Escape handler is not a storefront
gallery consumer. A shared gallery package therefore cannot pass the deletion
test: deleting it would break no current consumer suite. Batch 3 must defer the
package and keep gallery behavior generated per project.

**Files:**
- Create: `docs/architecture/storefront-gallery-module-decision.md`
- Create: `tests/storefront-gallery-module-decision.test.mjs`

**Decision contract:**
- Record `decision: defer` and
  `failedCriterion: INSUFFICIENT_REAL_CONSUMERS`.
- Record the reusable candidate invariants—index bounds, open/close,
  previous/next, Escape, focus return, and reduced motion—without pretending
  they are implemented.
- Assert that `packages/buyna-storefront-gallery-core` and its manifest entry
  do not exist. Gallery markup, state, focus wiring, motion, and styling remain
  generated project code in this batch.

- [ ] **Step 1: Write the failing decision test**

  Parse one fenced `json decision-record` block from the decision Markdown and
  require this exact machine record:

  ```js
  {
    decision: 'defer',
    failedCriterion: 'INSUFFICIENT_REAL_CONSUMERS',
    runnableConsumers: 0,
    candidateInvariants: [
      'index_bounds', 'open_close', 'previous_next',
      'escape_close', 'focus_return', 'reduced_motion',
    ],
    deletionExercise: {
      possible: false,
      reason: 'NO_TWO_CONSUMER_TEST_SUITES',
      failedAssertions: [],
    },
    nonConsumers: [
      { path: 'packages/buyna-workflow-state-core/src/index.mjs', reason: 'workflow_gate_index' },
      { path: 'tests/website-builder-state-routing.test.mjs', reason: 'workflow_gate_index' },
      { path: 'tests/merchant-commerce-lifecycle-routing.test.mjs', reason: 'workflow_gate_index' },
    ],
    forbiddenImportsChecked: true,
    visualFiles: [],
  }
  ```

  The test must also assert that the package directory is absent and neither
  `repository-manifest.json.packages` nor the `website-builder` profile names
  `buyna-storefront-gallery-core`.

- [ ] **Step 2: Verify RED**

  Run:

  ```powershell
  node --test tests/storefront-gallery-module-decision.test.mjs
  ```

  Expected: missing decision record.

- [ ] **Step 3: Re-run the bounded consumer scan and write the decision record**

  Run:

  ```powershell
  rg -n --glob '!skills/**' --glob '!docs/**' --glob '!node_modules/**' --glob '!tests/storefront-gallery-module-decision.test.mjs' "gallery|lightbox|carousel|currentIndex|returnFocus|reducedMotion" packages tests
  ```

  Expected in the current repository: only unrelated workflow `currentIndex`
  matches and no runnable storefront gallery consumer. Record every match in
  `nonConsumers` with its reason; the test must fail if an unclassified match
  remains. Exclude the decision test itself so it cannot become self-evidence.
  Do not count requirement prose, workflow gate indexes, or Dashboard drawer
  code.

- [ ] **Step 4: Verify GREEN and commit the YAGNI decision**

  Run the decision test again. Expected: it passes while the gallery package
  remains absent.

  ```powershell
  git add docs/architecture/storefront-gallery-module-decision.md tests/storefront-gallery-module-decision.test.mjs
  git commit -m "docs: defer shallow storefront gallery module"
  ```

### Task 5: Repository Manifest And Shared-Module Boundary

**Files:**
- Create: `tests/supporting-interaction-state-modules.test.mjs`
- Modify: `repository-manifest.json`
- Modify: `tests/fixtures/shared-module-boundaries.json`
- Modify: `README.md`
- Modify: `docs/OPERATIONS_MANUAL.md`

**Interfaces:**
- Register `buyna-auth-session-core` and `buyna-merchant-context-core` in the
  repository and `website-builder` profile.
- Preserve and document `buyna-merchant-file-core` as the file lifecycle plus
  upload-queue behavior package.
- Keep `buyna-storefront-gallery-core` absent, matching Task 4's recorded
  `decision: defer`.
- Preserve the complete installer as manifest-driven; do not add another
  installer/profile CLI.

- [ ] **Step 1: Write a failing executable manifest test**

  Require installability, profile membership, existing package paths and test
  scripts for the deepened file core, auth core, and context core. Execute each
  package's public factory and assert exact exported snapshot/effect/context
  keys, including the auth identity four-key allowlist and the upload effect
  schema. This runtime contract—not a naive word scan—must prove that a
  `sessionId`, password/token/cookie/credential, bucket, URL, or caller owner
  cannot appear in exported data.

  The source-boundary portion may allow security words inside validation code,
  tests, and documentation. It must instead reject executable imports of
  React/Vue/Svelte/DOM frameworks, AWS SDK, SQL/ORM, password libraries, cookie
  middleware, and project routes; reject `.css`, `.scss`, `.sass`, `.less`,
  JSX/TSX, known merchant identifiers, and provider transport. Add explicit
  raw-secret-literal detection for `AKIA[0-9A-Z]{16}`, PEM private-key headers,
  JWT-looking three-segment literals, `Bearer <literal>`, and nonempty quoted
  assignments to `password`, `token`, `cookie`, or `credential`. Do not fail
  merely because code names a forbidden key or error code.

- [ ] **Step 2: Verify RED**

  Run:

  ```powershell
  node --test tests/supporting-interaction-state-modules.test.mjs
  ```

  Expected: auth/context modules are not registered.

- [ ] **Step 3: Update manifest, policy fixture, and concise documentation**

  Add one ownership table describing fixed behavior versus generated
  UI/Adapters. Link package API/readme locations rather than copying algorithms
  into README, Operations Manual, and Skills. State that file transport remains
  S3/PostgreSQL Adapter code and login/session storage remains project code.

- [ ] **Step 4: Verify and commit**

  Run:

  ```powershell
  node --test tests/supporting-interaction-state-modules.test.mjs
  powershell -ExecutionPolicy Bypass -File .\scripts\validate.ps1
  ```

  Expected: zero failures, including the Task 4 non-registration rule.

  Commit:

  ```powershell
  git add repository-manifest.json tests/fixtures/shared-module-boundaries.json tests/supporting-interaction-state-modules.test.mjs README.md docs/OPERATIONS_MANUAL.md
  git commit -m "docs: register supporting interaction state modules"
  ```

### Task 6: Skill And Builder Routing For Supporting Interaction State

**Files:**
- Record baseline in:
  `.superpowers/sdd/2026-08-26-fixed-state-logic-batch-3/task-6-report.md`
- Create: `tests/supporting-interaction-state-routing.test.mjs`
- Create: `tests/supporting-interaction-skill-contract.test.mjs`
- Modify: `skills/buyna-website-builder/SKILL.md`
- Modify: `skills/buyna-website-builder/scripts/route-builder.mjs`
- Modify: `skills/buyna-website-builder/references/routing-map.md`
- Modify: `skills/buyna-s3-storage/SKILL.md`
- Modify: `skills/buyna-s3-storage/references/merchant-file-adapter-contract.md`
- Modify: `skills/buyai-dashboard-data-interaction/SKILL.md`
- Modify: `skills/buyai-product-merchant-backend/SKILL.md`
- Modify: `skills/buyai-booking-service-backend/SKILL.md`
- Modify: `skills/buyna-frontend-builder/SKILL.md`
- Modify: `skills/buyai-storefront-layout-ux/SKILL.md`
- Modify: `skills/buyna-merchant-onboarding/SKILL.md`
- Modify: `skills/buyna-skill-operations/SKILL.md`
- Synchronize: `.agents/skills/buyna-website-builder/**`

**Routing contract:**
- Extend the public signature to
  `planWebsiteRoute({ capabilities, workflowState, requestedSlice,
  releaseIntent = false, mode = 'build', dashboardSlice = null })`.
- Extend internal
  `routeForGate({ gate, capabilities, paymentArchitecture, mode,
  dashboardSelection })`. Route output always includes
  `dashboardSlice` (`null`, one approved slice, or `'all'`) and
  `dashboardSlices` (the exact approved slice list selected for this call).
- Every applicable `dashboard_integration` selects
  `buyna-auth-session-core` and `buyna-merchant-context-core` exactly once.
- Product or booking Dashboard/file work selects `buyna-merchant-file-core`
  only for a persisted file-capable Dashboard slice; order/customer/settings
  slices, static sites, and checkout-only repairs do not acquire it.
- File UI imports upload-queue behavior but generates the picker, preview,
  ordering, cover, progress, error, and mobile presentation per project.
- Storefront gallery work remains project-generated and the Builder must not
  name the deferred/nonexistent gallery package.

- [ ] **Step 1: Record fresh-context baseline scenarios**

  Evaluate: product Dashboard image upload, booking/service image upload,
  Dashboard login repair, cross-host authorization repair, product storefront
  gallery, static local preview, and checkout-only payment repair. Record any
  regenerated state logic, missing module route, repeated approval, unrelated
  module, Git/AWS intent, or fixed UI design. Write the scenario input,
  observed route, expected route, and mismatch into
  `.superpowers/sdd/2026-08-26-fixed-state-logic-batch-3/task-6-report.md` under
  `## BASELINE_SCENARIOS`; do not create a second repository documentation
  file for this transient evidence.

- [ ] **Step 2: Write failing executable route and Skill contract tests**

  Exercise `planWebsiteRoute`, not prose-only regex checks. Assert:

  ```js
  const route = planWebsiteRoute({ ...productDashboardFixture, dashboardSlice: 'products' });
  assert.equal(route.skills.filter(x => x === 'buyai-dashboard-data-interaction').length, 1);
  assert.ok(route.fixedModules.includes('buyna-auth-session-core'));
  assert.ok(route.fixedModules.includes('buyna-merchant-context-core'));
  assert.ok(route.fixedModules.includes('buyna-merchant-file-core'));
  assert.deepEqual(route.externalActions, { git: false, aws: false });
  ```

  A Dashboard request accepts `dashboardSlice` only when it is present in
  persisted `workflowState.configuration.dashboardSlices`. File-capable slices
  are exactly `products`, `services`, `media`, and `page_editor`. Orders,
  customers, settings, static local preview, and checkout-only repair omit file
  core; non-Dashboard routes omit auth/context too. Assert route output does
  not name the deferred gallery package.

  Test the public Dashboard selection rules exactly:

  - one persisted slice plus omitted `dashboardSlice` auto-selects that slice;
  - more than one persisted slice plus omitted `dashboardSlice` returns
    `action: 'blocked'`, `reason: 'DASHBOARD_SLICE_REQUIRED'`;
  - zero persisted slices returns `action: 'blocked'`,
    `reason: 'DASHBOARD_SLICES_NOT_CONFIGURED'`;
  - an unknown or non-persisted slice returns `action: 'blocked'`,
    `reason: 'DASHBOARD_SLICE_NOT_APPROVED'`;
  - explicit `dashboardSlice: 'all'` selects every persisted slice only when
    at least one exists and the bounded work package includes
    `dashboard_integration`; otherwise return
    `DASHBOARD_FULL_SCOPE_APPROVAL_REQUIRED`;
  - a non-Dashboard target supplied with `dashboardSlice` returns
    `action: 'blocked'`, `reason: 'DASHBOARD_SLICE_NOT_APPLICABLE'`;
  - every successful and blocked route includes stable `dashboardSlice` and
    `dashboardSlices` fields and preserves `externalActions`.

  Before any Skill prose edit, make
  `tests/supporting-interaction-skill-contract.test.mjs` red. It must parse all
  edited Skills and assert their exact package links and ownership:

  - S3 Skill links `buyna-merchant-file-core` and its upload queue/executor
    Adapter contract;
  - Builder Skill names the public `dashboardSlice` selection contract and
    keeps itself as the single entrypoint without adding a rigid phase;
  - Dashboard Skill orders `buyna-auth-session-core` before
    `buyna-merchant-context-core` and both before business APIs;
  - product and booking Skills consume one immutable merchant context rather
    than accepting browser owner IDs;
  - frontend and storefront Skills say file/gallery visual UI is generated per
    project and never name a shared theme/component;
  - onboarding registers exact host and membership inputs for context
    resolution;
  - operations verifies all accepted manifest modules and the deferred gallery;
  - every child Skill inherits Builder `configuration.workPackage` and the
    already resolved auth/context, does not rerun identity resolution, and does
    not reopen approval inside the approved slice.

  The Skill contract test must also reject a fixed login screen, Dashboard
  shell, gallery theme, file-card component, colors/fonts/spacing/icons, or
  copied visual markup as a shared-module requirement.

- [ ] **Step 3: Verify RED**

  Run:

  ```powershell
  node --test tests/supporting-interaction-state-routing.test.mjs
  node --test tests/supporting-interaction-skill-contract.test.mjs
  ```

  Expected: route test fails for missing auth/context/file-queue and public
  Dashboard slice behavior; Skill contract test fails for missing module links,
  auth/context inheritance, or generated-UI boundary. Both must be red before
  editing `route-builder.mjs` or any Skill.

- [ ] **Step 4: Implement deterministic Builder selection**

  Extend the public `planWebsiteRoute` signature, a normalization helper,
  `routeForGate`, `assertSelectedDependencyContract`, dependency closure, and
  every route output without adding a new rigid website phase. Normalize
  `dashboardSelection` from the persisted
  `workflowState.configuration.dashboardSlices` before `routeForGate`. Never
  trust an externally supplied slice that is not persisted. Compute persisted
  `configuration.workPackage.gates` before normalizing `'all'`, so full-scope
  authorization is checked before route selection. Use these rules:

  - `dashboard_integration + requiresDashboard` selects auth and context;
  - `dashboard_integration + dashboardSlice in
    ['products','services','media','page_editor']` also selects file core, after
    verifying that slice is persisted in `configuration.dashboardSlices`;
  - `frontend_code + requiresCatalog` keeps gallery behavior project-generated
    and does not select `buyna-storefront-gallery-core` in Batch 3;
  - `checkout_payment`, `testing_upload_gate`, and `aws_release` do not select
    these modules unless the requested target itself is Dashboard/file work.

  `dashboardSlice: 'all'` passes the full persisted array to `routeForGate`,
  which unions dependencies once. A single slice passes a one-item array.
  Blocked selection results are produced before domain dependency selection.
  Keep manifest verification fail-closed and preserve existing Batch 1/2 route
  ordering and payment architecture separation.

- [ ] **Step 5: Make minimal Skill guidance changes after the route test is red**

  Point each Skill at one authoritative package/Adapter contract:

  - S3 Skill: queue effects plus existing confirm/replace/delete/cleanup service;
  - Dashboard Skill: auth session then merchant context before business APIs;
  - product/booking backend: consume the immutable context, never repeat login
    state or object-key algorithms;
  - frontend: import headless behavior and generate all visible UI/UX;
  - onboarding: register host/membership records used by context resolution;
  - operations: install/check the accepted manifest modules.

  Do not add a standard login screen, Dashboard shell, gallery theme, file-card
  component, colors, fonts, spacing, icons, or motion design.

- [ ] **Step 6: Synchronize the canonical Builder copy**

  Copy only verified Builder files to `.agents/skills/buyna-website-builder`
  and keep hash equality for `SKILL.md`, `agents/openai.yaml`, routing map,
  workflow contract, phase references, and `scripts/route-builder.mjs`.

- [ ] **Step 7: Verify Skills and commit**

  Run:

  ```powershell
  node --test tests/supporting-interaction-state-routing.test.mjs
  node --test tests/supporting-interaction-skill-contract.test.mjs
  npm test --prefix packages/buyna-merchant-file-core
  npm test --prefix packages/buyna-auth-session-core
  npm test --prefix packages/buyna-merchant-context-core
  powershell -ExecutionPolicy Bypass -File .\scripts\validate.ps1
  python -X utf8 "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" skills/buyna-s3-storage
  python -X utf8 "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" skills/buyai-dashboard-data-interaction
  python -X utf8 "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" skills/buyai-product-merchant-backend
  python -X utf8 "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" skills/buyai-booking-service-backend
  python -X utf8 "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" skills/buyna-frontend-builder
  python -X utf8 "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" skills/buyai-storefront-layout-ux
  python -X utf8 "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" skills/buyna-merchant-onboarding
  python -X utf8 "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" skills/buyna-skill-operations
  ```

  Expected: all commands exit zero.

  Commit:

  ```powershell
  git add skills .agents/skills/buyna-website-builder tests/supporting-interaction-state-routing.test.mjs tests/supporting-interaction-skill-contract.test.mjs
  git commit -m "feat: route supporting merchant interaction states"
  ```

### Task 7: Batch 3 Full Integration Verification

**Files:**
- Create: `tests/supporting-interaction-state-integration.test.mjs`
- Verify the complete Batch 3 branch. Modify behavior only through a new
  failing test and red-green cycle if verification exposes a defect.

**Integration contract:**
- Consume: Tasks 1-6 plus existing merchant file service, Dashboard operation
  state, repository manifest, and Builder routing.
- Produce: a reviewed Batch 3 candidate with no live-resource changes.

- [ ] **Step 1: Write the end-to-end fixed-module contract test**

  The test uses in-memory Adapters and must prove this order:

  ```text
  authenticated session
    -> exact host + membership merchant context
    -> file queue selected/validating/uploading/confirming
    -> upload effect executor unique claim/replay
    -> existing merchant file service confirmUpload handler
    -> queue confirmation_succeeded/ready
  ```

  Assert every Adapter receives the same server-owned `projectId + sellerId`.
  Repeat with a second seller and assert cross-host session reuse returns 403,
  never confirms metadata, and never touches storage. Verify retry is
  idempotent and stale progress cannot change the final ready item. Distinguish
  the two retry cases: replaying a completion/confirmation for the same
  `attemptId` preserves the original effect/request key, while an explicit
  `retry` after failure allocates a new `attemptId` and therefore a new
  deterministic effect/request key. In both cases the executor's unique
  idempotency record prevents duplicate external effects for one key.

- [ ] **Step 2: Run the new integration test and classify the initial result**

  Run:

  ```powershell
  node --test tests/supporting-interaction-state-integration.test.mjs
  ```

  Expected: GREEN is acceptable because Tasks 1-3 may already compose through
  their published interfaces. If RED, record the exact contract defect; do not
  weaken the test merely to force GREEN.

- [ ] **Step 3: If Step 2 is RED, make only the minimum red-green integration repair**

  Do not add project SQL, S3 SDK, middleware, DOM, or visual code to make the
  test pass. Repair only mismatched public contracts or missing scope/effect
  data, then rerun the focused package tests. If Step 2 was GREEN, make no
  artificial production change and continue directly to Step 4.

- [ ] **Step 4: Run every package and root test with fail-on-any propagation**

  Run this exact PowerShell block:

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

  Expected: zero failed or cancelled tests. Any package or root failure throws
  immediately and makes the verification step fail; no package with a declared
  test script may be omitted.

- [ ] **Step 5: Run repository and official Skill validation**

  Run `scripts/validate.ps1` and `quick_validate.py` for every Skill modified
  in Task 6. Expected: manifest/install/hash checks and all Skill structures
  pass.

- [ ] **Step 6: Inspect the complete Batch 3 diff**

  Confirm no CSS/theme, named merchant, credential, secret, password verifier,
  cookie/token store, SQL/ORM implementation, AWS SDK call, bucket/database
  creation, live resource mutation, deployment, or payment-path change entered
  the branch. Confirm the gallery package remains absent exactly as recorded by
  Task 4.

- [ ] **Step 7: Commit verification repairs if required**

  ```powershell
  git add packages tests skills .agents repository-manifest.json README.md docs
  git commit -m "test: verify supporting interaction state batch"
  ```

  Skip this commit when no file changed; never create an empty evidence commit.

- [ ] **Step 8: Record Batch 3 handoff evidence**

  Record exact commands, test counts, review findings, deferred minors, the
  gallery decision, and the Batch 4 boundary. Do not deploy, change AWS, push,
  or implement Batch 4 inside this task.

## Self-Review Checklist

- [ ] Every Batch 3 spec item maps to Tasks 1-4.
- [ ] Auth identity property names match merchant-context consumption exactly.
- [ ] Public auth identity has exactly four allowed keys and no internal
  session-record ID or credential-bearing field.
- [ ] File queue state replay and external effect replay have separate tests,
  deterministic request keys, and a unique Adapter claim contract.
- [ ] Builder selection refers only to packages registered by Task 5.
- [ ] `dashboardSlice` is represented consistently in the public signature,
  normalization, `routeForGate`, dependency closure, success output, and every
  blocked output.
- [ ] The deferred gallery package is absent from disk, manifest, and routes.
- [ ] Existing file service compatibility remains explicitly tested.
- [ ] Every Skill prose edit is preceded by the failing executable Skill
  contract test, and fresh scenario baselines are saved in the Task 6 report.
- [ ] Shared modules define behavior only; every visible UI/UX choice remains
  generated inside the merchant project.
- [ ] Boundary tests inspect runtime exports and raw secret literals instead of
  rejecting necessary security vocabulary.
- [ ] Full verification commands propagate any package or root test failure.
- [ ] No step provisions, deploys, migrates, or mutates live resources.
