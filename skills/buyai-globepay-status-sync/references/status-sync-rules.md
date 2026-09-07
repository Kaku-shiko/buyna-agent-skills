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

1. Resolve the scoped local order and verify exact amount/currency.
2. Reconcile financial status with the architecture-selected writer.
3. For paid: preserve paid time, upsert payment/customer, reconcile inventory/capacity once.
4. For late paid after failed/expired: use the fixed late-payment reconciliation contract; persist fulfillment review for released resources that cannot be recovered.
5. For completed refund: preserve paid history, persist partial/full status and cumulative refund, and write only the new refund delta. Do not deduct stock or create a new paid customer.
6. Store payment/refund audit and GMV outbox in the same idempotent transaction.
7. Re-read persisted results before reporting success.

Mobile H5/JSAPI return:

- Return to an HTTPS local order-result route containing only a safe local
  order reference.
- Restore the pending order and selected payment method.
- Query provider status through the server; never trust query-string status.
- Show pending when notify/query has not confirmed success.
- Allow a bounded automatic query and one user-triggered refresh.
- Treat wallet close or payment cancellation as pending/failed according to
  verified provider state, not as paid.

Repair rules:

- `pending_payment + PAY_SUCCESS -> paid`
- `expired + PAY_SUCCESS -> paid`
- `failed + PAY_SUCCESS -> paid`
- `paid/partially_refunded + completed partial refund -> partially_refunded`
- `paid/partially_refunded + completed full refund -> refunded`
- paid always beats local expiration
- refund status follows the verified cumulative refunded amount and preserves paid audit trail

Seller UI:

- One page-level silent refresh button for MVP.
- No per-row refresh buttons.
- CSV and dashboard totals must read the same verified paid/refunded records.
- Paid/refunded records are not deletable.
