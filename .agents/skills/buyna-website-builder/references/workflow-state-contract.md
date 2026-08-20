# Workflow State Contract

`packages/buyna-workflow-state-core` is the authority for stop and continue decisions.

## Storage

- Snapshot: `workflow/workflow-state.json`
- Append-only events: `workflow/history/workflow-events.jsonl`
- Delivery evidence: `workflow/records/`

Never store credentials, payment secrets, personal form values, or environment variables here.

Store `configuration.interactionMode` as `team` or `developer`. The mode controls presentation only; gate status, delivery evidence, and approval transitions remain identical. Persist later mode changes through `setInteractionMode`, never by editing JSON.

After loading state, call `getInteractionPolicy({state})`. This is the canonical presentation contract. A child Skill returns structured evidence to the Builder; it must not bypass the policy by printing raw technical output directly to a team-mode user.

## Gate mapping

| Phase | Gate | Completion evidence |
|---|---|---|
| 1 | `customer_intake` | intake record path |
| 2-3 | `design_and_structure` | design record, page structure, board delivered/postponed |
| 4 | `frontend_code` | files, passing checks, interface contract |
| 5 | `dashboard_integration` | every configured slice, frontend/backend files, passing checks |
| 6 | `checkout_payment` | pending order, responsive routing, verified status sync, idempotency, GMV Outbox, tests |
| 7 | `testing_upload_gate` | PASS and passing checks |
| 8 | `aws_release` | version, architecture-specific target, all four zero-create counters, URLs, health, rollback |

The intake delivery stores `siteType` and all five capability booleans. Dashboard and
checkout/payment may be `not_applicable` when capabilities are unnecessary; other
gates can still continue with skip reasons that are capability-driven.  
Every verification entry must pass; one passing result cannot hide a failure.  
Child Skills return evidence; only `buyna-website-builder` persists transitions.

Release target evidence is architecture-specific: EC2 runtime and route for
`shared_ec2_postgresql`; distribution, function/API, and data store identifiers
for `aws_serverless`; distribution and Bucket for `aws_static`; verified target
for retained `external_legacy`.

## Future Skills

Adding a Skill does not alter existing projects. Add incremental work as a Phase 5 slice. If it requires a new approval gate, publish a new `workflowVersion`; never silently rewrite the old gate order. Unknown evidence fields are preserved.
