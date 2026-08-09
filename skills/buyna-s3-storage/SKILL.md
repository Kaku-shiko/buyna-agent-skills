---
name: buyna-s3-storage
description: "Build or repair Buyna.ai image and file storage in an existing Amazon S3 bucket. Use for project-isolated upload, download, object naming, metadata, authorization, presigned URLs, replacement, deletion, cleanup, and public delivery without provisioning new storage."
---

# Buyna.ai S3 Storage

Own files and images; keep business records in the database.

## Steps

1. Run the `buyna-aws-data-layer` Existing Resource Gate and read the approved project resource record.
2. Inspect the existing bucket, region, project prefix, access model, object keys, and database metadata.
3. Use `packages/buyna-merchant-file-core`; do not regenerate project/seller key construction or lifecycle ordering.
4. Read `references/merchant-file-adapter-contract.md` and implement only the approved S3 and PostgreSQL metadata adapters.
5. Call the fixed `confirmUpload`, `replaceObject`, `softDelete`, and `cleanupOrphans` interfaces from project routes or jobs.
6. Run `npm test --prefix packages/buyna-merchant-file-core` before project integration.
7. Verify ownership, rollback, and failure behavior.

## Rules

- Keep buckets private by default.
- Reuse the approved bucket. Never create a bucket, database, DynamoDB table, or SQLite file as a storage fallback.
- Stop with `BLOCKED: EXISTING_RESOURCES_NOT_CONFIRMED` when the bucket, region, project id, seller id, or metadata target is unknown.
- Do not trust a browser-provided owner or object path.
- Validate file type, size, and authorization.
- Use short-lived presigned URLs when direct browser transfer is appropriate.
- Never place AWS credentials in frontend code.
- Prevent one seller from reading or replacing another seller's files.
- Generate keys on the server as `projects/{project_id}/sellers/{seller_id}/{entity_type}/{entity_id}/{uuid}.{ext}`.
- Store only object metadata and ownership in the existing database; never store file blobs there.
- Upload a replacement first, update metadata transactionally, then delete the old object. Mark failed uploads for cleanup.
- Soft-delete metadata before asynchronous object deletion. Clean orphans only after a safety interval and ownership/reference checks.
- Never access another project's prefix directly. Cross-project file access must use an authenticated server API.

## Done

Verify upload, display, replacement, deletion policy, metadata consistency, and mobile image behavior.

Deliver the server-side storage code, configuration without secrets, cleanup
logic, and applicable tests in the real project. Report changed paths and
verification results; storage rules written only as documentation are not
complete.

Use `scaffoldMerchantProject` only for a new local project directory and stop
when the target already exists. Its incomplete resource record is intentionally
blocked until the real existing database, schema, bucket, and region are
confirmed.
