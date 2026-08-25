---
name: buyai-dashboard-data-interaction
description: "Connect one approved Buyna.ai merchant Dashboard page or related slice to real backend data. Use for executable API foundation, merchant identity, existing AWS database/S3, product or service logic, mock-adapter replacement, and persistence verification without separate framework phases."
---

# Buyai Dashboard Data Interaction

Complete one approved Dashboard page or closely related interaction slice at a time without redesigning its UI.

When invoked by `buyna-website-builder`, inherit its persisted capabilities,
interaction mode, and bounded work package. Its returned `skills` and
`fixedModules` are authoritative; references below reuse an already returned
child and never trigger a second sibling invocation.

For every protected request, first interpret a fresh trusted result through
`buyna-auth-session-core`, then call `buyna-merchant-context-core` with the
current server-observed host, and only then call a business Adapter. Never cache
the resolved identity or merchant context across requests or hosts. The
Builder's `configuration.workPackage`, approved fixed-module selection, and
approved Adapter contract are inherited; do not repeat onboarding or reopen
confirmation inside the approved slice.

For every interactive page, call
`packages/buyna-merchant-dashboard-core.createDashboardOperation`. The fixed
operation state owns legal loading/ready/empty/error/forbidden and
editing/saving/saved/validation transitions, duplicate-save suppression, and
stale-response rejection. Generate the page Adapter and presentation; do not
regenerate this state machine.

When the authoritative route selects the Dashboard overview, read
`references/commerce-read-model-adapter-contract.md` and call
`buyna-commerce-read-model-core`. Do not use it for inventory, orders,
bookings, customers, or paid-customer lists; those keep their existing fixed
core and project service.

Only when the route carries an explicit persisted approved
`order_notification` or `booking_notification`, read
`references/delivery-state-adapter-contract.md` and call
`buyna-delivery-state-core`. Omission selects no delivery work. The request
order is fresh auth, fresh merchant context, fixed read-model or delivery
service, then the project presentation or provider Adapter.

## Entry Gate

Require runnable Dashboard source, desktop/mobile states, marked mock adapter,
API contract, and passing frontend checks. Standalone work also requires its
ordinary approval; Builder-invoked work inherits the bounded approval above.
Otherwise stop and return to `buyna-frontend-builder` Phase 4.

Read `references/dashboard-data-interaction.md`. Read `references/approved-stack.md` only when no working/approved backend stack exists.

## Slice Sequence

For the current page only:

1. Preserve the working stack; establish or extend the executable server/API boundary and environment-safe endpoint configuration.
2. Bind project login/session verification to the fixed request-local auth and
   merchant-context sequence above; never accept browser ownership.
3. Run `buyna-project-resource-registry`, then run `buyna-aws-data-layer` only for a registered PostgreSQL architecture. Preserve a registered serverless/static architecture rather than generating RDS. For a newly approved
   merchant project, require the `buyna-merchant-onboarding` scaffold result.
   For approved file actions, call `buyna-s3-storage`; it must use
   `packages/buyna-merchant-file-core` rather than regenerate keys or lifecycle
   code.
4. Route domain logic to `buyai-product-merchant-backend` or
   `buyai-booking-service-backend`. Product/category slices must use the fixed
   `packages/buyna-merchant-catalog-core` selected by the product Skill.
   Stock/SKU slices use `packages/buyna-inventory-core`; persisted coupon
   slices route once to `buyai-coupon-commerce` and `packages/buyna-coupon-core`.
   Orders and order-detail slices must use
   `packages/buyna-order-core`; payment status remains owned by the GlobePay
   status service.
5. Route checkout/payment only when the current slice requires it. For the
   payment settings slice, label the page `支付/订阅设置`. Preserve GlobePay
   masked metadata, Notify URL, Return URL, enabled methods, and portal link.
   Add a separate Buyna.ai subscription section showing only the authenticated
   merchant's plan, status, start date, and bound domain through a
   server-to-server CRM lookup. Resolve `project_id` and `seller_id` from the
   authenticated server session and project configuration; never hard-code a
   sample merchant or accept browser-selected ownership. Never expose CRM
   credentials, other merchants, GMV, billing internals, or a browser-direct
   CRM connection.
6. Use `buyna-frontend-builder` integration mode to replace only the matching mock adapter.
7. Verify persistence, refresh, permission, error, mobile, and public-site synchronization.
8. Return the delivery record to `buyna-website-builder`. Continue automatically when the next slice is inside the approved work package and its dependencies are ready; otherwise stop for approval.

Use the approved canonical Dashboard contract from `buyna-frontend-builder`; do not maintain a competing page order in this Skill.

For the 订单/预约 slice, require the approved detail UI and API contract to render the complete safe customer submission snapshot returned by the backend. Do not silently omit custom, unknown, or legacy fields; keep list rows concise and show the full snapshot in the authorized detail view.

## Boundaries

- Do not preload or implement later pages.
- Preserve the approved UI and API contract; return conflicts for focused approval.
- Keep fixed operation/drawer/table/dialog behavior separate from the
  project-owned markup, colors, fonts, spacing, shell, page composition,
  transitions, responsive visual treatment, and CSS.
- Keep credentials and business rules server-side.
- Reuse approved AWS resources; do not introduce Supabase, Lovable, replacement databases, buckets, or instances.
- Do not replace a mock before its endpoint and failure behavior pass.
- Do not infer payment success from browser state or redirects.
- Keep subscription status read-only in the merchant Dashboard. Subscription
  changes remain owned by Buyna.ai CRM.
- Treat named merchant projects only as test fixtures. Every generated backend
  must receive its own `project_id`, `seller_id`, domain, and server credential
  through onboarding configuration.

## Delivery

Report frontend adapter, backend endpoint/service, schema/migration or S3 files, tests, persistence evidence, and remaining mock behavior. The slice fails without saved frontend and backend code and applicable passing checks.
