# Task 1 Report — Inventory Reservation Core

## Outcome

Implemented `@buyna/inventory-core` as a framework-neutral, server-scoped
inventory reservation state machine. It owns validation, legal transitions,
event/reservation idempotency, locked-stock availability calculation, and
serializable results. It contains no SQL, ORM, UI, AWS, provider transport, or
live configuration.

## Changed Files

- `packages/buyna-inventory-core/package.json`
- `packages/buyna-inventory-core/src/index.mjs`
- `packages/buyna-inventory-core/test/inventory.test.mjs`
- `.superpowers/sdd/2026-08-25-fixed-state-logic-batch-2/task-1-report.md`

## Red-Green Evidence

1. Initial RED:
   `node --test packages/buyna-inventory-core/test/inventory.test.mjs`
   failed with `ERR_MODULE_NOT_FOUND` because `src/index.mjs` did not exist.
2. Initial GREEN: the first 9 validation and transition tests passed after the
   minimum module implementation.
3. Exact-once RED: the expanded suite had 13 passing and 3 failing tests. The
   failures were `INVENTORY_EVENT_INCOMPLETE` for a second retry of a new event
   on an already-reserved, already-committed, or already-released reservation.
4. Exact-once GREEN: the transaction-bound event completion contract made all
   16 tests pass without another inventory mutation.

## Verification

- `npm test --prefix packages/buyna-inventory-core` — 16/16 passed.
- `node --check packages/buyna-inventory-core/src/index.mjs` — passed.
- Root tests via `node --test <all tests/*.test.mjs>` — 30/30 passed.
- `powershell -ExecutionPolicy Bypass -File .\scripts\validate.ps1` — expected
  Batch 2 ordering failure: `repository-manifest package inventory mismatch`.
  Task 5 owns manifest registration after all four producer modules exist.
- Self-review found no merchant identity, URL, credential, stylesheet, SQL/ORM,
  AWS mutation, or live-system change in the task files.

## Adapter Contract And Concern

`store.transaction(work)` must keep event claim, reservation identity lock,
stock row lock, and reservation mutation in the same database transaction.
`claimReservationEvent` returns the current locked reservation and a
transaction-bound `complete(result)` function for an idempotent no-mutation
completion. Duplicate claims return their persisted event result. A real
Adapter that releases the stock/reservation lock before `work` completes would
not preserve the oversell guarantee and must be rejected during integration.
