# Phase 5: Dashboard Functional Integration

Signed inspection receipts and a trusted public key are not universal release
prerequisites. Only projects explicitly using a signed inspection service follow
the cached-baseline rules below. Otherwise use the current-release live checks in
`aws-project-deployer/references/direct-release.md` with the registered resource
record; do not fabricate a baseline. Preserve any actual runtime authorization
and signature enforcement. Missing optional signing configuration alone must
not block ordinary release or backend integration.

Require the approved Phase 4 code record and API contract. Use `buyai-dashboard-data-interaction` to complete one page or related slice at a time: executable API foundation, merchant identity, `buyna-project-resource-registry`, the matching existing-resource gate, database/S3 when needed, domain endpoint/service, mock-adapter replacement, and persistence/error/public-site verification.

Before backend integration, require existing-resource evidence matching the project architecture:
- `RESOURCE_MODE: existing_buyna_resources` 时：必须为 `0` 的指标是 `NEW_EC2_INSTANCES`、`NEW_DATABASES`、`NEW_BUCKETS`、`NEW_PORTS`。
- `aws_serverless`/`aws_static` 时：按架构检查相应指标，不额外固定实例/端口指标。
Missing or placeholder resource evidence blocks the slice; never provision a replacement to continue.

Create one foundation receipt with `packages/buyna-integration-receipt-core`
and bind it to the machine-valid `projectDeploymentBaseline`. Later Dashboard
slices reuse it while the stable resource digest remains unchanged; do not
repeat the complete foundation inspection for every page and do not expire it
only because time, a new AI task, or an application release passed.

When the current slice creates a new merchant project directory, route its file
layout to `buyna-merchant-onboarding`, which must call
`packages/buyna-merchant-file-core` `scaffoldMerchantProject` after preflight.
When the current slice uploads, replaces, deletes, or cleans images/files, route
to `buyna-s3-storage`, which must call the same package's fixed lifecycle service.
Never regenerate the layout for an existing project.

For 商品管理/分类管理 use `buyna-merchant-catalog-core`. For seller Orders,
order detail, and CSV use `buyna-order-core`. The current project generates only
Adapters and API wiring.
For 商品管理 image creation/editing, call `createProductMediaService` from the
catalog package with `buyna-merchant-file-core`; generate the scoped media
Store and UI, not another product/image state machine.

For the approved Dashboard overview only, call
`buyna-commerce-read-model-core` through the Dashboard Skill Adapter contract.
Inventory/orders/bookings/customers/paid customers keep their existing cores.
For an explicit persisted approved order/booking notification operation only,
call `buyna-delivery-state-core`; write the immutable source event in the domain
transaction and dispatch through the reconciler. Preserve fresh auth -> fresh
merchant context -> business Adapter order. The project owns SQL/ORM, chart
presentation, templates, recipients, and email/SMS providers.

Save frontend and backend code and tests. Stop before the next slice only when
it is outside the approved work package or requires a new risk authorization.
Complete the phase only when all approved Dashboard slices have no
unexplained mock business actions.
