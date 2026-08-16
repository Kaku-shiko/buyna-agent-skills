# Migration phases

## 1. Inventory

Record exact live resources, source code, domains, routes, processes, database identities, Schemas, ownership columns, S3 prefixes, order/payment paths, and rollback artifacts. Make no mutation.

## 2. Candidate data layer

Create backup, online capture, independent Schema, ownership fields, least-privilege role, replay, and digest verification inside the existing database. Do not switch traffic.

## 3. Candidate runtime

Update the ORM/driver Schema explicitly. Build and test a versioned candidate. Use an isolated Unix Socket or an already approved listener; do not create a new TCP port.

## 4. Cutover

Stop the source writer, replay to zero lag, atomically switch release/environment/routing, then verify health, catalog, login, orders, payment relations, storage, and real HTTPS. Automatic rollback is mandatory on failure.

## 5. Stabilize and retire

Remove change capture after acceptance. Keep source tables, old release, environment backup, and logical/PITR recovery during the stability window. Delete only with separate explicit approval.

## Resource identity correction track

Use the dedicated [resource identity migration](resource-identity-migration.md) track when data and Schemas stay in place but the RDS identifier, PostgreSQL database name, or both must be corrected. Do not run the Schema-copy phases for a name-only correction.
