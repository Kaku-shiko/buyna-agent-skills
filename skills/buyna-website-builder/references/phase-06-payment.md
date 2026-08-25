# Phase 6: Checkout And Payment

Use `NOT_APPLICABLE` when `requiresCheckout=false`. For every checkout, resolve
`packages/buyna-checkout-flow-core`; it owns minimum-field validation,
payment-method selection when configured, review/submission, snapshot creation,
and local `pending_payment` order/booking locking. Project code supplies form
presentation, configuration, database Adapter, routes, and framework wiring.

When `requiresPayment=true`, resolve
`packages/buyna-commerce-settlement-core`. The new-build sequence is checkout
core → GlobePay transport/verification Adapters → settlement core. Every call
uses server-owned `projectId + sellerId`. A callback is a trusted provider
notify/query result only after signature/source verification and exact amount
and currency reconciliation; browser return parameters remain display/navigation
input. Record `paymentArchitecture: fixed-cores`, the server scope, checkout-flow
verification, and amount/currency reconciliation in gate delivery evidence.

### Default fast check (minimum delivery path)

- Verify environment + keys are server-side.
- Verify payment create route returns a valid provider payment intent/URL and stores pending order hash.
- Verify one trusted provider notify/query success and one failure path, including exact amount/currency reconciliation and state transition.
- Verify mobile H5/JSAPI route exists if mobile checkout is enabled.
- Connect GMV trigger and outbox event in the same local transaction.
- If full payment matrix is needed (多渠道/异常码全链路), mark as deferred item and run after user confirmation.
For `requiresCheckout=true, requiresPayment=false`, complete local cart/order or
booking checkout-flow evidence and skip provider/settlement checks. For
`requiresCheckout=false`, set this gate to `SKIP` with `SKIP_REASON` and continue.
Every applicable Buyna payment flow must also call `buyna-gmv-commerce`, write
the fixed GMV Outbox event in the same transaction, deliver it asynchronously
to CRM, and verify that the CRM revenue/GMV page reflects one paid event and
one completed refund without double counting.
For product commerce, connect the approved cart UI to
`packages/buyna-cart-core`, create the local `pending_payment` order through
`packages/buyna-order-core`, and only then start GlobePay. Generate project
Adapters and approved pricing/form configuration; do not regenerate fixed cart
or order rules.
