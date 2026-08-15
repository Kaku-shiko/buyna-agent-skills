---
name: buyna-project-resource-registry
description: "Register, inspect, normalize, or repair one Buyna project resource record before database, storage, onboarding, migration, or AWS release work. Use for projects on shared EC2/RDS, AWS serverless, CloudFront static hosting, or retained external infrastructure without treating the record as permission to create or migrate resources."
---

# Buyna Project Resource Registry

Create one secret-free `projects/<project_id>/resources.yaml` that describes the verified live architecture. Registration is evidence, not authorization to provision, migrate, restart, or switch traffic.

## Workflow

1. Verify AWS identity when AWS resources are in scope. Inspect live DNS, routing, compute, database, storage, processes, ports, and payment/GMV event paths read-only.
2. Classify exactly one architecture from [the resource contract](references/resource-contract.md): `shared_ec2_postgresql`, `aws_serverless`, `aws_static`, or `external_legacy`.
3. Reconcile live evidence with the existing resource file. Use `unknown` for unverified fields; validation must remain blocked until required values are verified. Never copy a value from another merchant or guess from a domain name.
4. Save identifiers and secret *sources*, never credentials or complete connection URLs.
5. Run `node scripts/validate-resource-record.mjs --resource projects/<project_id>/resources.yaml` and stop unless it returns `pass`.
6. Report verified, recorded-only, conflicting, and blocked fields. Stop after registration; route later work separately.

## Boundaries

- Keep `allow_create_rds`, `allow_create_database`, `allow_create_bucket`, `allow_create_instance`, and `allow_create_distribution` false for existing projects.
- Distinguish RDS instance identifier, PostgreSQL database name, and schema. Never place the RDS identifier in `database.name`.
- An approved new merchant may create an isolated schema and tables inside the recorded existing PostgreSQL database only through `buyna-merchant-onboarding` plus `buyna-aws-data-layer`, after backup, reversible migration validation, and explicit approval. The resource record alone cannot authorize it.
- Preserve registered DynamoDB/Lambda/CloudFront projects such as BlueSequoia. Do not force them onto EC2/RDS during normal build or release work.
- A DNS record alone is not a deployment. Require matching routing and runtime/storage evidence.
- Do not store secrets, personal data, database URLs, payment credentials, or raw environment values.

## Routing

- PostgreSQL schema/query/migration work → `buyna-aws-data-layer`
- New merchant identity and approved schema creation → `buyna-merchant-onboarding`
- Files and object lifecycle → `buyna-s3-storage`
- Architecture migration → the approved migration workflow, one phase at a time
- Deployment and live verification → `aws-project-deployer` then `buyna-aws-release`

Return `RESOURCE_REGISTRY_STATUS`, `ARCHITECTURE_TYPE`, `RESOURCE_FILE`, `VERIFIED_RESOURCES`, `CONFLICTS`, `BLOCKERS`, and `NEXT_SKILL`. Set `NEXT_SKILL: none` for a registration-only request; otherwise select one Skill from the user's separately stated next action.
