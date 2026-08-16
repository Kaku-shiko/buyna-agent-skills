# Acceptance checklist

- All in-scope domains and services return expected health and catalog data.
- Admin login/session works for each merchant and fails across merchants.
- Target row counts/digests match the source at cutover; replay lag is zero.
- Every target business row has the correct `project_id` and seller ownership.
- Application roles cannot create databases/Schemas or read another merchant Schema.
- Existing order status routes return stored status; order items, payments, and payment events have no orphan rows.
- Paid orders have verified timestamps; payment success is provider-verified and idempotent.
- Product/image CRUD and S3 ownership paths pass when those features are in scope.
- Build, typecheck, automated tests, candidate checks, and real HTTPS checks pass.
- RDS PITR/logical backup, old release, environment/routing backups, and rollback commands remain available.
- No EC2, RDS, database, bucket, or TCP port was created.
