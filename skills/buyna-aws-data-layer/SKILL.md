---
name: buyna-aws-data-layer
description: "Design or repair Buyna.ai structured data on AWS. Use for PostgreSQL, RDS or Aurora schemas, ORM models, migrations, ownership, constraints, indexes, backups, and safe data changes across supported backend frameworks."
---

# Buyna.ai AWS Data Layer

Own structured business data and its safe evolution without forcing a backend framework.

## Steps

1. Inspect the actual database engine, framework, ORM or query layer, migrations, and existing records.
2. Define owners, relations, constraints, status fields, timestamps, and indexes.
3. Prepare reversible migrations and a data-preservation plan.
4. Validate on development or staging before production.

## Rules

- Keep production databases private.
- Preserve the project's approved backend framework; do not require Django.
- Use canonical `seller_id` for merchant isolation.
- Store files as S3 object metadata, not database blobs.
- Store credentials only in server-side secret configuration.
- Require backups and rollback planning before destructive changes.
- Do not introduce Supabase tables or clients unless a retained legacy dependency explicitly requires them.

## Handoff

Use the selected project or merchant backend skill for APIs and `buyna-aws-release` for production migration execution.
