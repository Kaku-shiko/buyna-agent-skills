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

## Browser entry and complete save operation

Import browser helpers from `@buyna/merchant-file-core/upload` (or
`packages/buyna-merchant-file-core/src/browser.mjs` for direct project imports).
Never import `src/file-core.mjs` into a browser component: it includes Node-only
scaffolding and server storage code. The package root has a browser condition,
but the explicit `/upload` entry is preferred for unambiguous builds.

Use `createImageUploadClient({api})` for the complete browser save flow:
`saveImage({entityId,file,requestKey,altText,signal})`. Keep the original File
outside the upload queue snapshot, keyed by its item ID; snapshots/effects
intentionally contain only name, MIME type and size, not transferable bytes.

Implement these authenticated project API Adapter methods:
- `prepareUpload({entityId,filename,contentType,size,requestKey})` resolves fresh
  server-owned merchant scope, validates size/MIME/entity access, and returns
  `{uploadId,url,headers}` for a presigned PUT in the existing bucket. Bind the
  opaque upload ID and stable request key to the owner, entity and object key.
- `attachImage({entityId,uploadId,requestKey,altText})` resolves that binding
  server-side and calls product `attachUploadedImage` (or the equivalent entity
  relation). Return the persisted `{imageId}`. Do not trust browser object keys.
- `getEntity({entityId})` performs an uncached authenticated read and returns
  `{id,images:[{id,url,...}]}` with newly resolved display URLs.

The client transfers the actual File as the PUT body, checks HTTP success,
awaits association, then reads the entity again and verifies the image ID.
Map `signal` to request cancellation locally, not into JSON payloads. Surface
errors and retain file/text state for retry. The backend must reuse the same
object/metadata binding for a repeated stable request key; do not use the
queue's attempt-specific effect ID as that key. Use a server-generated stable
upload key or the queue item ID after validating its binding.

Choose one transport owner. When `saveImage` owns the transfer and association,
use queue transitions only for presentation; do not also execute upload/confirm
effects for the same item. Existing effect-executor integrations may remain,
but must resolve real bytes by item ID and supply the same complete sequence.
Keep the effect claim executor on the trusted server when it controls storage
or metadata operations. Test the real project Adapters before claiming live
persistence; this repository's in-memory tests do not verify customer AWS.
