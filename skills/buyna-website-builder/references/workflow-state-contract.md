# Workflow State Contract

`packages/buyna-workflow-state-core` is the authority for stop and continue decisions.

## Storage

- Snapshot: `workflow/workflow-state.json`
- Append-only events: `workflow/history/workflow-events.jsonl`
- Delivery evidence: `workflow/records/`

Never store credentials, payment secrets, personal form values, or environment variables here.

## Gate mapping

| Phase | Gate | Completion evidence |
|---|---|---|
| 1 | `customer_intake` | intake record path |
| 2-3 | `design_and_structure` | design record, page structure, board delivered/postponed |
| 4 | `frontend_code` | files, passing checks, interface contract |
| 5 | `dashboard_integration` | every configured slice, frontend/backend files, passing checks |
| 6 | `checkout_payment` | pending order, responsive routing, verified status sync, idempotency, GMV Outbox, tests |
| 7 | `testing_upload_gate` | PASS and passing checks |
| 8 | `aws_release` | version, approved instance, zero new EC2, URLs, health, rollback |

Only Dashboard and checkout/payment may be `not_applicable`, with a reason. Child Skills return evidence; only `buyna-website-builder` persists transitions.

## Future Skills

Adding a Skill does not alter existing projects. Add incremental work as a Phase 5 slice. If it requires a new approval gate, publish a new `workflowVersion`; never silently rewrite the old gate order. Unknown evidence fields are preserved.
