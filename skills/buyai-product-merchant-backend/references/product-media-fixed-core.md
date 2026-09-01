# Product Media Fixed Core

Use `createProductMediaService` from `packages/buyna-merchant-catalog-core` with
the same request-local `project_id + seller_id` context as
`buyna-merchant-file-core`. The fixed service owns product/image sequencing,
limits, first-image main selection, full-set ordering, replacement cleanup,
main-image fallback, and retry-safe compensation. The project owns SQL/ORM,
object storage, signed URLs, HTTP routes, and visual presentation.

## Canonical product image record

The project Adapter persists exactly one scoped relation per image with:
`id`, `project_id`, `seller_id`, `product_id`, `file_id`, `alt_text`,
`position`, `is_main`, nullable `variant_id`, timestamps, and optional soft
deletion metadata. Enforce one active main image per scoped product, unique
active `file_id`, and deterministic order by `is_main DESC, position, id`.
Never expose object keys, Bucket names, or storage credentials in the product
API response.

## Adapter interface

Construct the service with the fixed catalog service, the fixed merchant file
service, and a project `mediaStore`:

- `mediaStore.transaction(work)` keeps each relation mutation and its locks in
  one database transaction.
- Transaction Adapter methods:
  `getProductForUpdate`, `listProductImagesForUpdate`,
  `getProductImageByFileIdForUpdate`,
  `attachProductImage`, `replaceProductImage`, `setMainProductImage`,
  `reorderProductImages`, `updateProductImageAltText`, and
  `removeProductImage`.
- Read Adapter methods: `getProductImageByFileId` checks compensation safety
  after a transaction race; `getProductWithImages` returns the product, ordered
  image records, project-generated URLs, and the selected `mainImage`.
- The transaction Adapter must scope every lookup/write by server-owned
  `project_id + seller_id + product_id`; an ID alone is forbidden.
- `confirmUpload` receives a stable `requestKey` and the metadata Adapter must
  return `{ id, created }` atomically. Replays return the same file with
  `created: false`. `getProductImageByFileIdForUpdate` makes an already-linked
  file an idempotent success for the same product and rejects a cross-product
  link. Compensation may soft-delete only `created: true` files from the
  current request; it must never delete a replayed or already referenced file.

The product Adapter maps `description`, `short_description`, and `sort_order`
on draft creation. Direct `mainImageId` writes are forbidden because the
scoped image relation is authoritative.

## Fixed sequence

1. `createDraft` and `createDraftWithImage` create a draft product first and
   both return the hydrated `getProductWithImages` shape. A failed image attach
   preserves the draft and returns its ID as retryable instead of losing the
   merchant's text fields.
2. `attachUploadedImage` calls merchant-file `confirmUpload`, locks the product
   and current image set, enforces the limit, then attaches the file. The first
   image becomes main; later images do not steal main status.
3. `setMainImage`, `reorderImages`, and `updateImageAltText` mutate only the
   scoped relation in a transaction.
4. `replaceUploadedImage` confirms the new file, swaps the relation atomically,
   then calls merchant-file `replaceObject`; cleanup failure is reported as
   `cleanupPending` without reverting the valid new relation.
5. `removeImage` removes the relation, selects the first remaining image when
   the removed image was main, and calls merchant-file `softDelete` for
   asynchronous object cleanup.
6. After every success return `getProductWithImages`, so Dashboard and public
   storefront receive the same complete product shape.

Do not implement upload Base64 parsing, S3 SDK calls, database queries, React
components, or merchant-specific fields in this fixed module. Generate those
only in the project Adapter/UI.
