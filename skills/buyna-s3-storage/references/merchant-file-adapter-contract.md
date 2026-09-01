# Merchant File Adapter Contract

Use `packages/buyna-merchant-file-core` for project scaffolding, object keys,
upload confirmation, replacement, soft deletion, and orphan cleanup. Generate
only adapters for the approved existing S3 bucket and PostgreSQL metadata.

## Upload Queue And Effect Executor

Use `createUploadQueue` for selected/validating/uploading/confirming/ready,
retry, progress, ordering, cover, cancellation, and removal behavior. Execute
its effects through `createUploadEffectExecutor`, whose Effect Store Adapter
claims each `(projectId, sellerId, idempotencyKey)` before invoking exactly one
S3 or metadata Adapter handler. The project generates picker, preview, order,
cover, progress, error, and mobile UI; the package supplies no visible design.

The executor handlers adapt `validate_file`, `upload_object`,
`confirm_upload`, `remove_file`, and `abort_upload`. S3 transport remains an
Adapter. Existing confirm, replace, delete, and cleanup lifecycle ordering
remains owned by the same fixed package.

## Storage Adapter

Implement:

```js
{
  headObject({key}),
  deleteObject({key})
}
```

`headObject` returns `{ size, contentType, etag }` or `null`. Configure the
adapter with the existing private bucket and region from the approved resource
record. Do not accept a bucket or object owner from browser input and do not
create a bucket.

The project upload route may generate a short-lived presigned upload only after
calling the fixed key builder and applying the same MIME/size policy. Always
call `confirmUpload` afterward; a presigned URL or successful browser request
alone is not stored-file proof.

## Metadata Adapter

Implement `confirmUpload`, `transaction`, `softDelete`,
`listCleanupCandidates`, `isReferenced`, `markObjectDeleted`,
`markDeletionFailed`, and `markCleanupFailed`. The transaction adapter must
implement `getFileById` and `replaceFile`.

Every method must apply the fixed `projectId + sellerId` scope through
`buyna-postgres-merchant-core`. Store object metadata only, never file bytes.

`confirmUpload` receives the server-generated stable `requestKey`. Enforce a
unique `(project_id, seller_id, request_key)` metadata claim atomically and
return `{ id, created: true }` only for the winning insert. A replay returns the
same file with `created: false`; never create a second file row for the same
request key. Product-media compensation is allowed to soft-delete only a file
whose current request returned `created: true` and which is still unreferenced.
Use statuses such as `confirmed`, `active`, `deletion_pending`, `deleted`, and
`cleanup_failed` consistently.

Replacement must activate the confirmed new file and mark the old metadata for
deletion in one database transaction. Object deletion occurs only afterward.
Soft deletion must not delete S3 immediately. Cleanup candidates must be older
than the fixed safety interval and pass a current reference check.
