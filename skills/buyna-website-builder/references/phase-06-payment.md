# Phase 6: Checkout And Payment

Use `NOT_APPLICABLE` for non-commerce sites. For payment-capable commerce,
resolve `packages/buyna-checkout-flow-core` and
`packages/buyna-commerce-settlement-core` from `repository-manifest.json` and
the installed package root. The checkout core owns minimum-field validation,
payment-method selection, review/submission, snapshot creation, and local
`pending_payment` order locking. The settlement core owns trusted notify/query
reconciliation, legal paid/refund transitions, idempotency, and transactional
effects. Project code supplies form presentation, configuration, provider and
database Adapters, routes, and framework wiring.

### Default fast check (minimum delivery path)

- Verify environment + keys are server-side.
- Verify payment create route returns a valid provider payment intent/URL and stores pending order hash.
- Verify one success and one failure path can be reached in a controlled path (callback URL + state transition).
- Verify mobile H5/JSAPI route exists if mobile checkout is enabled.
- Connect GMV trigger and outbox event in the same local transaction.
- If full payment matrix is needed (多渠道/异常码全链路), mark as deferred item and run after user confirmation.
For capability-driven execution: when capability or user scope excludes checkout/payment, set this gate to `SKIP` with `SKIP_REASON` and continue.
Every applicable Buyna payment flow must also call `buyna-gmv-commerce`, write
the fixed GMV Outbox event in the same transaction, deliver it asynchronously
to CRM, and verify that the CRM revenue/GMV page reflects one paid event and
one completed refund without double counting.
For product commerce, connect the approved cart UI to
`packages/buyna-cart-core`, create the local `pending_payment` order through
`packages/buyna-order-core`, and only then start GlobePay. Generate project
Adapters and approved pricing/form configuration; do not regenerate fixed cart
or order rules.
