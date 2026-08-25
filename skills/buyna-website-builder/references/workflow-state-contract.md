# Workflow State Contract

`packages/buyna-workflow-state-core` is the authority for stop and continue decisions.

## Storage

- Snapshot: `workflow/workflow-state.json`
- Append-only events: `workflow/history/workflow-events.jsonl`
- Delivery evidence: `workflow/records/`

Never store credentials, payment secrets, personal form values, or environment variables here.

Store `configuration.interactionMode` as `team` or `developer`. The mode controls presentation only; gate status, delivery evidence, and approval transitions remain identical. Persist later mode changes through `setInteractionMode`, never by editing JSON.

After loading state, call `getInteractionPolicy({state})`. This is the canonical presentation contract. A child Skill returns structured evidence to the Builder; it must not bypass the policy by printing raw technical output directly to a team-mode user.

## Verified history recovery

For repair/resume, call `importVerifiedHistory({state, requestedGate, imports,
importedBy})` with real approved delivery records or verified capability-driven
N/A records. Imports start at `currentGate`, follow the canonical order without
gaps, and end immediately before `requestedGate`. Each approval contains its
record path, approver, approved timestamp, and `decision: approved`.

For a legitimate optional gate, use `outcome: not_applicable` plus a
`notApplicable` object containing `reason`, `record`, `verifiedBy`, and
`verifiedAt`. This branch accepts only `dashboard_integration` when Dashboard is
not required or `checkout_payment` when checkout/payment is not required. It
records `verified_gate_not_applicable_imported` and contains no fake delivery or
approval files.

The Interface validates every gate's ordinary delivery contract, applies the
history to a cloned state, advances readiness once, and returns one transition
with an ordered `events` batch plus the final aggregate `event`. Persist that
transition through `saveTransition`; the file store appends the complete event
batch in one write. Chat assertions are discovery hints and are never import
evidence.

For a completed workflow, `validateCompletedWorkflowState` requires every
approved gate to carry valid delivery and approval evidence and every
`not_applicable` gate to carry a capability-legitimate reason plus trustworthy
native-transition or verified-import evidence. Imported approvals also carry
their approval record. `openRepairSlice` reuses this complete validation.

For an eligible completed/deployed workflow (`currentGate=null`), authorize a
bounded implementation repair through `openRepairSlice({state, gate, scope,
authorizedBy})`. A repair gate must already be enabled by the saved capabilities;
adding Dashboard or checkout starts a capability scope change instead. The
Interface returns separate `activeRepair` readiness and a
`repair_slice_opened` event while preserving canonical gate status, delivery,
approval, and release evidence. The router then enters that matching repair
slice without reopening the original workflow. After delivery, call
`completeRepairSlice({state, delivery, completedBy})`; it applies the ordinary
gate evidence validator, stores the repair delivery on `activeRepair`, and emits
`repair_slice_completed` without changing canonical gate history.

## Work-package authorization

After customer scope and combined design/structure are explicitly approved, a user may approve one bounded execution package. Persist it through `authorizeWorkPackage`; never infer it from a general request. Only `frontend_code`, `dashboard_integration`, `checkout_payment`, and `testing_upload_gate` may be included. Each included gate still validates its full delivery evidence, then advances through `completeAuthorizedGate` without another confirmation. Customer scope, design/structure, production release or traffic switching, paid-service activation, new cost, destructive work, and scope expansion always require explicit confirmation.

## Gate mapping

| Phase | Gate | Completion evidence |
|---|---|---|
| 1 | `customer_intake` | intake record path |
| 2-3 | `design_and_structure` | design record, page structure, board delivered/postponed |
| 4 | `frontend_code` | files, passing checks, interface contract |
| 5 | `dashboard_integration` | configured slices only; each slice is `DONE`/`SKIP` |
| 6 | `checkout_payment` | always: checkout-flow/local pending order and tests; when payment is enabled: trusted notify/query, exact amount/currency, idempotency, GMV Outbox |
| 7 | `testing_upload_gate` | required checks PASS and soft checks can be `DEFERRED` |
| 8 | `aws_release` | version, architecture-specific target, required zero-create counters, URLs, health, rollback |

The intake delivery stores `siteType` and all five capability booleans. Dashboard and
checkout may be `not_applicable` when capabilities are unnecessary; other
gates can continue with `SKIP` + `SKIP_REASON` when capability-driven.
When `requiresPayment=true`, intake also stores an explicit
`paymentArchitecture` of `fixed-cores` or `legacy-globepay-service`; omission or
another value is invalid.
Product commerce without provider payment records `requiresCart=true`,
`requiresCheckout=true`, and `requiresPayment=false`; its checkout gate runs
the checkout-flow core and skips provider settlement only. Paid booking may set
`requiresCart=false` with checkout and payment true.
Hard checks (security, identity isolation, existing-resource verification, payment integrity, rollback availability, required infrastructure policy) must pass and cannot be deferred.
Other checks may be `DEFERRED` only with explicit approval context.
Child Skills return evidence; only `buyna-website-builder` persists transitions. A work package reduces repeated confirmation, never evidence requirements or authorization for external mutations.

Release target evidence is architecture-specific: EC2 runtime and route for
`shared_ec2_postgresql`; distribution, function/API, and data store identifiers
for `aws_serverless`; distribution and Bucket for `aws_static`; verified target
for retained `external_legacy`.

## Future Skills

Adding a Skill does not alter existing projects. Add incremental work as a Phase 5 slice. If it requires a new approval gate, publish a new `workflowVersion`; never silently rewrite the old gate order. Unknown evidence fields are preserved.
