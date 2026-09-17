# CRM contract

Bind each CRM merchant record to unique `project_id + seller_id`, GMV enabled state, client id, connection state, last event time, and last sync error. Store only a credential hash when CRM manages credentials.

Write API: `POST /api/internal/gmv-events`. Prefer `X-Buyna-Client-Id`, `X-Buyna-Timestamp`, and `X-Buyna-Signature`. Verify HMAC, five-minute clock skew, client status, and exact merchant binding before storage. Derive the immutable event id from event type, source system, and provider event id. Return HTTP 202 with `accepted`, `duplicate`, and `id`.

CRM administrator read APIs:

```text
GET /api/internal/crm/gmv/summary
GET /api/internal/crm/gmv/trend
GET /api/internal/crm/gmv/events
```

Bind every result to an authenticated Buyna.ai CRM administrator identity. Merchant administrators have no GMV read access, including seller-scoped access. Keep subscription revenue separate.

The CRM revenue-management page must display project net GMV, gross paid,
completed refunds, paid-order count, merchant contribution, last sync time,
and sync failures. Every accepted event updates this view through the same
ledger aggregation; do not maintain a disconnected manual total.

## Multi-currency receiver requirements

Before enabling CNY delivery, update and verify the receiver schema to accept explicit JPY/CNY, immutable minor-unit amounts, original-payment currency checks and cumulative refund limits. Preserve accepted historical JPY records. Retain completed refund events in the ledger; never delete the original payment to represent a refund.

Use `summarizeGmvByCurrency` for summaries, trends and merchant contributions. Display the ISO currency and scale correctly (CNY 9990 as CNY 99.90; JPY 100 as JPY 100). Never combine mixed-currency totals or apply JPY-specific amount thresholds to CNY. A unified reporting currency requires an explicit rate source, timestamp and rounding policy while retaining original amounts; it is not an automatic conversion in this module.

Verify CNY and JPY payments, partial refunds, mixed-currency summaries, legacy JPY records and signed delivery end to end before setting `acceptedCurrencies` to include CNY. A Skill/package update alone is not evidence that a deployed CRM receiver supports CNY.

Use `createGmvLedger` and the fixed DynamoDB adapter when integrating the existing CRM table. Commit immutable events and per-order revision together; no new table is required. Legacy exclusions return `GMV_LEGACY_RECONCILIATION_REQUIRED`; restore only from verified original payment/refund evidence under a separately recorded recovery operation. Positive small real payments count; amount alone does not identify test data.
