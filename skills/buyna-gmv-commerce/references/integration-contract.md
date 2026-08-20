# Merchant integration contract

The merchant PostgreSQL order/payment record is the transaction source of truth. CRM is an analytical projection. Record `PAYMENT_CAPTURED` only after trusted provider notify/query confirms success. Record `REFUND_COMPLETED` only after provider-confirmed completion.

Use a positive integer JPY amount: `items + shipping + tax - approved discounts = charged amount`.

Create a project `gmv_outbox` migration with server-owned `project_id`, `seller_id`, immutable event payload, `sent_at`, retry fields, and uniqueness on `event_type + source_system + provider_event_id`.

Implement only this project Adapter:

```ts
interface GmvOutboxAdapter {
  listPending(input: { limit: number }): Promise<OutboxRecord[]>;
  markSent(input: SentResult): Promise<void>;
  markFailed(input: FailedResult): Promise<void>;
}
```

Use `paymentCaptured(...)` or `refundCompleted(...)` to create the payload. Insert it inside the same transaction that commits the paid/refunded state. Run `sendPendingGmvEvents(...)` outside checkout.

Keep `BUYNA_GMV_API_URL`, client identity/secret, project id, seller id, and merchant name server-side. For an approved transitional bearer endpoint use `GMV_INGESTION_SECRET`; never distribute one bearer secret across unrelated merchant backends.

The Outbox and worker are server-only. Do not add GMV read routes to the merchant backend, and do not expose GMV data or credentials to the merchant storefront, merchant admin, public API, browser bundle, or exports. Merchant order/payment/refund screens may retain their ordinary operational records without GMV labels or GMV aggregation.
