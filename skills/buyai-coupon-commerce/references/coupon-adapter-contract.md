# Coupon Adapter Contract

Create the module with server-owned scope:

```js
createCouponModule({ projectId, sellerId, store, clock })
```

`store.transaction(work)` supplies one transaction object. The transaction
keeps each lock, event claim, usage-counter change, and write atomic.

## Required transaction methods

| Operation | Methods used |
| --- | --- |
| `createDraft` | `claimCouponEvent`, `createCoupon` |
| `activate`, `pause`, `archive` | `claimCouponEvent`, `getCouponForUpdate`, `createCoupon` |
| `quote` | `getCouponForUpdate` |
| `reserve` | `claimCouponEvent`, `getCouponForUpdate`, `createReservation` |
| `redeem` | `claimCouponEvent`, `getCouponForUpdate`, `redeemReservation` |
| `release` | `claimCouponEvent`, `getCouponForUpdate`, `releaseReservation` |

`getCouponForUpdate` must lock the authoritative seller-scoped coupon and its
reservation/usage counters until the transaction finishes. Every returned
record preserves the supplied `projectId`, `sellerId`, coupon/reservation
identity, state, snapshots, counters, and timestamps.

`claimCouponEvent` persists the complete event envelope and provides
`complete(result, { resultFingerprint })` for a new claim. Duplicate event IDs
return the previously completed event; conflicting envelopes fail. Do not
simulate claims with an in-memory process-local set.

## Project-owned mapping

The project maps framework requests and ORM/SQL rows into this contract. It
may configure localized labels and fields, but cannot change safe-integer JPY
money, discount calculation, eligibility, usage limits, legal transitions, or
exact-once semantics. The final coupon snapshot is copied unchanged into the
checkout/order snapshot and later passed to settlement redemption or release.
