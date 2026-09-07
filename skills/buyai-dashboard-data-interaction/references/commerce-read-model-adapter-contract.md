# Commerce Read Model Adapter Contract

Use this contract only when the authoritative Builder route selects
`buyna-commerce-read-model-core` for the approved Dashboard overview slice.
Inventory, order, booking, customer, and paid-customer lists keep their existing
fixed cores and project APIs.

## Request Boundary

Create the core with the fresh request-local immutable merchant context:
`createCommerceReadModel({ projectId, sellerId, source, clock })`. The server
derives both IDs from trusted auth plus the current observed host. Browser
`projectId`, `sellerId`, order status, amount, or settlement claims are never
authority.

`getOverview` accepts JPY, an inclusive start/exclusive end UTC range, an IANA
timezone, and `day` or `month` buckets. Day ranges are capped at 93 buckets and
month ranges at 36. Output is exactly `scope`, `window`, `currency`, `metrics`,
`trends`, `lowStock`, and `recentOrders`. Metrics contain `pendingOrders`,
`paidOrders`, `refundedOrders`, `pendingAmount`, `grossAmount`, `refundAmount`,
and `netAmount`; negative period `netAmount` is valid when refunds exceed new
captures. Recent orders expose payable, captured, refunded, and net paid amounts
without changing their meaning.

## Source Adapter

Implement these four project methods:

- `listCurrentPendingPage({ scope, currency, asOf, cursor, limit, order })`
- `listSettlementFactPage({ scope, currency, from, to, cursor, limit, order })`
- `listLowStockCandidatePage({ scope, threshold, cursor, limit, order })`
- `listRecentOrderCandidatePage({ scope, cursor, limit, order })`

Every returned fact carries the exact `projectId + sellerId`. Pages are fixed at
at most 200 rows and return `{ items, nextCursor }`. The Adapter must honor the
provided stable order and cursor; it cannot pre-limit or reorder an arbitrary
query result. The core validates order, cursor loops, 10,000 fact rows/50 fact
pages, 2,000 candidate rows/10 candidate pages, output limits, and bucket spans
with stable `READ_MODEL_*` errors. SQL, ORM selection, indexes, query plans, and
cursor encoding belong to the project Adapter.

Current pending facts contain only `pending_payment`. Capture/refund facts must
come from provider-verified trusted settlement records and use
`settlementSource: trusted_settlement`; public redirects and browser data cannot
create them. The time window is inclusive start and exclusive end. Local IANA
day/month boundaries are represented by `startUtc` and `endUtc` instants.

## Presentation Boundary

Pass the fixed output to a generated project ChartAdapter, for example
`toProjectChartSeries({ trends, locale, labels })`. The fixed package imports no
chart library. Generate every chart, component, label, color, font, spacing,
responsive behavior, and CSS from the approved project design.

This is ordinary merchant sales reporting. CRM GMV events, keys, labels, and
endpoints are prohibited and must never be exposed through this read model.

Recent-order candidates include `failed` and `expired` as well as pending, paid,
partial/full refund and cancelled states. Preserve those records; they must not
crash the overview. Financial totals still come only from trusted settlement facts.
