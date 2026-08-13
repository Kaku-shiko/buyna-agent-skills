# Coupon project contract

## Supported coupon definitions

`percentage_code`:

- `code`: normalized with NFKC, trim, and uppercase.
- `percentage_bps`: integer basis points; `1000` means 10%.
- `minimum_subtotal`: optional integer minor units.
- `maximum_discount`: optional integer minor units.

`fixed_threshold`:

- `discount_amount`: positive integer minor units.
- `threshold_quantity`: optional positive integer.
- `threshold_amount`: optional positive integer minor units.
- `threshold_operator`: `AND` or `OR`; require at least one threshold.
- `application_mode`: `manual` or `automatic`.

Common lifecycle: `draft`, `active`, `paused`, `expired`, `archived`.

## PostgreSQL model

Generate tables using the approved project schema and migration system:

- `coupons`: definition, lifecycle, limits, `project_id`, `seller_id`, timestamps, and archive marker.
- `coupon_reservations`: coupon, order, server-derived customer key, `reserved/redeemed/released`, expiry, amounts, snapshot, provider event key, and timestamps.
- Order columns or JSON snapshot: coupon identity, rule snapshot, subtotal, discount, and final total.

Require a scoped unique index for percentage codes:

```text
(project_id, seller_id, normalized_code)
```

Require one reservation per scoped order and one provider event key per scoped redemption. Use foreign keys compatible with the existing order/coupon ID types.

## Fixed store Adapter

Implement these methods with parameterized SQL and server-owned scope:

```text
transaction(work)
getCoupon({ scope, couponId, code })
getCouponForUpdate({ scope, couponId, code })
getReservationByOrderId({ scope, orderId })
countCouponUsage({ scope, couponId, customerKey })
createReservation(input)
getReservationForUpdate({ scope, reservationId })
markReservationRedeemed(input)
markReservationReleased(input)
```

`getCouponForUpdate` and `getReservationForUpdate` must lock the selected row. Count active reservations and redemptions inside the same transaction before insertion. Database constraints must remain the final concurrency guard.

## API surface

Merchant-authorized:

```text
GET    /api/admin/coupons
POST   /api/admin/coupons
GET    /api/admin/coupons/:id
PATCH  /api/admin/coupons/:id
POST   /api/admin/coupons/:id/activate
POST   /api/admin/coupons/:id/pause
POST   /api/admin/coupons/:id/archive
```

Storefront:

```text
GET  /api/storefront/coupons/available
POST /api/checkout/coupons/validate
POST /api/orders
```

Validation is preview-only. Order creation must repeat catalog, subtotal, item-count, coupon, limits, and final-total validation.

## Customer key

For logged-in customers, use a stable server-owned customer ID. For guests, derive a non-reversible key from normalized approved checkout identity plus a server secret. Never expose the secret or raw hash input, and do not rely only on browser storage for per-customer enforcement.

## Order and payment

Create an immutable coupon snapshot on the pending order. Send only its final positive total to GlobePay. Trusted notify/query must compare provider paid amount, order total, and reservation total before idempotent redemption. Failed, cancelled, or expired orders release only `reserved` records.

The project payment Adapter must call:

```js
const requestedAmount = resolveCouponPaymentAmount({
  quote: couponQuote,
  orderTotal: pendingOrder.total,
});
```

Map `requestedAmount` to the approved GlobePay amount field. Never send the
pre-discount subtotal and never recalculate discount in the provider Adapter.
