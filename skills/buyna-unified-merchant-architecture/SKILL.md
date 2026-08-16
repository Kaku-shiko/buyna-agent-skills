---
name: buyna-unified-merchant-architecture
description: "Audit, standardize, or migrate existing Buyna merchant sites inside approved AWS resources. Use for shared-RDS schema isolation, project_id and seller_id repair, online source-to-schema migration, merchant runtime routing, payment-path preservation, rollback, or consolidating mixed merchant architectures without creating EC2, RDS, databases, buckets, or TCP ports."
---

# Buyna Unified Merchant Architecture

Migrate one merchant at a time. Standardize ownership and interfaces without merging merchant data or redesigning the storefront.

## Workflow

1. Read the project's verified `resources.yaml` and [architecture contract](references/architecture-contract.md). Stop on missing or placeholder evidence.
2. Inspect the live database, runtime, exact host route, S3 prefix, order/payment path, backup state, and current source code read-only.
3. Select only the first incomplete slice from [migration phases](references/migration-phases.md). If the user explicitly approved the complete bounded plan, continue across slices only after each automated gate passes; otherwise stop for approval.
4. For a shared-RDS schema migration, call `@buyna/postgres-merchant-core/schema-migration` before producing SQL. Use the source-only online pattern in [schema migration contract](references/schema-migration-contract.md).
5. Deliver code/configuration and evidence for the active slice. Roll back automatically when a gate fails.
6. Finish only after [acceptance checklist](references/acceptance-checklist.md) passes on every in-scope real domain.

## Hard boundaries

- Reuse the registered RDS instance and PostgreSQL database. An explicitly approved reversible migration may create one merchant Schema inside that database; it may not create another database or RDS instance.
- Keep `NEW_EC2_INSTANCES`, `NEW_DATABASES`, `NEW_BUCKETS`, and `NEW_PORTS` at zero.
- Use server-derived `project_id` and `seller_id`. Existing UUID seller keys may remain UUIDs; document the immutable ownership relation.
- Keep one canonical payment-status writer per merchant. Notify or verified provider query—not Return/redirect—may mark paid or refunded.
- Use Nginx on `80/443`. Reuse an approved shared API listener or a permission-restricted merchant Unix Socket; never allocate a new merchant TCP port implicitly.
- Never place credentials, connection URLs, customer data, payment payloads, or backup contents in Git, Skill files, or reports.
- Preserve the previous release, environment backup, source copy, and database backup until the stability window and explicit retirement approval pass.

## Routing

- Resource evidence → `buyna-project-resource-registry`
- PostgreSQL ownership and adapters → `buyna-aws-data-layer`
- New merchant registration → `buyna-merchant-onboarding`
- S3 lifecycle → `buyna-s3-storage`
- Payment implementation/status → `buyai-globepay-payment`, then `buyai-globepay-status-sync`
- Production release → `aws-project-deployer`, then `buyna-aws-release`
- Final verification → `buyna-testing-quality`

Load only the routed Skill needed by the active slice.

Return `MIGRATION_SLICE`, `RESOURCE_EVIDENCE`, `CHANGED_FILES`, `DATABASE_EVIDENCE`, `LIVE_EVIDENCE`, `ROLLBACK`, `BLOCKERS`, and `NEXT_SLICE`.
