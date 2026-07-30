---
name: buyai-dashboard-data-interaction
description: "Coordinate data interaction after an approved Buyna.ai merchant Dashboard UI. Use to establish the server/API foundation, merchant identity, AWS database and S3, domain APIs, and page-by-page replacement of mock adapters with verified real data."
---

# Buyai Dashboard Data Interaction

Connect an approved single-merchant Dashboard UI to real backend data without
redesigning the interface or running every backend phase at once.

## Entry Gate

Require all of the following:

- runnable Dashboard UI source;
- approved desktop/mobile routes and states;
- clearly marked mock repositories or adapters;
- written API contract;
- passing frontend checks; and
- explicit user approval.

If any item is missing, stop and return to `buyna-frontend-builder` Phase 4.

Read `references/dashboard-data-interaction.md` before selecting the current
interaction slice.

## Phase Routing

Route only the current approved slice:

1. Use `buyna-project-framework` for the executable server/API foundation.
2. Use `buyna-aws-data-layer` and `buyna-s3-storage` for schema, migrations,
   ownership, and file interaction.
3. Use `buyai-product-merchant-backend` or
   `buyai-booking-service-backend` for domain APIs and business rules.
4. Use `buyai-checkout-address-ux` and `buyai-globepay-payment` only when the
   approved interaction includes checkout or payment.
5. Use `buyna-frontend-builder` in integration mode to replace the matching
   mock adapter with the verified API.
6. Use `buyna-testing-quality` to verify persistence, refresh, permission,
   error, mobile, and public-site synchronization.

## Sequential Rule

Complete one Dashboard page or closely related interaction slice at a time.
Return its code-delivery record and stop for user approval. Do not preload or
start the next slice in the same turn.

For a product Dashboard, use this order:

1. 仪表盘
2. 商品管理
3. 分类管理
4. 订单
5. 付费客户
6. 支付设置

## Boundaries

- Preserve the approved Dashboard UI and API contract.
- Keep credentials and business rules server-side.
- Use the approved AWS database and S3; do not introduce Supabase or Lovable.
- Keep one merchant and one primary merchant administrator.
- Do not replace a mock adapter before its endpoint and failure behavior pass.
- Return contract/UI conflicts for focused approval.
- Do not infer payment success from frontend state or redirects.

## Delivery

Report frontend adapter, backend endpoint/service, schema/migration or S3 files,
tests run, persistence evidence, and remaining mock behavior. A schema, plan,
or API description without saved code and verification is not complete.
