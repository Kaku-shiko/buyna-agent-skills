# CRM contract

Bind each CRM merchant record to unique `project_id + seller_id`, GMV enabled state, client id, connection state, last event time, and last sync error. Store only a credential hash when CRM manages credentials.

Write API: `POST /api/internal/gmv-events`. Prefer `X-Buyna-Client-Id`, `X-Buyna-Timestamp`, and `X-Buyna-Signature`. Verify HMAC, five-minute clock skew, client status, and exact merchant binding before storage. Derive the immutable event id from event type, source system, and provider event id. Return HTTP 202 with `accepted`, `duplicate`, and `id`.

Read APIs:

```text
GET /api/merchant/gmv/summary
GET /api/merchant/gmv/trend
GET /api/merchant/gmv/events
```

Bind every result to authenticated identity. CRM administrators may aggregate all merchants; merchant administrators may read only their seller. Keep subscription revenue separate.

The CRM revenue-management page must display project net GMV, gross paid,
completed refunds, paid-order count, merchant contribution, last sync time,
and sync failures. Every accepted event updates this view through the same
ledger aggregation; do not maintain a disconnected manual total.
