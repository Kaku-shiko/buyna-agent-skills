# Delivery State Adapter Contract

Use this contract only when the Builder route explicitly selects
`buyna-delivery-state-core` for an approved `order_notification` or
`booking_notification`. Notification failure never changes order, booking, or
payment success.

## Transactional Source Event

Inside the order/booking domain transaction, write the immutable source event
created by `createNotificationSourceEvent`. It carries the frozen
`projectId + sellerId`, deterministic `sourceEventId`, domain IDs, recipient
reference, template key, locale, channel, and safe payload. A reconciler reads
committed source events and calls `reconcileSourceEvent`; this recovers a crash
after the domain commit and creates one delivery through the stable digest and
request key. Do not enqueue best-effort work only after commit.

## Store Adapter

The project Store implements `transaction(work)` and
`getDelivery({ scope, deliveryId })`. Its transaction object implements:

- `getBySourceEventForUpdate({ scope, sourceEventId })`
- `createDelivery({ scope, record })`
- `getDeliveryForUpdate({ scope, deliveryId })`
- `saveDelivery({ scope, expectedVersion, record })`

Every call and row validates the same frozen scope. Transactions, row locks, OCC,
indexes, due-page queries, and queue infrastructure remain project-owned. A due
worker may page pending, retry-ready, and expired-sending IDs, then call the
fixed core; it never mutates records directly.

## Business Adapters And Worker

- `RecipientAdapter.resolve({ scope, recipientRef, channel })` returns the
  transient server-side `{ address }`.
- `TemplateAdapter.render({ scope, kind, templateKey, locale, payload })`
  returns allowlisted `subject`, `text`, and/or `html`.
- `EmailProviderAdapter.send({ scope, requestKey, recipient, message, metadata })`
  and `SMSProviderAdapter.send({ scope, requestKey, recipient, message, metadata })`
  implement the channel Provider Adapter and receive the stable request key.

The worker calls `dispatch`. State is `pending -> sending -> delivered|failed`;
attempt count, retry time, lease, and current attempt are fixed. After restart,
an expired `sending` record resumes the same attempt ID and request key, so the
provider effect remains idempotent. Persist only the safe allowlisted provider
receipt (`providerMessageId`, `acceptedAt`, optional `providerStatus`) or fixed
failure code/retryability; redact all other provider data.

The catch boundary is exact: Recipient, Template, Email/SMS Provider business
errors may become `failed`. Store, transaction, lock, OCC, read, or save errors
propagate unchanged and leave the record `sending` for lease recovery. In
particular, provider acceptance followed by `saveDelivery` failure must retry
with the same request key.

Browser code never resolves recipients, calls providers, supplies ownership, or
marks delivery success. Provider secrets are not stored in messages, and
customer payment/card data is never inserted into templates.
