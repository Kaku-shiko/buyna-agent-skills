# Service Adapter Contract

Use `scripts/globepay-service.mjs` instead of regenerating checkout and payment-sync orchestration.

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
`providerOrderId`, `resultCode`, and the provider payload. Query or reconciliation
requires `queryOrder({ sellerId, providerOrderId })` and the same normalized
result shape.

Keep partner and credential codes in the server environment. Never return them
from an adapter.

## Required Verification

Test pending-before-provider ordering, seller-scoped lookup, invalid provider
notification, provider failure with the pending order preserved, duplicate
event handling, paid/refund transitions, one-time stock/capacity effects, and a
post-write read of the saved order.
