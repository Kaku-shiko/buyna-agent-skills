---
name: buyna-aws-data-layer
description: "Design or repair Buyna.ai structured data on AWS. Use for existing PostgreSQL, RDS or Aurora schemas, project isolation, ORM models, migrations, ownership, constraints, indexes, backups, and safe data changes without creating replacement databases."
---

# Buyna.ai AWS Data Layer

Own structured business data and its safe evolution without forcing a backend framework.

## Steps

1. Read `projects/<project_id>/resources.yaml`, or locate the equivalent approved resource record.
2. Run `node scripts/inspect-existing-resources.mjs --resource <path>` and stop unless it returns `pass`.
3. Report the existing database engine, connection source, database/schema name, framework, migration system, S3 bucket, region, and project prefix.
4. Use `packages/buyna-postgres-merchant-core`; select its existing `node-postgres` adapter when the project uses `pg`.
5. Read `references/orm-adapter-contract.md` and generate only an adapter when the approved ORM is not already supported.
6. Run `node scripts/validate-migration.mjs --up <path> --down <path>` before any migration execution and stop unless it returns `pass`.
7. Validate project/seller isolation on development or staging.

## Existing Resource Gate

Stop with `BLOCKED: EXISTING_RESOURCES_NOT_CONFIRMED` when the approved database, bucket, project id, seller id, or connection source cannot be identified. Never create a substitute SQLite file or cloud resource to continue.

Require a secret-free project resource record:

```yaml
project: {id: asuka-shop, seller_id: seller_asuka}
database:
  mode: existing
  engine: postgresql
  connection_source: DATABASE_URL
  name: confirmed-database-name
  schema: asuka_shop
  allow_create_database: false
storage:
  mode: existing
  bucket_source: AWS_STORAGE_BUCKET_NAME
  region: ap-northeast-1
  prefix: projects/asuka-shop/
  allow_create_bucket: false
deployment:
  instance_ip: 35.73.127.215
  allow_create_instance: false
```

## Code Delivery

Deliver schema/ORM/query-layer files, reversible migrations, and applicable
tests in the real project. Report changed paths and migration/test results.
Do not complete this Skill with a schema description alone.

Do not regenerate merchant scoping, pagination, transaction, or idempotency
orchestration already supplied by `buyna-postgres-merchant-core`. Configure an
entity allowlist and call the fixed module. Run its package tests before
project integration.

## Rules

- Keep production databases private.
- Preserve the project's approved backend framework; do not require Django.
- Use canonical `project_id` and `seller_id` on every owned record, query, constraint, and index. Never query an owned entity by its id alone.
- Reuse the approved connection and migration system. Never issue `CREATE DATABASE`, provision RDS/Aurora/DynamoDB, or create a local SQLite fallback.
- Add schema changes only as reversible migrations in the existing project and database.
- Store files as S3 object metadata, not database blobs.
- Store credentials only in server-side secret configuration.
- Require backups and rollback planning before destructive changes.
- Do not introduce Supabase tables or clients unless a retained legacy dependency explicitly requires them.
- Do not let projects read each other's tables or storage directly. Cross-project access must use an authenticated server API, default to read-only, and log caller, target project, operation, and result.

## Handoff

Use the selected project or merchant backend skill for APIs and `buyna-aws-release` for production migration execution.
