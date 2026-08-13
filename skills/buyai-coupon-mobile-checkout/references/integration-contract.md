# Coupon and mobile checkout contract

## Required order state

Persist `project_id`, `seller_id`, public order identity, item and buyer snapshots, subtotal, shipping, tax, discount, final amount, coupon identity and snapshot, reservation identity, selected payment method, provider identity, currency, status, expiry, and paid time.

Require:

```text
final amount = subtotal + shipping + tax - discount
final amount > 0
provider requested amount = persisted final amount
```

One order may use at most one coupon.

## Transaction boundaries

Pending-order preparation must either create both the immutable order and coupon reservation or create neither. Lock coupon capacity and enforce database constraints within the transaction.

After verified `PAY_SUCCESS`, one transaction must record the idempotency event, lock the order and reservation, validate amount/currency/ownership, mark paid, redeem the coupon, apply inventory, create the paid-customer effect, and write the GMV Outbox event. CRM delivery happens only after commit.

Verified failed, cancelled, or expired unpaid status releases a reserved coupon once. Refunds remain auditable and do not restore coupon capacity unless the project has an explicitly approved policy.

## Buyer next action

Use the fixed GlobePay planner with trusted server-side context:

| Context | Required result |
| --- | --- |
| Enabled matching wallet browser | `invoke_jsapi` |
| Ordinary mobile browser | H5 `redirect` |
| Desktop wallet payment | `show_qr` or approved hosted page |
| Bank/card on any device | hosted-card `redirect` |

The order-confirmation page shows subtotal, discount, shipping/tax, final amount, explicit selected method, and one final payment button. Disable duplicate submission while creating the order.

## Trusted completion

Browser return restores the local order-result page and triggers a bounded server query; it never writes `paid`. Accept notify/query/reconciliation only after signature, provider-order, ownership, amount, currency, and replay checks.
