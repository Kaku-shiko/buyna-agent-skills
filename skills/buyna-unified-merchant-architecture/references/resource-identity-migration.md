# Existing RDS resource identity migration

Use this track only when the approved existing RDS instance and its data remain in place while correcting the RDS identifier, PostgreSQL database name, or both. It is not permission to create or restore another RDS instance.

## Before mutation

1. Validate secret-free before/after resource records with `validate-resource-identity-migration.mjs`.
2. Verify AWS account, Region, RDS ARN/status, current endpoint, actual `current_database()`, Schemas, tags, deletion protection, encryption, PITR, and zero new-resource counters.
3. Inventory every consumer of the old endpoint or database name: web APIs, admin services, workers, payment Notify/status writers, GMV outbox, scheduled backup/sync jobs, ORMs, systemd environment files, Secrets Manager references, and operational scripts.
4. Capture baseline HTTPS/catalog/order-status results and database row counts. Record public payment and S3 paths; they must not change.
5. Create an available encrypted RDS snapshot, protected logical backup with checksum, and permission-preserving copies of every active environment file.

## Cutover

1. Stop all database writers, not only the merchant named in the legacy RDS identifier.
2. Connect to a different database, terminate remaining sessions to the target database, and run `ALTER DATABASE old_name RENAME TO new_name`.
3. Update only the database-name component in every consumer connection source. Start consumers and verify reads/writes before continuing.
4. Stop consumers again. Rename the existing RDS identifier with `ModifyDBInstance`; wait for the new identifier to be `available` before using its endpoint.
5. Replace the old endpoint in every active consumer configuration, probe `current_database()` through the new endpoint, then start consumers.
6. Update RDS tags and resource records. Treat an RDS console initial `DBName` retained from provisioning as legacy metadata, not the active PostgreSQL database.

## Gates and rollback

- Abort before mutation if a consumer, credential source, backup, target identifier, target database name, or maintenance window is unverified.
- After the database rename, automatically restore environment files and rename the database back if service/read/write checks fail.
- After the RDS rename, rollback requires another controlled RDS rename and endpoint restoration; do not improvise DNS aliases or create a replacement RDS.
- Verify real domains, admin login, catalog read, reversible product write, stored order status, invalid Notify rejection, S3 put/head/delete cleanup, payment/GMV row integrity, service logs, backup checksum, and old-reference scan.
- A controlled real payment is a separate approval. Do not claim payment success from a Return page, HTTP 200, or invalid Notify rejection.

Return `RESOURCE_MODE: existing_buyna_resources`, all four `NEW_*` counters as zero, before/after identifiers, consumer inventory, backup evidence, validation evidence, rollback commands, and any untested real-payment boundary.
