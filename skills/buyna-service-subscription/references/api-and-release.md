# Subscription integration contract - candidate 0.2.0

## API

- Official merchant: `GET /api/merchant/subscription-state`, authenticated by the existing merchant session.
- Merchant server: `GET /api/internal/subscription-state?sellerId=...`, authenticated by the existing seller-scoped read token. Only server-registered identity pairs are accepted.
- Cancellation: existing `POST /api/merchant/subscription-cancel` or the scoped internal equivalent. New clients send `x-buyna-subscription-api: 1.1`, `expectedVersion` from the selected row, `requestId` and explicit `confirm:true`. Preserve the current CSRF/origin requirements.
- Success returns the operation result and `snapshot`; if the write committed but the follow-up read failed, the API returns `STATE_RELOAD_REQUIRED` and `operationCommitted:true`. Read to recover; do not assume the write failed.
- Direct hosted payment pilot: merchant server calls `POST /api/internal/subscription-payment` with scoped checkout authority. `action:context` returns only the owned saved billing fields. `action:start` requires fresh snapshot version, exact gross amount, stable request ID, company/contact/email, explicit consent, language and selected term. Reuse official initial/extension services and their locks; never use storefront payment credentials. Currently restricted to the registered EC pilot.
- Direct checkout returns only an approved provider `checkoutUrl` (or a verified already-paid result). The browser goes to the provider in the same tab without an intermediate official-site form. The fixed official return endpoint queries provider state before returning to the registered merchant backend; query parameters cannot mark a subscription paid or choose a redirect destination. This is hosted checkout, not embedded card collection.

Snapshots contain `apiVersion`, `identity`, `stateVersion`, `fetchedAt`, `review`, `subscription`, `fees`, `service`, `payment`, `renewal`, `billingHistory`, `rows`, and `plans`. `stateVersion` fingerprints persisted input; `rows[].stateVersion` is the selected record's expected version. A new `fetchedAt` alone is not a business revision. Amounts are integer JPY; unknown values are null, not zero.

Only masked card metadata is returned. A stored agreement identifier is labelled `RECORDED`, not live provider re-verification. Payment state requires ledger evidence; opening checkout never proves payment. Invoice availability is not proof that an email was delivered.

The reader discovers owned keys then transactionally reads their values. It fails explicitly beyond the current 100-item transaction limit instead of truncating financial history. A separate paginated billing-history API and scalable merchant index are required before exceeding this pilot limit.

## Adapter

The merchant browser calls same-origin protected routes. Its backend derives identity from trusted authentication and the observed host; the official service validates the registered identity and scoped token again. Server tokens must never be in `VITE_*`, the manifest, URL, localStorage, service worker cache or front-end source.

Use `src/client.mjs` for refresh ordering, current-version checks and cancellation. Wire invalidation to the current page, focus/online and bounded background refresh. Do not represent current polling as SSE/WebSocket or instant cross-device notification.

## Acceptance gates

1. Preserve approved resources, IDs, original dates and signed workflow authority.
2. Inspect API health and module/source digests; run local and adapter tests.
3. Deploy internal EC pilot only with rollback and unchanged storefront/order paths.
4. Verify first payment, duplicate submit/callback, extension, period/schedule alignment, cancellation, failure recovery, alerts and receipt/PDF.
5. Run legacy migration dry run. Unknown dates remain review; no charge, fake transaction, notification or enforcement.
6. Separate explicit notifications/enforcement activation from migration.
7. Release pilot, first merchants, remaining verified merchants and new-site template in batches. Record version and failed/retried deployments.

The 2026-10-17 bounded pilot deployed the canonical API, atomic CRM expiry/schedule coordinator, revision-aware worker and EC adoption. The CRM command is `POST /api/crm/subscription-command`, protected by official administrator authentication and same-origin validation. Supply the registered seller, selected subscription ID, record version, request ID, absolute end timestamp and reason. Pending provider attempts block date changes; disabled automatic renewal stays disabled. This is not a provider charge endpoint.

Still pending: provider-owned payment lifecycle acceptance, durable async invalidation and alert delivery, scalable history/indexing, and cross-merchant migration. Browser pilot checks used fixture API data even when loading live static assets. Installing this Skill does not complete those gates; consult the project release report for current artifact evidence rather than treating a historical pilot as proof for a new merchant.
