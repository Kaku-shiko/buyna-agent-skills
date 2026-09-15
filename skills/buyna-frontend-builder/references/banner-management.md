# Frontend Banner and merchant content management

When the chosen storefront includes a merchant-managed Banner/hero, include
`网站内容 → Banner 管理` in the corresponding Dashboard scope and API handoff.
Do not add an unused Banner to a design that has none. This is content editing,
not a free-form website/page-layout editor.

Map each Banner to its actual page, region and stable ID. A single-image region
uses a single editor; a carousel supports the configured number of items,
adding, deletion, ordering and enable/disable. Do not impose a global three- or
five-image limit. Configure desktop and optional mobile image, alt text, title,
subtitle/description, button text and destination. Show only fields the actual
frontend renders. Missing mobile image falls back to desktop when allowed by
the approved design. Use responsive crop/focal-point settings only when supported.

Generate loading, empty, dirty, uploading, saving, saved, validation, conflict
and failure states using existing Dashboard operation and file upload cores.
Disable conflicting submit while uploading/saving, retain unsaved text after
failure, and use expected revision to reject concurrent overwrites. Clearing a
field must persist an empty value; omission means unchanged. Buttons say 删除
for deletion and 停用 for visibility changes, never conflate them with 归档.

Public and admin routes must use the same persisted content source scoped by
server-owned project_id + seller_id. Store image file IDs/object keys, not
preview/signed URLs. Use the file module's durable image writer and the storage
Skill's image-write adapter contract. Validate linked file ownership and confirmed
status transactionally. Validate destination links against supported internal
paths and HTTP(S); reject javascript:, data: and executable schemes.

Saving confirms database persistence; frontend cache revalidation is a separate
step with a retryable message if it fails. Reordering is one scoped transaction.
Delete content references before delayed file cleanup; other Banner/product
references to the same image remain valid. No fake success, hardcoded assets,
browser-only storage or local image paths satisfy this feature.

Verify a saved image/text/link after reload on the admin and public page;
single-image and multi-image variants; clear/no-change save; mobile fallback;
ordering/visibility/deletion; upload failure; expired image URL; stale revision;
unauthorized access. Record any missing backend integration explicitly.
