# Merchant File Adapter Contract

Use `packages/buyna-merchant-file-core` for project scaffolding, object keys,
upload confirmation, replacement, soft deletion, and orphan cleanup. Generate
only adapters for the approved existing S3 bucket and PostgreSQL metadata.

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
Use statuses such as `confirmed`, `active`, `deletion_pending`, `deleted`, and
`cleanup_failed` consistently.

Replacement must activate the confirmed new file and mark the old metadata for
deletion in one database transaction. Object deletion occurs only afterward.
Soft deletion must not delete S3 immediately. Cleanup candidates must be older
than the fixed safety interval and pass a current reference check.
