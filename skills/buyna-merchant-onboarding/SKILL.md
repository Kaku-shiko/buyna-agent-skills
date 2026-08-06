---
name: buyna-merchant-onboarding
description: "Safely register and activate one new merchant in an already approved Buyna multi-tenant backend. Use when a developer asks to add, onboard, register, configure, or validate a new merchant on existing database, S3, compute, port, and domain-routing resources without provisioning replacements."
---

# Buyna Merchant Onboarding

Add one merchant without changing existing merchants or creating infrastructure.

## First Move

1. Inspect the real application, tenant model, authentication, host routing, database, S3 key builder, deployment target, and rollback method.
2. Read the approved `projects/<project_id>/resources.yaml` or equivalent.
3. Require evidence that multi-tenant isolation and the existing merchant regression checks are already implemented and verified.
4. Read [references/onboarding-contract.md](references/onboarding-contract.md).
5. Stop with `BLOCKED: MULTITENANT_FOUNDATION_NOT_VERIFIED` when either prerequisite is missing.

## Intake Gate

Collect only:

- `project_id` and `seller_id`;
- legal/display name and exact primary domain;
- merchant type: product, service, or mixed;
- primary language and currency;
- administrator username or email;
- whether checkout/payment is required now;
- approved existing database, S3 bucket/region, compute target, application process, and port.

Allow customer materials and catalog content to remain pending. Never request or
print a plaintext password, password hash, AWS key, database URL, or payment
credential. Require secret entry through an approved local prompt or server-side
secret store.

Return the completed intake record and stop for approval. Do not register the
merchant during the intake step.

## Workflow

Complete exactly one numbered step, validate it, report its evidence, and stop
for explicit approval before continuing.

1. **Preflight** — Verify the fixed existing resources, current release, backup method, unique identifiers, exact host, and `NEW_EC2_INSTANCES: 0`.
2. **Staging copy** — Back up the database and run registration plus migrations on a disposable copy. Do not alter production data.
3. **Pending registration** — Create the merchant identity as inactive or pending in the existing database. Do not expose its domain yet.
4. **Data and storage scope** — Bind every owned query to `project_id + seller_id`; generate S3 keys under the approved project/seller prefix while retaining only required legacy reads.
5. **Administrator scope** — Configure one merchant administrator and prove its session cannot be reused for another seller.
6. **Application route** — Add the exact hostname to the existing application and Nginx route. Reuse the approved process and port; do not use a wildcard domain as a shortcut.
7. **Functional validation** — Validate login, category/product or service CRUD, image upload/display/replacement/deletion, order detail with the complete customer submission, refresh persistence, and cross-merchant denial.
8. **Activation** — Activate only this merchant after all applicable checks pass. Verify the live hostname and preserve the backup and previous release.

If payment is requested, keep it disabled until the applicable
`buyai-globepay-payment` workflow has its own credentials, callback, server-side
status verification, and controlled test. Never inherit another seller's payment
configuration.

## Boundaries

- Reuse the approved database, S3 bucket, EC2 instance, application process, and port.
- Never create a database, SQLite fallback, RDS/Aurora/DynamoDB resource, Bucket, EC2 instance, service, or extra port to bypass missing configuration.
- Never move or rewrite another merchant's rows, objects, domain, login, or payment settings.
- Never accept `project_id`, `seller_id`, owner paths, prices, or paid status from an untrusted browser as authority.
- Do not create a platform administrator, merchant switcher, or cross-merchant console.
- Do not add sample products, categories, optional modules, or future suggestions unless explicitly requested.
- Use only the minimum Skills required for the current step. Capability lists are not authorization to execute later steps.
- Raise only an immediate security, data-loss, payment, or execution blocker.

## Validate

Require all applicable evidence in the contract reference. Any cross-merchant
read/write, wrong S3 prefix, inherited payment configuration, missing rollback,
or existing-merchant regression is a failed onboarding.

Report the current step, status, changed paths/resources, executed checks,
rollback location, and the single next approval required. Then stop.
