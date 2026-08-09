# Phase 6: Checkout And Payment

Use `NOT_APPLICABLE` for non-commerce sites. Otherwise require approved buyer/customer fields, a local pending order/booking before provider payment, server-side payment creation, and paid/refund state written only after trusted notify/query verification. Deliver frontend form, server payment, persistence, mobile route/return behavior, and applicable tests.
For product commerce, connect the approved cart UI to
`packages/buyna-cart-core`, create the local `pending_payment` order through
`packages/buyna-order-core`, and only then start GlobePay. Generate project
Adapters and approved pricing/form configuration; do not regenerate fixed cart
or order rules.
