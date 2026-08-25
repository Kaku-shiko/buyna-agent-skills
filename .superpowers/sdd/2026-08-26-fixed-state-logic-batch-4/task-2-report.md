# Task 2 implementation report

## Scope

- Added `packages/buyna-delivery-state-core` only.
- No Skill, manifest, UI, AWS, live provider, database, or deployment changes.

## RED evidence

1. Initial contract RED
   - Command: `node --test packages/buyna-delivery-state-core/test/delivery-state.test.mjs`
   - Result: failed with `ERR_MODULE_NOT_FOUND` for `src/index.mjs`, exactly because the fixed module did not exist.
2. Persisted-row redaction RED
   - Command: `node --test packages/buyna-delivery-state-core/test/delivery-state.test.mjs`
   - Result: 14 passed, 1 failed; the Store-row poison fixture proved an undocumented `receipt.token` was not rejected.
   - Production change: terminal receipt/failure validation now re-applies the public allowlists when Store rows are read.

## GREEN evidence

- Command: `npm test --prefix packages/buyna-delivery-state-core`
- Result: 16 tests passed, 0 failed.
- Command: `git diff --check`
- Result: clean.
- Command: `node --check` for every module in `packages/buyna-delivery-state-core/src`
- Result: clean.

## Implemented behavior

- Deterministic canonical source events and delivery/idempotency/request keys.
- Exact deep-frozen DeliveryRecord and attempt shapes with scoped Store validation.
- `pending -> sending -> delivered|failed`, scheduled retries, and same-attempt lease recovery.
- Stable provider request identity across retries and provider-acceptance crash replay.
- Recipient/template/provider business failures are the only failures normalized into delivery state.
- Store/transaction/read/lock/OCC/save failures propagate unchanged and never cross the business-error boundary.
- Receipt/failure redaction, transient recipient handling, minimal provider metadata, and exact frozen merchant scope.
- Transactional source-event recovery behavior for commit-before-reconciliation and rollback.

## Self-review

- Reviewed all new public operations against the approved Task 2 brief.
- Confirmed no address, rendered message, thrown text, raw provider body, token, or secret is persisted.
- Confirmed failed `saveDelivered` leaves the persisted row at `sending`; expired recovery reuses the same attempt and request key, and the provider idempotency fixture records one external effect.
- Confirmed concurrent work outside Task 2 was not staged or modified by this task.

## Concerns

- None within Task 2 scope. SQL/ORM locking, source-event paging, provider implementations, and project-owned templates remain deliberate project adapters.
