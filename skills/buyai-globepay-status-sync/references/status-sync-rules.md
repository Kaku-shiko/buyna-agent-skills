# GlobePay Status Sync Rules

Provider order creation is not payment success.

Required local fields:

- local order id
- `provider_order_id`
- `provider_partner_code`
- payment method
- amount/currency
- buyer/customer fields
- product/service/SKU snapshot
- status
- raw provider response

Notify and return query must call one idempotent writer:

1. Find order by provider order id.
2. If already paid/refunded, exit safely unless provider confirms a later refund.
3. Set `orders.status`.
4. Set `paid_at` from provider/local payment time.
5. Upsert payment attempt by provider id.
6. Upsert paid customer/booking by local order id.
7. Deduct stock or confirm capacity once.
8. Store raw provider data for audit.

Repair rules:

- `pending_payment + PAY_SUCCESS -> paid`
- `expired + PAY_SUCCESS -> paid`
- `failed + PAY_SUCCESS -> paid`
- `paid + provider refund success -> refunded`
- paid always beats local expiration
- refund success after paid sets refunded and preserves paid audit trail

Seller UI:

- One page-level silent refresh button for MVP.
- No per-row refresh buttons.
- CSV and dashboard totals must read the same verified paid/refunded records.
- Paid/refunded records are not deletable.
