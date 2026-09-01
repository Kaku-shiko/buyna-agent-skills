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

The module fixes field allowlists, filter/sort fields, normalization, soft
deletion, and transactional product ordering. A project may add an Adapter or
approved route mapping, but must not bypass merchant scope or replace archive
with hard deletion.

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
