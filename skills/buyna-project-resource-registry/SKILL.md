---
name: buyna-project-resource-registry
description: "Register, inspect, normalize, or repair one Buyna project resource record before database, storage, onboarding, migration, or AWS release work. Use for projects on shared EC2/RDS, AWS serverless, CloudFront static hosting, or retained external infrastructure without treating the record as permission to create or migrate resources."
---

# Buyna Project Resource Registry

Create one secret-free `projects/<project_id>/resources.yaml`. Existing projects
describe verified live architecture. New independent projects may start with a
`candidate` record that separates verified shared resources from proposed
project-owned identities. Registration is evidence, not authorization to
provision, migrate, restart, or switch traffic.

Use `packages/buyna-resource-evidence-core` for evidence receipts and escalation
decisions. Never reproduce its placeholder, lifecycle, expiry, shared/project
classification, or automatic-inspection rules in prose.

## Workflow

1. Classify the request as `new_independent`, `existing_alias`, or
   `existing_migration` before selecting a route. Honor the user's explicit
   classification after identity-collision checks.
2. Verify AWS identity when AWS resources are in scope. Inspect live DNS, routing, compute, database, storage, processes, ports, and payment/GMV event paths read-only. Record AWS, runtime, and DNS Adapter attempts, then call `decideHumanEscalation`. Ask a person only when it returns `AUTOMATIC_INSPECTION_EXHAUSTED`.
3. Classify exactly one architecture from [the resource contract](references/resource-contract.md): `shared_ec2_postgresql`, `aws_serverless`, `aws_static`, or `external_legacy`.
4. Reconcile live evidence with the resource file. Shared EC2/RDS/database/bucket
   identifiers may legitimately repeat. Never copy project-owned Schema,
   process, environment source, S3 prefix, credential, or data.
5. Save identifiers and secret *sources*, never credentials or complete connection URLs.
6. Run `node scripts/validate-resource-record.mjs --resource projects/<project_id>/resources.yaml` and stop unless it returns `pass`.
7. Create and assess the fixed evidence receipt. Report verified, candidate,
   conflicting, expired, and blocked fields. Stop after registration; route
   later work separately.

## Boundaries

- Keep `allow_create_rds`, `allow_create_database`, `allow_create_bucket`, `allow_create_instance`, and `allow_create_distribution` false for existing projects.
- Repeated shared-resource identifiers are not cross-project ownership. Isolation
  applies to Schema, `project_id + seller_id`, runtime identity, environment
  source, S3 prefix, logs, credentials, and business data.
- Distinguish RDS instance identifier, PostgreSQL database name, and schema. Never place the RDS identifier in `database.name`.
- An approved new merchant may create an isolated schema and tables inside the recorded existing PostgreSQL database only through `buyna-merchant-onboarding` plus `buyna-aws-data-layer`, after backup, reversible migration validation, and explicit approval. The resource record alone cannot authorize it.
- Preserve registered DynamoDB/Lambda/CloudFront projects. Do not force them onto EC2/RDS during normal build or release work.
- A DNS record alone is not a deployment. Require matching routing and runtime/storage evidence.
- Do not store secrets, personal data, database URLs, payment credentials, or raw environment values.

## Routing

- PostgreSQL schema/query/migration work → `buyna-aws-data-layer`
- New merchant identity and approved schema creation → `buyna-merchant-onboarding`
- Files and object lifecycle → `buyna-s3-storage`
- Architecture migration → the approved migration workflow, one phase at a time
- Deployment and live verification → `aws-project-deployer` then `buyna-aws-release`

Return `RESOURCE_REGISTRY_STATUS`, `ARCHITECTURE_TYPE`, `RESOURCE_FILE`, `VERIFIED_RESOURCES`, `CONFLICTS`, `BLOCKERS`, and `NEXT_SKILL`. Set `NEXT_SKILL: none` for a registration-only request; otherwise select one Skill from the user's separately stated next action.
