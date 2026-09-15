---
name: buyna-website-builder
description: "Use when starting, continuing, or repairing a Buyna.ai static, product, booking, Dashboard, checkout, payment, testing, or release website project."
---

# Buyna.ai Website Builder

This is the single team entrypoint. `packages/buyna-workflow-state-core` owns
workflow state and `scripts/route-builder.mjs` deterministically selects the
minimum ready Skills and fixed modules. Project code owns Adapters,
configuration, framework wiring, and visual presentation.

## Start Or Resume

Create or refresh project-root `AGENTS.md` using
[project-agent-guide.md](references/project-agent-guide.md) after task intake,
approved scope changes, and phase handoff. Preserve existing project rules.

For every website type, carry the applicable merchant privacy and transaction
disclosures from intake through design, frontend and verification using
[merchant-legal-pages.md](references/merchant-legal-pages.md).

The generator records task scope and reuses this Builder's router for advisory Skill
and module snapshots; the guide never replaces verified workflow evidence.

- New build: create a new workflow, invoke `buyna-customer-intake`, and persist
  its normalized capabilities before routing later work. Do not synthesize or
  import completed history for a new project.
- Repair or resume: load the existing workflow first. When verifiable delivery
  and approval records are supplied for missing history, call
  `importVerifiedHistory` once, persist its event batch, recompute readiness,
  and enter the requested ready slice directly.
- Completed/deployed repair: when `currentGate=null`, run the router in `repair`
  mode. It validates full gate evidence first. A canonically N/A Dashboard or
  checkout request becomes a capability scope change. On `reopen_repair`,
  authorize one bounded repair scope through
  `openRepairSlice`, persist the transition, and rerun the router. The repair
  slice is separate; canonical completed gates and release evidence stay intact.
- Chat statements identify evidence to inspect; the workflow advances from the
  verified records returned to the import Interface.
- A legacy `mixed` record without cart or explicit lifecycle flags remains
  booking/payment-only. `EXPLICIT_PRODUCT_CAPABILITY_MIGRATION_REQUIRED` means
  return to customer intake and persist catalog/inventory/coupon flags before
  adding product work; never infer them from `mixed` alone.

Default presentation is `team`. Use `developer` only when the user requests
commands, resource identifiers, internal status codes, or detailed technical
evidence. Read [interaction modes](references/interaction-modes.md).

## Execution Recipe

1. Resolve the project installation, then the user installation. In the source
   repository load root `repository-manifest.json`; in an installation load
   `.agents/buyna/repository-manifest.json` or `.codex/buyna/repository-manifest.json`.
   Then load `buyna-workflow-state-core` and the saved state.
2. For a new build, run customer intake and persist its normalized capability
   record. For repair/resume, recover the saved state and import only supplied
   verifiable missing history through
   `importVerifiedHistory`; if a required record is unavailable, request one
   grouped evidence input.
   At trusted server initialization, call `loadPinnedWorkflowAuthority` from the
   immutable server-owned configuration, then construct one
   `createVerifiedWorkflowStore` with that pinned public verification key/key ID
   and its protected authority transport. For every persisted load or resume, call
   `loadVerifiedWorkflow()` before routing or transitioning. Save only through
   `saveWorkflow({loadedState, transition})`, passing the unchanged transition
   and opaque single-use proof returned by the workflow core. Never reconstruct
   `{state, event}`. The Store consumes the verified-load permit before I/O,
   stages a unique immutable revision candidate, publishes only the signed CAS
   winner, atomically switches its current pointer, and repairs an interrupted
   pointer switch from the signed authority head on the next load. A route request, AI response, or
   per-load call must never supply authority configuration, a verifier, boolean,
   string, or JSON provenance marker. Transport responses cannot declare success:
   the store verifies every signed receipt, latest head, fresh nonce, and
   conditional commit acknowledgement locally. `WORKFLOW_STATE_PROVENANCE_UNTRUSTED`
   requires an authoritative store load or a fresh in-memory core transition.
   A resumed state with nonempty Dashboard slices or slice approval is subject
   to the same verified-load requirement even when no work package or repair is present.
   After design/page-structure approval, persist the exact approved Dashboard
   slice list through `setApprovedDashboardSlices` only while `currentGate` is
   `frontend_code` and that gate is `ready`, before frontend start or delivery.
   `DASHBOARD_SLICE_SCOPE_CHANGE_REQUIRED` means return to approved scope instead
   of rewriting a later or completed workflow. Never write
   `configuration.dashboardSlices` directly. In the same approved design/work
   package decision, persist only requested order/booking notification work via
   `setApprovedNotificationOperations`; this does not add a second confirmation.
   Never write `configuration.notificationOperations` directly. A later
   addition returns `NOTIFICATION_OPERATION_SCOPE_CHANGE_REQUIRED`. Create bounded execution approval
   only through `authorizeWorkPackage`. These workflow transitions own the
   actor, scope, timestamp, and event evidence consumed by routing.
3. Run `scripts/route-builder.mjs` with the capabilities persisted in the loaded
   workflow state, the same capabilities as the external request assertion,
   requested slice, release intent, and `dashboardSlice` when the target is
   `dashboard_integration`. The value must be one persisted
   `configuration.dashboardSlices` entry. Omission auto-selects only a single
   persisted entry; `all` requires the approved bounded work package. Pass
   `notificationOperation` only for one matching operation already persisted by
   the workflow transition; omission means no delivery work. Then pass `build |
   repair | resume` mode.
   When it returns `CAPABILITY_SCOPE_CHANGE_REQUIRED`, return to scope/capability
   intake. When it returns `reopen_repair`, record the separately authorized
   repair slice with `openRepairSlice` and run the same input against the new state.
4. Treat the script output as routing authority. Read
   [routing-map.md](references/routing-map.md), the selected phase reference,
   and only the returned child Skills.
5. Read [execution-check-policy.md](references/execution-check-policy.md).
   Verify the approved frontend/API contract, selected fixed modules, and any
   applicable registered resource evidence once, then derive one
   `executionCheckReceipt` for the current gate and slice. Pass that receipt to
   every returned child. Children return missing evidence to this Builder and
   must not rerun the same static gate or ask for another confirmation.
6. Run a selected fixed-module test only when the receipt has no passing
   `testEvidence` for the same package source digest. Add the result to the
   receipt, then run only the minimum project tests changed by this slice.
7. Persist delivery evidence through the workflow core. If
   an `activeRepair` is ready, validate and close it through
   `completeRepairSlice`; canonical completed gates remain unchanged. Otherwise, if
   `continueWithoutConfirmation=true`, call `completeAuthorizedGate` and
   continue to the next ready included gate. Otherwise render the current
   decision point once.

The routing script accepts JSON on stdin and returns JSON on stdout for routes
that do not claim persisted work-package or repair authorization:

```powershell
node skills/buyna-website-builder/scripts/route-builder.mjs < route-input.json
```

For every persisted resume, load and route in the same trusted server runtime;
serialization intentionally removes the opaque provenance held by the workflow
core. The JSON stdin route is not a persisted-state loader.

## Website Copy Default

Customer-facing website copy defaults to a normally operating business: use
natural selling, shopping, and booking language. Do not add “演示”, “测试”,
“示例商品”, “模拟支付”, “demo”, “test”, or “sample product” to generated
headlines, product descriptions, buttons, or design images merely because the
site is under development. Apply this rule to all child design/content/code work.
Use explicit demo/test wording only when requested or when reporting an actual
operational state that customers need to understand. Keep development/mock
disclosures in delivery reports and developer documentation. This copy default
does not authorize invented inventory, reviews, sales, delivery promises, or
payment readiness; unavailable actions must remain truthful and cannot simulate
a successful purchase or reservation.

## Fixed Versus Project-Owned

- `buyna-workflow-state-core`: gate state, approvals, work packages, verified
  history import.
- `buyna-cart-core` and `buyna-order-core`: product cart/order behavior,
  including drawer interaction state and safe transitions.
- `buyna-merchant-catalog-core`, `buyna-inventory-core`, and
  `buyna-coupon-core`: product/category lifecycle, stock reservation, and the
  optional persisted coupon capability.
- `buyna-merchant-dashboard-core`: operation state for every interactive
  Dashboard page.
- `buyna-auth-session-core` then `buyna-merchant-context-core`: request-local
  authorization and current observed-host merchant scope for protected
  Dashboard work.
- `buyna-merchant-file-core`: file lifecycle and upload-queue effects only for
  approved file-capable Dashboard slices.
- `buyna-commerce-read-model-core`: merchant sales metrics and trends only for
  the approved Dashboard overview; it is separate from CRM GMV.
- `buyna-delivery-state-core`: retry/lease/idempotent notification state only
  for an explicit approved matching order/booking notification operation.
- `buyna-checkout-flow-core`: minimum fields, method selection, review,
  submission, snapshot, and local order lock.
- `buyna-commerce-settlement-core`: trusted result reconciliation, legal
  paid/refund transitions, idempotency, and transactional effects.
- Project: database/provider Adapters, routes, labels, pricing configuration,
  localized copy, markup, components, colors, fonts, spacing, shell, page
  composition, transitions, responsive visual treatment, CSS, and other
  presentation. Fixed drawer/table/dialog behavior never supplies a shared
  Dashboard skin.

Payment-capable new builds use the fixed checkout core, GlobePay transport and
verification Adapters, then the settlement core. Every new-path request carries
server-owned `projectId + sellerId`; settlement reconciles exact order, amount,
and currency before applying effects. Payment-capable intake records one
explicit supported architecture: `fixed-cores` for this new path or
`legacy-globepay-service` for an already recorded legacy project. The legacy
route uses that service without the fixed checkout/settlement cores and confirms
paid through provider Query plus exact amount/currency reconciliation. An
omitted or unknown architecture is a blocker, not an implicit legacy selection.

## Approvals And External Actions

Explicit approval remains required for customer scope, combined
design/structure, production release or traffic switching, paid activation,
new cost, destructive work, and scope expansion.

After design approval, one bounded work package may include `frontend_code`,
`dashboard_integration`, `checkout_payment`, and `testing_upload_gate`. Each
gate still validates delivery evidence, while ready included gates continue
without repeated confirmation.
Call `authorizeWorkPackage`; do not hand-build `configuration.workPackage`.
Completed repair authorization likewise comes only from `openRepairSlice`.

Every returned child inherits `configuration.workPackage`, the approved
fixed-module selection, approved Adapter contract, and
`executionCheckReceipt`. It must not repeat onboarding, frontend/API approval,
module discovery, resource inspection, unchanged package tests, or confirmation
inside that approved slice. Runtime identity is never inherited: every
protected request obtains fresh trusted auth and resolves the current
server-observed host through the merchant-context core.

Local preview runs in the current checkout/project. GitHub is selected only for
an approved repository publication/contribution request. AWS is selected only
for an approved `aws_release` or infrastructure request with explicit release
intent.

## Response And Delivery

After each state load/mode change, call `getInteractionPolicy({state})`.
Child Skills return structured evidence to this Builder.

In team mode show `当前步骤`, `状态`, `已经完成`, `需要你操作`, and `下一步`.
Show `确认并进入下一步 / 需要修改 / 暂停` at a real decision point. For code
gates report `DELIVERED_FILES`, `IMPLEMENTED_SCOPE`, `VERIFICATION`,
`NOT_CONNECTED`, and `PHASE_RESULT`.

Secrets stay outside chat, frontend code, project files, and Skill files.
Local preview is local evidence, while production delivery requires the
separate release gate.
