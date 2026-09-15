# Durable image writes

Use `createMerchantImageWriter` and `validateImageBytes` from
`buyna-merchant-file-core`, with the reusable transport adapter
`skills/buyna-s3-storage/scripts/s3-image-storage.mjs` for server-proxied image uploads. This extracts
the inspected medinance flow (private S3, format/size checks, scoped keys,
database object references and fresh signed reads), without its default tenant,
legacy prefix fallback, or customer text. No existing merchant is migrated by
installing the module.

## S3 wiring

Pass the project's existing AWS SDK S3 client, the SDK's PutObjectCommand,
HeadObjectCommand, DeleteObjectCommand, GetObjectCommand constructors as
`commands`, `getSignedUrl` as `signer`, and the core `buildMerchantObjectKey`
function as `buildMerchantObjectKey`. Copy or import the adapter into the project
and pass these dependencies explicitly; transport stays outside the pure core. Bind existing bucket and trusted
`projectId + sellerId` on the server after fresh authorization. No public ACL,
bucket creation, or browser-selected storage destination is permitted.

The writer accepts bytes, contentType, requestKey, entityType, entityId, variant,
and expectedRevision. Bind allowed entity/slot and maximum size in the route;
do not let the browser choose arbitrary entity types. Verify the entity belongs
to the merchant before writing. For Banner use `site-banner`, the actual
Banner ID, and `desktop`/`mobile`. Retain the selected limit (medinance used
8 MiB Banner and 5 MiB product); do not hard-code one merchant's policy globally.
Enforce HTTP body limits before parsing/decoding. Signature checks are not a
full image decode or malware scan; use the project's image decoder where required.

## Metadata implementation in the existing database

The writer now requires `quota.reserve` and `quota.confirm`. Read
[Storage quotas](storage-quota.md) and use the shared Basic/Pro ledger.
Confirmation accounts for physical S3 bytes before attaching the business record;
failed attachment does not release storage occupied by the orphan candidate.

These methods are REQUIRED executable SQL adapters, not optional callbacks:

- `reserveImageWrite(input)`: atomically unique by project_id, seller_id,
  request_key. Store fingerprint, candidate object key, slot, expected revision,
  MIME, size and checksum before any S3 write. Reject a different fingerprint;
  return a committed replay with its original file, or busy for an unexpired
  lease. For a new/expired pending attempt acquire a fresh fencing lease token
  and return acquired with the original candidate key. Never reuse the key for
  different bytes. Keep abandoned candidates durable for reconciliation.
- `commitImageWrite(input)`: one transaction verifies current lease, fingerprint,
  ownership and expected slot revision; persists file metadata, binds the new
  file to the slot, increments revision, records the committed replay result,
  and enqueues the old file for cleanup. Return the file record with object key
  and revision, not a signed URL. Same-file replacement is a no-op; shared
  objects must not be queued for destructive removal while still referenced.

Provide unique constraints, row locking/CAS and durable lease expiry in the
real adapter. A Map/process-local mutex is insufficient for multiple workers.
Expired-lease retries keep the same object key and bytes; stale lease commits
are rejected. Slot revision conflicts return 409 with a reload/retry message.
Do not fall back to a new database or local JSON storage when the adapter is missing.

The writer deliberately never deletes objects on exception. A timeout after
database COMMIT is ambiguous: the write may have succeeded. Recover through the
same request key. Reconciliation checks pending requests, leases, transaction
results and current references before admitting an old unreferenced candidate
to `cleanupOrphans`. Persist cleanup failure and retry later. A janitor and its
real reference-check adapter are required before calling project integration
complete; do not implement cleanup with an in-memory task or immediate catch/delete.

## Display and deletion

Persist object keys/file IDs, not signed URLs, base64, blob: URLs or browser
localStorage. Generate a fresh signed URL on read using `signImage`; a URL
failure cannot undo a successful write. Return saved status separately from
display readiness. On link expiry refresh the read endpoint.

Banner deletion removes/disables the content reference transactionally first.
Queue only unreferenced objects for delayed cleanup. UI says 删除; internal
deletion_pending is an implementation detail, not an 归档 action.

## Evidence

Package tests cover scoped/encrypted transport, bytes validation, tracked
uploads, replay, lost commit acknowledgement and post-save URL failure. They
do not prove an AWS upload or a project's SQL adapter is connected. For delivery,
verify upload -> database commit -> refresh -> public image; unauthorized tenant,
concurrent slot edits, expired lease, failed commit acknowledgement, expired
signed URL, deletion/refcount and cleanup retry against the real project adapter.
