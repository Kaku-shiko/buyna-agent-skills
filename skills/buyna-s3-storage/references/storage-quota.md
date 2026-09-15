# Merchant storage plans

Use the activated merchant subscription from the trusted backend/CRM:

| Plan | Customer label | Exact capacity |
| --- | --- | --- |
| basic | 500 MB | 524288000 bytes (500 MiB) |
| pro | 2 GB | 2147483648 bytes (2 GiB) |

Use `merchantStorageQuota` and `assertStorageCapacity` from the file core.
Do not derive plan from the browser, conversation, display name or an editable
merchant preference. Unavailable/unknown subscription must block new uploads;
do not assume Pro or unlimited storage. Platform administrators activate/change
plans through the existing trusted subscription flow. Merchant UI is read-only.

Count all physical merchant file objects: product/Banner originals, mobile
variants, thumbnails and other uploaded files. A shared object counts once.
Track uploaded-but-unattached objects and pending deletion until physical cleanup
is confirmed. In-progress uploads reserve bytes. Five conversations and all
workers share one project_id + seller_id ledger, not five quotas. Do not count
URLs, database text or external images as uploaded bytes.

## Fixed implementation

`createMerchantImageWriter` requires a quota adapter: reserve before S3 transfer,
confirm occupied bytes after HEAD and before business attachment. Copy/import
`scripts/postgres-storage-quota.mjs` with the existing PostgreSQL pool, registered
schema, server `resolvePlan(scope)` and the core policy functions. It implements
status, atomic reservation, idempotent confirmation and idempotent cleanup release.
Every operation locks the same merchant account row, so concurrent requests
cannot independently spend the same remaining space. Every query includes
project_id and seller_id. The caller first verifies auth, merchant and entity.

Apply `assets/storage-quota.sql` through the registered database migration runner
with an explicit schema/search_path. It creates only tables in that existing
schema, never infrastructure. Initialize accounts after reconciling existing S3
objects and metadata, and populate their object ledger; do not seed existing
merchants at zero or auto-create a fallback account on first upload. Unknown
usage fails with STORAGE_USAGE_NOT_INITIALIZED. New empty merchants can be
initialized at zero by trusted onboarding after confirming an empty prefix.

Presigned uploads, document uploads and image variants must use the same ledger.
For direct-to-S3 uploads reserve a maximum before signing, constrain actual size
in the upload policy, and reconcile actual bytes before confirming; do not let
that route bypass quotas. If integrating a smaller-actual-size upload, extend
the adapter transaction explicitly rather than lying about bytes.

Do not release a reservation merely because a client cancelled or a lease timed
out: an object may have been written. Reconcile its object/metadata and lease,
then invoke releaseDeletedObject only after reference checks and confirmed S3
deletion. Never expose this method as a browser-controlled decrement endpoint.
Same request/object confirmation or cleanup retries must not double-charge or
double-release. Connection loss after COMMIT is recovered by the same key.

Replacement temporarily needs space for both old and new images. If full, reject
before uploading; never delete the old live image to make room. Downgrade keeps
existing data and allows reads/deletion but blocks additional uploads while
used + reserved exceeds the lower limit. Previously reserved bytes may finish
without spending a second reservation. Upgrade uses the new trusted plan on the
next reservation. Keep per-file MIME/size limits separate from account capacity.

## UI and verification

Show plan, used, uploading/reserved, remaining and capacity in 后台 → 存储空间.
On limit error show “存储空间不足，请清理文件或升级套餐”; retain the editor draft.
Use actual server counters, not a simulated progress bar. Percentage may show
over quota after downgrade; no automatic deletion or forced checkout.

Verify exact limits, one byte over, unknown plans, cross-tenant access, duplicate
requests, parallel reservations, replacement, failed upload/cleanup, upgrade and
downgrade. Module tests are not evidence of a customer's live plan connection or
database migration. Report unconfigured adapters honestly.
