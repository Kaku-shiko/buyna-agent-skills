# Phase 6: Checkout And Payment

Use `NOT_APPLICABLE` for non-commerce sites. Otherwise require approved buyer/customer fields, a local pending order/booking before provider payment, server-side payment creation, and paid/refund state written only after trusted notify/query verification. Deliver frontend form, server payment, persistence, mobile route/return behavior, and applicable tests.
Every applicable Buyna payment flow must also call `buyna-gmv-commerce`, write
the fixed GMV Outbox event in the same transaction, deliver it asynchronously
to CRM, and verify that the CRM revenue/GMV page reflects one paid event and
one completed refund without double counting.
For product commerce, connect the approved cart UI to
`packages/buyna-cart-core`, create the local `pending_payment` order through
`packages/buyna-order-core`, and only then start GlobePay. Generate project
Adapters and approved pricing/form configuration; do not regenerate fixed cart
or order rules.
When the approved product checkout includes coupons, route the integration
slice through `buyai-coupon-mobile-checkout`. It coordinates the existing
coupon, order, responsive GlobePay, trusted status, and GMV Skills; it does not
replace them or unlock unrelated Phase 6 work.
