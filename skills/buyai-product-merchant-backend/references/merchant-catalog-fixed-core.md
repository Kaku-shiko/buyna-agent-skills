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
4. Connect images through `buyna-merchant-file-core`; do not add file logic to
   the catalog service.

## Fixed Operations

- `listProducts`
- `createProduct`
- `updateProduct`
- `setProductStock`
- `setProductVisibility`
- `archiveProduct`
- `reorderProducts`
- `listCategories`
- `createCategory`
- `updateCategory`
- `setCategoryVisibility`
- `archiveCategory`
- `createVariant`
- `updateVariant`

The module fixes field allowlists, filter/sort fields, normalization, soft
deletion, and transactional product ordering. A project may add an Adapter or
approved route mapping, but must not bypass merchant scope or replace archive
with hard deletion.

Compose image upload, replacement, deletion, ordering, and orphan cleanup with
`packages/buyna-merchant-file-core`. The project may configure image limits and
field mapping, but must not rewrite S3 ownership or lifecycle ordering.

Run:

```powershell
npm test --prefix packages\buyna-merchant-catalog-core
```

Do not use this module for orders, payments, paid customers, authentication,
images, or booking capacity.
