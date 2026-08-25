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
3. Independent review fix RED
   - Command: `node --test packages/buyna-delivery-state-core/test/delivery-state.test.mjs`
   - Result: 16 passed, 4 failed.
   - Failures proved: integer-like object keys were reordered by `JSON.stringify`; a forged `sourceEventId` reached Store I/O; poisoned intent/digest/lease rows reached dispatch; and poisoned retry timing was accepted.

## GREEN evidence

- Command: `npm test --prefix packages/buyna-delivery-state-core`
- Result after review fixes: 20 tests passed, 0 failed.
- Command: `git diff --check`
- Result: clean.
- Command: `node --check` for every module in `packages/buyna-delivery-state-core/src`
- Result: clean.
- Command: `node --test tests`
- Result after review fixes: 86 repository tests passed, 0 failed.

## Implemented behavior

- Deterministic canonical source events and delivery/idempotency/request keys.
- Exact deep-frozen DeliveryRecord and attempt shapes with scoped Store validation.
- `pending -> sending -> delivered|failed`, scheduled retries, and same-attempt lease recovery.
- Stable provider request identity across retries and provider-acceptance crash replay.
- Recipient/template/provider business failures are the only failures normalized into delivery state.
- Store/transaction/read/lock/OCC/save failures propagate unchanged and never cross the business-error boundary.
- Receipt/failure redaction, transient recipient handling, minimal provider metadata, and exact frozen merchant scope.
- Transactional source-event recovery behavior for commit-before-reconciliation and rollback.
- Direct Unicode code-point canonical serialization, including integer-like keys, plus own-symbol rejection.
- Deterministic source identity verification before Store I/O and full persisted-row invariant verification before any delivery effect.

## Self-review

- Reviewed all new public operations against the approved Task 2 brief.
- Confirmed no address, rendered message, thrown text, raw provider body, token, or secret is persisted.
- Confirmed failed `saveDelivered` leaves the persisted row at `sending`; expired recovery reuses the same attempt and request key, and the provider idempotency fixture records one external effect.
- Confirmed concurrent work outside Task 2 was not staged or modified by this task.

## Concerns

- None within Task 2 scope. SQL/ORM locking, source-event paging, provider implementations, and project-owned templates remain deliberate project adapters.
