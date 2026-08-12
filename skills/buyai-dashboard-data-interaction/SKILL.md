---
name: buyai-dashboard-data-interaction
description: "Connect one approved Buyna.ai merchant Dashboard page or related slice to real backend data. Use for executable API foundation, merchant identity, existing AWS database/S3, product or service logic, mock-adapter replacement, and persistence verification without separate framework phases."
---

# Buyai Dashboard Data Interaction

Complete one approved Dashboard page or closely related interaction slice at a time without redesigning its UI.

## Entry Gate

Require runnable Dashboard source, desktop/mobile states, marked mock adapter, API contract, passing frontend checks, and explicit approval. Otherwise stop and return to `buyna-frontend-builder` Phase 4.

Read `references/dashboard-data-interaction.md`. Read `references/approved-stack.md` only when no working/approved backend stack exists.

## Slice Sequence

For the current page only:

1. Preserve the working stack; establish or extend the executable server/API boundary and environment-safe endpoint configuration.
2. Implement merchant login/session, authorization, `project_id`, and `seller_id` scope when required.
3. Run `buyna-aws-data-layer` Existing Resource Gate. For a newly approved
   merchant project, require the `buyna-merchant-onboarding` scaffold result.
   For approved file actions, call `buyna-s3-storage`; it must use
   `packages/buyna-merchant-file-core` rather than regenerate keys or lifecycle
   code.
4. Route domain logic to `buyai-product-merchant-backend` or
   `buyai-booking-service-backend`. Product/category slices must use the fixed
   `packages/buyna-merchant-catalog-core` selected by the product Skill.
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
8. Return the delivery record and stop for approval.

Recommended product order: 仪表盘、商品管理、分类管理、订单、付费客户、支付设置.

For the 订单/预约 slice, require the approved detail UI and API contract to render the complete safe customer submission snapshot returned by the backend. Do not silently omit custom, unknown, or legacy fields; keep list rows concise and show the full snapshot in the authorized detail view.

## Boundaries

- Do not preload or implement later pages.
- Preserve the approved UI and API contract; return conflicts for focused approval.
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
