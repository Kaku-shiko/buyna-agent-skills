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
  secrets, or implements middleware. It interprets trusted Adapter results and
  emits stable `401`/`403` decisions.
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
- Produce immutable `UPLOAD_QUEUE_STATES`, `UPLOAD_QUEUE_TRANSITIONS`, and
  serializable effect descriptors. Project code executes `validate`, `upload`,
  `abort_upload`, `confirm`, or `remove` effects through its Adapters.

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
  queue.transition({ itemId: 'file_1', event: 'validation_passed' });
  queue.transition({ itemId: 'file_1', event: 'upload_completed', attemptId: 'attempt_1' });
  queue.transition({ itemId: 'file_1', event: 'confirmation_succeeded' });
  assert.equal(queue.snapshot().items[0].state, 'ready');
  assert.throws(
    () => queue.transition({ itemId: 'file_1', event: 'validation_failed' }),
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
  selected -> validating
  validating -> uploading | failed
  uploading -> confirming | failed
  confirming -> ready | failed
  failed -> validating | uploading | confirming
  ready -> removing
  removing -> removed | failed
  selected/validating/uploading/confirming/failed -> removed (cancel)
  ```

  A failure record stores `failedStage`, `retryTarget`, stable `errorCode`, and
  the current `attemptId`. A legal transition returns an effect descriptor but
  never calls S3, metadata, DOM, or framework APIs.

- [ ] **Step 4: Run the lifecycle test and verify GREEN**

  Run the focused test. Expected: lifecycle and illegal-transition cases pass.

- [ ] **Step 5: Write failing progress, retry, ordering, cover, and cancellation tests**

  Cover all of the following in named tests:

  - progress is derived from safe integer `loaded/total`, clamped to `0..100`,
    and rejects `total <= 0`, negative bytes, and non-current `attemptId`;
  - retry creates a new attempt identity, returns to the remembered retry
    target, and cannot retry a non-failed or cancelled item;
  - duplicate completion/confirmation events are idempotent for the same
    attempt but stale attempts cannot mutate current state;
  - `reorder` requires every current non-removed item exactly once and never
    changes ownership or state;
  - cover selection accepts only one `ready` item and automatically chooses the
    first remaining ready item when the current cover is removed;
  - cancellation emits `abort_upload` only for an active upload, ignores a
    duplicate cancellation, and never deletes a confirmed object directly.

- [ ] **Step 6: Run tests and verify RED for the new behavior**

  Expected: failures for missing progress/attempt/order/cover/cancel behavior,
  not failures caused only by test syntax.

- [ ] **Step 7: Implement deterministic queue effects and public export**

  Deep-freeze every snapshot returned to project code. Re-export the queue API
  from `file-core.mjs`. Update the package test script to run both test files:

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

  Expected: all old lifecycle tests and all queue tests pass.

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
- Trusted Adapter identity shape:
  `{ subjectId, sessionId, permissions: string[], issuedAt, expiresAt }`.
  Secrets, password fields, raw cookies, bearer tokens, refresh tokens, and
  card/payment fields are rejected rather than copied.
- Produce immutable `AUTH_SESSION_STATES`, `AUTH_SESSION_TRANSITIONS`, and
  decisions `{ allowed, statusCode, code, identity? }`.

- [ ] **Step 1: Write failing legal-transition and stale-attempt tests**

  ```js
  const auth = createAuthSession({ clock: () => new Date('2026-08-26T00:00:00Z') });
  auth.beginAuthentication({ attemptId: 'attempt_1' });
  auth.acceptAuthentication({
    attemptId: 'attempt_1',
    identity: {
      subjectId: 'user_1', sessionId: 'session_1', permissions: ['catalog:write'],
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
  denial returns `403/AUTH_SESSION_FORBIDDEN`. Reject identity keys matching
  `password`, `passwordHash`, `cookie`, `token`, `refreshToken`, `cardNumber`,
  or `cvv` with `AUTH_SENSITIVE_FIELD_FORBIDDEN`. Verify snapshot mutation
  attempts cannot alter permissions or identity.

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
  rg -n --glob '!skills/**' --glob '!docs/**' --glob '!node_modules/**' "gallery|lightbox|carousel|currentIndex|returnFocus|reducedMotion" packages tests
  ```

  Expected in the current repository: only unrelated workflow `currentIndex`
  matches and no runnable storefront gallery consumer. Record the exact scan
  command and result in the decision Markdown. Do not count requirement prose,
  workflow gate indexes, or Dashboard drawer code.

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
  scripts for accepted modules. Assert that auth/context shared source
  contains no `.css`, `.scss`, `.sass`, `.less`, JSX/TSX, merchant identifiers,
  credentials, provider calls, AWS SDK, SQL/ORM implementation, framework
  middleware, or browser DOM imports.

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
- Create: `tests/supporting-interaction-state-routing.test.mjs`
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
  module, Git/AWS intent, or fixed UI design.

- [ ] **Step 2: Write failing executable route tests**

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
  not name the deferred gallery package. Assert bounded work-package
  authorization is inherited and no child Skill asks again.

- [ ] **Step 3: Verify RED**

  Run:

  ```powershell
  node --test tests/supporting-interaction-state-routing.test.mjs
  ```

  Expected: missing auth/context/file-queue route dependencies.

- [ ] **Step 4: Implement deterministic Builder selection**

  Extend `routeForGate` and `assertSelectedDependencyContract` without adding a
  new rigid website phase. Use the persisted capability set:

  - `dashboard_integration + requiresDashboard` selects auth and context;
  - `dashboard_integration + dashboardSlice in
    ['products','services','media','page_editor']` also selects file core, after
    verifying that slice is persisted in `configuration.dashboardSlices`;
  - `frontend_code + requiresCatalog` keeps gallery behavior project-generated
    and does not select `buyna-storefront-gallery-core` in Batch 3;
  - `checkout_payment`, `testing_upload_gate`, and `aws_release` do not select
    these modules unless the requested target itself is Dashboard/file work.

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
  git add skills .agents/skills/buyna-website-builder tests/supporting-interaction-state-routing.test.mjs
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
    -> existing merchant file service confirmUpload
    -> queue confirmation_succeeded/ready
  ```

  Assert every Adapter receives the same server-owned `projectId + sellerId`.
  Repeat with a second seller and assert cross-host session reuse returns 403,
  never confirms metadata, and never touches storage. Verify retry is
  idempotent and stale progress cannot change the final ready item.

- [ ] **Step 2: Run the new integration test and verify RED**

  Run:

  ```powershell
  node --test tests/supporting-interaction-state-integration.test.mjs
  ```

  Expected: fail if the modules cannot compose through their published
  interfaces or if server scope is dropped.

- [ ] **Step 3: Make only the minimum red-green integration repair**

  Do not add project SQL, S3 SDK, middleware, DOM, or visual code to make the
  test pass. Repair only mismatched public contracts or missing scope/effect
  data, then rerun the focused package tests.

- [ ] **Step 4: Run every package and root test**

  Discover every `packages/*/package.json` with a `test` script and run it;
  then run every root `tests/*.test.mjs`. Expected: zero failed, cancelled, or
  skipped required tests and no hidden package omitted.

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
- [ ] Builder selection refers only to packages registered by Task 5.
- [ ] The deferred gallery package is absent from disk, manifest, and routes.
- [ ] Existing file service compatibility remains explicitly tested.
- [ ] Every Skill prose edit is preceded by a failing executable test.
- [ ] Shared modules define behavior only; every visible UI/UX choice remains
  generated inside the merchant project.
- [ ] No step provisions, deploys, migrates, or mutates live resources.
