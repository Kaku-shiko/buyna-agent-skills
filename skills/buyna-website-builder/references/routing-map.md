# Website Builder Routing Authority

`scripts/route-builder.mjs` is the executable routing authority. This reference
defines its inputs and the domain meaning of its outputs.

## Interface

Input:

- `capabilities`: `siteType` plus boolean `requiresDashboard`, `requiresCart`,
  `requiresCheckout`, `requiresPayment`, and `requiresBooking`.
- `workflowState`: canonical gate status plus real delivery/approval evidence
  for completed history.
- `requestedSlice`: one canonical gate ID or `local_preview`.
- `releaseIntent`: explicit boolean.
- `mode`: `build`, `repair`, or `resume`.

Output:

- `targetGate`, `skills`, and `fixedModules` are the minimum ready route.
- `notApplicableGates` contains only canonical optional gates.
- `continueWithoutConfirmation` inherits the saved bounded work package.
- `externalActions.git` and `externalActions.aws` are explicit.

## Canonical Gates

1. `customer_intake`
2. `design_and_structure`
3. `frontend_code`
4. `dashboard_integration`
5. `checkout_payment`
6. `testing_upload_gate`
7. `aws_release`

The workflow core owns canonical readiness. A requested ready/in-progress gate
is entered directly; otherwise the router returns `currentGate`.

## Capability Decisions

- Static: `requiresDashboard=false` and `requiresCheckout=false`; mark
  `dashboard_integration` and `checkout_payment` not applicable.
- Product without provider payment: `requiresCart=true`,
  `requiresCheckout=true`, `requiresPayment=false`; execute cart, order, and
  checkout-flow work. GlobePay, status sync, GMV payment effects, and settlement
  are outside this route.
- Product with provider payment: execute cart/order, checkout-flow core,
  GlobePay transport/verification Adapters, then settlement core and GMV.
- Paid booking: `requiresBooking=true`, `requiresCheckout=true`, and
  `requiresPayment=true`; execute booking plus checkout/payment without a cart
  dependency.
- `requiresCheckout=false` is the only capability condition that makes
  `checkout_payment` not applicable.

## New Build And Recovery

A new build starts at `customer_intake` and follows canonical readiness.

A repair/resume first loads state. When verified delivery and approval records
fill missing history, call `importVerifiedHistory` in canonical order and save
its event batch. Re-run the router with the resulting state; the requested
dependency-ready slice is then selected directly. A chat assertion supplies no
readiness evidence by itself.

## Payment Architecture

New payment path:

1. `buyna-checkout-flow-core` validates the configured minimum fields and
   selected payment method, then locks the local order/booking snapshot.
2. Project GlobePay transport/verification Adapters use server-owned
   `projectId + sellerId` and server-selected credentials.
3. `buyna-commerce-settlement-core` accepts only trusted provider notify/query
   results with exact order, amount, and currency reconciliation.

`createGlobepayService` belongs only to explicitly recorded legacy maintenance
and is not composed with this new path.

## External Boundary

Local preview sets Git and AWS actions false. `aws_release` returns blocked
until `releaseIntent=true`; repository contribution/publication is a separate
explicit request.
