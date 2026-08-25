# Phase 6: Checkout And Payment

Use `NOT_APPLICABLE` when `requiresCheckout=false`. Select the checkout sequence
from persisted workflow state:

- `requiresCheckout=true, requiresPayment=false`: resolve
  `packages/buyna-checkout-flow-core` for minimum fields, optional method
  selection, review/submission, snapshot creation, and local order/booking lock.
- `paymentArchitecture: fixed-cores`: execute checkout-flow core → project
  GlobePay transport/verification Adapters →
  `packages/buyna-commerce-settlement-core`. Every call uses server-owned
  `projectId + sellerId`.
- `paymentArchitecture: legacy-globepay-service`: maintain the explicit legacy
  service path without either fixed payment core. A paid transition verifies
  notify authenticity, confirms success through provider Query, and reconciles
  the Query's exact amount and currency to the local order before effects.

Project code supplies form presentation, configuration, database/provider
Adapters, routes, and framework wiring. For the fixed path, a callback becomes a
trusted provider notify/query result only after signature/source verification
and exact amount/currency reconciliation; browser return parameters remain
display/navigation input. Record the selected architecture and its required
evidence. Missing or unknown architecture blocks payment work.

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
