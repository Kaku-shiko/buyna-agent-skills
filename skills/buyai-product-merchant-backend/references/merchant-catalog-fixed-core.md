# Fixed Merchant Catalog Core

Use `packages/buyna-merchant-catalog-core` for the standard 商品管理 and 分类管理
backend behavior. Do not regenerate these policies or operations in project
routes.

## Composition

1. Create a seller-scoped `buyna-postgres-merchant-core` instance from the
   authenticated server-owned `project_id + seller_id`.
2. Pass that instance as `dataCore` to `createMerchantCatalogService`.
3. Keep project routes thin: validate transport input, call one service method,
   map the result to the approved Dashboard API contract.
4. Connect images through `createProductMediaService` plus
   `buyna-merchant-file-core`; the catalog package owns orchestration but not
   storage SDK, SQL/ORM, signed URL, or UI implementation.

## Fixed Operations

- `listProducts`
- `createProduct`
- `updateProduct`
- `setProductStock`
- `setProductVisibility`
- `archiveProduct`
- `transitionProduct`
- `restoreProduct`
- `setFeaturedProducts`
- `reorderProducts`
- `listCategories`
- `createCategory`
- `updateCategory`
- `setCategoryVisibility`
- `archiveCategory`
- `transitionCategory`
- `restoreCategory`
- `reorderCategories`
- `createVariant`
- `updateVariant`
- `transitionVariant`

The listed archive/restore methods are legacy capabilities, not the required
merchant deletion contract. Do not expose them as default merchant actions or
rename an archive call to delete and claim completion.

Implement real deletion with server-owned merchant scope and transactional
dependency checks. Remove the target catalog record and exclusively owned
catalog dependents; preserve historical order/payment snapshots and shared
files. Reject category dependencies with an actionable error or use an
explicitly approved reassignment policy. Do not silently introduce soft
deletion, archive, trash, or restore behavior.

Inspect installed modules before wiring deletion. If only archive exists,
report the precise capability gap and implement the fixed-core delete operation,
Adapter contract, and focused tests within the authorized feature scope before
connecting it. Do not invent an existing delete API or bypass authorization
with route-local SQL. Unrelated catalog operations continue using the core.

When the persisted route includes stock/SKU capability, compose this service
with `packages/buyna-inventory-core`; catalog fields describe the SKU while the
inventory module owns reservation, commit, release, and oversell rejection.
When coupons are enabled, use `buyai-coupon-commerce` instead of adding coupon
algorithms to catalog routes.

Compose image upload, replacement, deletion, ordering, main selection, and
orphan cleanup with `createProductMediaService` and
`packages/buyna-merchant-file-core`. The project may configure image limits and
field mapping, but must not rewrite ownership or lifecycle ordering.

Run:

```powershell
npm test --prefix packages\buyna-merchant-catalog-core
```

Do not use this module for orders, payments, paid customers, authentication,
storage transport, visual image editing, or booking capacity.
