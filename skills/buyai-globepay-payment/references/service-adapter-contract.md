# Legacy-Only Service Adapter Contract

Use this reference only when an existing project explicitly records the legacy
service architecture. Maintain that project through
`scripts/globepay-service.mjs`; new fixed-state builds use checkout-flow core,
project transport/verification Adapters, and settlement core.

## Public Interface

```js
const service = createGlobepayService({ store, provider });
await service.createCheckout(input);
await service.syncPaymentStatus(input);
```

Generate only the project-specific `store`, `provider`, route handlers, and schema migration.

## Store Adapter

Checkout requires `createPendingOrder(input)` and `attachProviderOrder(input)`.
Status sync requires `withTransaction(work)`. Its transaction object must expose
`getOrderByProviderId`, `claimPaymentEvent`, `applyPaymentTransition`, and
`getOrderById`.

Every lookup and write must enforce the supplied `sellerId`. Implement
`claimPaymentEvent` with a unique database constraint on the idempotency key.
Implement all returned effects in `applyPaymentTransition` inside the same
transaction. Do not silently ignore an unknown effect.

## Provider Adapter

Checkout requires `createOrder({ localOrder, checkout })`. Return a real
`providerOrderId` and provider-issued `nextAction`.

Notification sync requires `verifyNotification(payload)`. Verify authenticity
according to the approved GlobePay protocol before returning
`providerOrderId`, `resultCode`, and the provider payload. Before a paid
transition, call `queryOrder({ sellerId, providerOrderId })`; its normalized
result supplies `providerOrderId`, `resultCode`, integer `amount`, `currency`,
and provider payload. The service reconciles that Query result to the local
order's exact amount and currency before claiming or applying payment effects.

Keep partner and credential codes in the server environment. Never return them
from an adapter.

## Required Verification

Test pending-before-provider ordering, seller-scoped lookup, invalid provider
notification, mandatory Query after notification, amount/currency mismatch,
provider failure with the pending order preserved, duplicate event handling,
paid/refund transitions, one-time stock/capacity effects, and a post-write read
of the saved order.

## Refund reconciliation

The legacy normalized Query result supplies original order `amount`, `currency`,
and cumulative completed `refundAmount`. Local orders persist `refundedAmount`
(initially zero). Partial refunds become `partially_refunded`; full refunds must
equal the paid amount. Missing/out-of-range amounts block mutation. The writer
receives `refundDelta` and `cumulativeRefundAmount`; persist both refund history
and the cumulative order amount atomically. Replay of the same cumulative amount
has no refund effects. A later PAY_SUCCESS must not undo partial/full refunds.
Refund submission/acceptance is never a completed refund.

## Provider order handoff

Keep local order ID, merchant order ID (`partner_order_id`) and provider system
order ID separate. Hosted payment URLs use the merchant order ID. In the server
provider Adapter call `buildProviderPayUrl` with the actual create response, HTTP
status, endpoint family, merchant order ID and server-selected credentials. It
checks the returned pay_url and freshly signs it; do not construct a URL from
the provider system ID. Existing-order responses require a trusted Query result
matching merchant, amount/currency and pending status before reuse. JSAPI uses
its own invocation payload rather than this hosted URL helper.

`attachProviderOrder` must persist and return the canonical local order ID. A null
attachment is an error. Return a real provider-issued nextAction only after local
order and provider binding persistence; preserve the same order for retries.
