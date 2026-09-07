# Settlement and late-payment persistence

Use `createSettlementModule` as the only fixed-architecture status writer.
Provider verification supplies trusted server scope, local order ID, original
order amount/currency, event ID and normalized status. A refund event additionally
supplies cumulative completed `refundAmount`, not the submitted refund amount.

The store transaction owns the event claim, locked order, payment, order status,
inventory/coupon effects, customer and GMV outbox. Every write rolls back together
on technical errors. `getOrderForSettlement` returns `amount` (map order-core's
`total`), currency, status, server scope, and persisted `refundedAmount` (initially
zero). Preserve the original payment timestamp during refund/repair.

Normal paid events call existing `applyInventoryOnce` and optional `applyCouponOnce`.
Failed/expired orders may later receive verified paid events. Those events use:

- `reconcileLatePayment({order,verified,capabilities})` in the same transaction:
  inspect previously committed/released stock and coupon effects under locks.
  Preserve committed effects. Reacquire only genuinely available resources and
  commit at most once per order, never directly commit a released reservation.
  Return `{status:'fulfilled'}` when reconciled, or
  `{status:'review_required',reason:'STOCK_UNAVAILABLE'}` (or another stable code)
  for a business shortage. Use a savepoint or preflight all locks to avoid partial
  inventory/coupon changes before returning a shortage.
- `recordFulfillmentReview({order,verified,reason})`: persist a unique per-order
  review/exception record in the transaction. The payment still becomes paid;
  expose the fulfillment exception to authorized merchant operations. Do not
  silently ship, deduct again, or claim an automatic refund.

These two methods are required for late payment. An absent Adapter is an explicit
integration error, not a reason to guess that stock was restored. Technical DB
failures roll back and retry the same event; business shortages return review.
Never conflate financial payment state with fulfillment readiness.

Refunds retain paid history. `recordRefund` receives `refundDelta` and
`cumulativeRefundAmount`, persists the cumulative value, and records only the
delta in refund/GMV effects. Full refunds must equal paid amount; partial refunds
must be smaller. Refund requests/acceptance are not completion events.

Validate late success after both failed and expired state, replay, stock shortage,
coupon release, partial/full refund boundaries, rollback and exact amount/currency.
