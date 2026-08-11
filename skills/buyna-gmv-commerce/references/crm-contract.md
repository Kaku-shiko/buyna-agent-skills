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
