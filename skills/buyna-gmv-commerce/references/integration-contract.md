# Merchant integration contract

The merchant PostgreSQL order/payment record is the transaction source of truth. CRM is an analytical projection. Record `PAYMENT_CAPTURED` only after trusted provider notify/query confirms success. Record `REFUND_COMPLETED` only after provider-confirmed completion.

Require explicit provider-confirmed `currency` (JPY or CNY) and a positive safe integer amount in minor units (JPY yen, CNY fen): `items + shipping + tax - approved discounts = charged amount`.

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

Keep `BUYNA_GMV_API_URL`, client identity/secret, project id, seller id, and merchant name server-side. Resolve the CRM base URL from that trusted configuration rather than a Skill-embedded host. For an approved transitional bearer endpoint use `GMV_INGESTION_SECRET`; never distribute one bearer secret across unrelated merchant backends.

The Outbox and worker are server-only. Do not add GMV read routes to the merchant backend, and do not expose GMV data or credentials to the merchant storefront, merchant admin, public API, browser bundle, or exports. Merchant order/payment/refund screens may retain their ordinary operational records without GMV labels or GMV aggregation.


## Currency contract (core 0.2)

Storefront currency does not determine GMV currency. A CNY display with an actual JPY payment produces JPY GMV; an actual CNY payment produces CNY GMV. Read the confirmed provider currency and amount, verify both against the immutable order payment snapshot, and preserve them on the outbox event. Amounts are minor units: CNY 99.90 = 9990; JPY 100 = 100. Never infer currency from the ambiguous yen symbol or apply an implicit exchange rate.

Call `refundCompleted` with `originalPayment` and `completedRefundAmount` loaded under a transaction lock. Currency, seller, project and order must match; deduplicate first. Keep historical explicitly JPY events unchanged. Do not silently default missing event currencies.

Upgrade producer adapters with core 0.2. Configure the client's server-owned `acceptedCurrencies` only after the CRM receiver supports them. The default remains JPY-only for legacy endpoint compatibility; CNY events stay pending with `GMV_ENDPOINT_CURRENCY_UNSUPPORTED` until receiver verification. This must not mark the merchant payment channel as disabled or fail checkout.
