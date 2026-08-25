# Website Builder Routing Authority

`scripts/route-builder.mjs` is the executable routing authority. This reference
defines its inputs and the domain meaning of its outputs.

## Interface

Input:

- `capabilities`: an external assertion of `siteType` plus boolean
  `requiresDashboard`, `requiresCart`, `requiresCheckout`, `requiresPayment`,
  `requiresBooking`, `requiresCatalog`, `requiresInventory`, and
  `requiresCoupons`. After intake, the identical normalized persisted workflow
  value is authoritative; a mismatch returns
  `CAPABILITY_SCOPE_CHANGE_REQUIRED`. Older `commerce` or cart-bearing records
  default catalog and inventory on and coupons off. A legacy `mixed` record
  without cart or explicit lifecycle flags defaults all three off and returns
  `EXPLICIT_PRODUCT_CAPABILITY_MIGRATION_REQUIRED`; persist explicit flags at
  intake before adding product work.
- `workflowState`: canonical gate status plus real delivery/approval evidence
  for every prior gate in active or completed history.
- `requestedSlice`: one canonical gate ID or `local_preview`.
- `releaseIntent`: explicit boolean.
- `mode`: `build`, `repair`, or `resume`.
- `dashboardSlice`: for a Dashboard target, one value already persisted in
  `workflowState.configuration.dashboardSlices`, or `all` when the bounded work
  package includes `dashboard_integration`.

Persist Dashboard slices with `setApprovedDashboardSlices` after approved
design/page-structure evidence, only at `currentGate=frontend_code` while the
frontend gate is `ready`. A later, started, delivered, completed, or deployed
state returns `DASHBOARD_SLICE_SCOPE_CHANGE_REQUIRED`. Persist bounded work with `authorizeWorkPackage`
and repair scope with `openRepairSlice`. The router requires `workflow transition evidence`
for each record (exact actor, scope, timestamp, and event); a hand-built
configuration object is blocked before module selection.

Opaque provenance is runtime-owned. Serialized workflow JSON is not trusted.
At trusted server initialization, `loadPinnedWorkflowAuthority` reads the pinned
public key and key ID from immutable server-owned configuration, then
`createVerifiedWorkflowStore` captures the resulting authority plus transport.
Every persisted resume, including routes without a work package or repair, must
obtain state through `loadVerifiedWorkflow()`. The request and AI never pass a
per-load verifier or authority configuration. Each load sends a fresh nonce,
locally verifies the signed latest head, and requires its revision, head, and
state digest to equal the local append-only journal evidence. Each save uses a conditional monotonic
commit (CAS) from the prior signed head and locally verifies the signed
acknowledgement. Old locally valid files therefore cannot roll the workflow back.

The transport Adapter may request signed journal receipts, latest heads, and CAS
commits from a protected RDS/DynamoDB/KMS-backed authority service, but its return
value never declares validity. Production selection and connection remain
project infrastructure; this Skill performs no live service call. An unverified
state returns `WORKFLOW_STATE_PROVENANCE_UNTRUSTED`.

Output:

- `targetGate`, `skills`, and `fixedModules` are the minimum ready route.
- `manifestVerification` confirms every selected Skill and fixed module is in
  the canonical repository manifest or installed namespaced manifest's
  `website-builder` profile.
- `notApplicableGates` contains only canonical optional gates.
- `continueWithoutConfirmation` inherits the saved bounded work package.
- `externalActions.git` and `externalActions.aws` are explicit.
- `dashboardSlice` and `dashboardSlices` are stable on success and blocked
  results. One persisted slice auto-selects; multiple slices without a choice
  return `DASHBOARD_SLICE_REQUIRED`; empty configuration returns
  `DASHBOARD_SLICES_NOT_CONFIGURED`; unapproved input returns
  `DASHBOARD_SLICE_NOT_APPROVED`; and unbounded `all` returns
  `DASHBOARD_FULL_SCOPE_APPROVAL_REQUIRED`.
- A fully evidenced completed workflow in repair mode returns `action:
  reopen_repair` and an `openRepairSlice` transition until a matching separate
  repair slice exists.

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
- Product/category management: `requiresCatalog=true` selects
  `buyna-merchant-catalog-core`.
- Stock or SKU management: `requiresInventory=true` selects
  `buyna-inventory-core` and requires catalog capability.
- Coupons: `requiresCoupons=true` selects the one
  `buyai-coupon-commerce` entrypoint and `buyna-coupon-core`; false skips only
  coupons and never skips checkout.
- Every `requiresDashboard=true` frontend or Dashboard integration route
  selects `buyna-merchant-dashboard-core` operation state.
- Every Dashboard integration selects `buyna-auth-session-core` and then
  `buyna-merchant-context-core`. Persisted `products`, `services`, `media`, or
  `page_editor` slices also select `buyna-merchant-file-core`; other slices do
  not.
- Product with provider payment: execute cart/order, checkout-flow core,
  GlobePay transport/verification Adapters, then settlement core and GMV.
- Paid booking: `requiresBooking=true`, `requiresCheckout=true`, and
  `requiresPayment=true`; execute booking plus checkout/payment without a cart
  dependency.
- Mixed product plus booking: when both cart and booking capabilities are true,
  return both backends once, then the shared checkout/payment route.
- `requiresCheckout=false` is the only capability condition that makes
  `checkout_payment` not applicable.

## New Build And Recovery

A new build starts at `customer_intake` and follows canonical readiness.

A repair/resume first loads state. When verified delivery and approval records
fill missing history, call `importVerifiedHistory` in canonical order and save
its event batch. Re-run the router with the resulting state; the requested
dependency-ready slice is then selected directly. A chat assertion supplies no
readiness evidence by itself.

When a deployed workflow has `currentGate=null`, `mode=repair` selects the
requested implementation gate after the workflow core validates delivery,
approval, and trustworthy N/A evidence for every completed gate. Repair keeps the
saved capability boundary; a canonically N/A Dashboard or checkout request returns
`CAPABILITY_SCOPE_CHANGE_REQUIRED` as a capability scope change before any reopen.
Authorize an eligible bounded repair scope through
`openRepairSlice`; this creates separate repair readiness without changing
canonical completed gates. Rerun the router to execute that authorized slice
directly.

## Payment Architecture

New payment path:

1. `buyna-checkout-flow-core` validates the configured minimum fields and
   selected payment method, then locks the local order/booking snapshot.
2. Project GlobePay transport/verification Adapters use server-owned
   `projectId + sellerId` and server-selected credentials.
3. `buyna-commerce-settlement-core` accepts only trusted provider notify/query
   results with exact order, amount, and currency reconciliation.

An explicitly recorded `legacy-globepay-service` route uses
`createGlobepayService` without the checkout-flow or settlement cores. Its paid
writer requires provider Query plus exact amount and currency reconciliation.
The fixed-core and legacy routes are never composed.

Payment-capable intake names exactly one supported architecture:
`fixed-cores` or `legacy-globepay-service`. Missing or unknown values block the
route; legacy behavior is never inferred from omission.

## External Boundary

Local preview sets Git and AWS actions false. `aws_release` returns blocked
until `releaseIntent=true`; repository contribution/publication is a separate
explicit request.

## Presentation Boundary

Fixed modules own state, validation, idempotency, and drawer/table/dialog/page
operation behavior. Project generation owns persistence/API Adapters,
configuration, localized copy, markup, components, colors, fonts, spacing,
shell, page composition, transitions, responsive visual treatment, and CSS.
No route selects a shared Dashboard skin.
Storefront gallery and all file/gallery visual UI are generated per project;
the deferred gallery behavior is not a package or route dependency.
