---
name: buyna-s3-storage
description: "Build or repair Buyna.ai image and file storage on Amazon S3. Use for upload, download, object naming, metadata, authorization, presigned URLs, replacement, deletion, and public delivery."
---

# Buyna.ai S3 Storage

Own files and images; keep business records in the database.

## Steps

1. Inspect buckets, regions, access model, existing object keys, and database metadata.
2. Define seller/entity namespacing and file validation.
3. Implement server-authorized upload, display, replacement, and cleanup.
4. Verify ownership and failure behavior.

## Rules

- Keep buckets private by default.
- Do not trust a browser-provided owner or object path.
- Validate file type, size, and authorization.
- Use short-lived presigned URLs when direct browser transfer is appropriate.
- Never place AWS credentials in frontend code.
- Prevent one seller from reading or replacing another seller's files.

## Done

Verify upload, display, replacement, deletion policy, metadata consistency, and mobile image behavior.
