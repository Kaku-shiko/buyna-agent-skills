# Batch 4 Task 1 Report

## RED evidence

- Command: `node --test packages/buyna-commerce-read-model-core/test/read-model.test.mjs`
- Result: failed as expected before any source file existed.
- Evidence: Node returned `ERR_MODULE_NOT_FOUND` for
  `packages/buyna-commerce-read-model-core/src/index.mjs`; 0 passed, 1 failed.

## GREEN evidence

- First GREEN checkpoint: the initial scope, money, trusted-settlement, metric,
  and public-constant suite passed 9/9 after the minimal implementation.

## Second RED evidence

- Command: `node --test packages/buyna-commerce-read-model-core/test/read-model.test.mjs`
- Result: 16 passed, 5 failed after adding timezone, DST, deterministic ordering,
  cursor, and bounded-read tests.
- Expected failures: non-UTC zones were not implemented and source ordering was
  not yet validated.

- Final package command:
  `npm test --prefix packages/buyna-commerce-read-model-core`
- Final package result: 22 passed, 0 failed. This includes Tokyo boundaries,
  New York DST, zero-fill, negative period net, scope, trusted facts, duplicate
  capture/event, money mutations, inclusive/exclusive bounds, ordering within
  and across pages, cursor loops, and all declared size caps.
- Root regression command: `node --test tests`
- Root regression result: 86 passed, 0 failed.

## Self-review

- Scope stayed inside `packages/buyna-commerce-read-model-core` plus this report.
- The package imports no settlement, inventory, order, GMV, SQL/ORM, AWS,
  chart, frontend, CSS, or UI dependency.
- The same frozen server scope is sent to all four Adapter methods; every fact
  and candidate row is scope-checked before aggregation or output.
- Currency fails closed to JPY, all source money is nonnegative safe integer,
  and only the derived net may be negative.
- Cursor ordering is validated within and across pages before output limits are
  applied. Fact and candidate page/row bounds are enforced independently.
- Local calendar boundaries are converted with `Intl.DateTimeFormat` parts;
  process timezone and display-string parsing are not used.
- Output is deeply frozen, serializable domain data only. No visual labels,
  styling, components, routes, infrastructure, or live actions were added.
