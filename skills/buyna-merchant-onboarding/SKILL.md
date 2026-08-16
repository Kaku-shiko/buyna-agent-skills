---
name: buyna-merchant-onboarding
description: "Safely register and activate one new merchant in an already approved Buyna multi-tenant backend. Use when a developer asks to add, onboard, register, configure, or validate a new merchant on existing database, S3, compute, port, and domain-routing resources without provisioning replacements."
---

# Buyna Merchant Onboarding

Add one merchant without changing existing merchants or creating infrastructure.

## First Move

1. Inspect the real application, tenant model, authentication, host routing, database, S3 key builder, deployment target, and rollback method.
2. Use `buyna-project-resource-registry` to validate the approved `projects/<project_id>/resources.yaml`; require `shared_ec2_postgresql` for this onboarding path.
3. Require evidence that multi-tenant isolation and the existing merchant regression checks are already implemented and verified.
4. Read [references/onboarding-contract.md](references/onboarding-contract.md).
5. Stop with `BLOCKED: MULTITENANT_FOUNDATION_NOT_VERIFIED` when either prerequisite is missing.

## Intake Gate

Resolve identity before asking intake questions:

1. Run `node scripts/resolve-merchant-identity.mjs --primary-host <host> --registry-root projects`, adding explicitly supplied IDs when present.
2. Reuse an exact registered pair. For a new merchant, use the generated candidate in the intake record and verify uniqueness; do not ask the user to invent IDs.
3. Ask one ID question only when the script returns `PROJECT_ID_SOURCE_REQUIRED`, `*_INVALID`, or `MERCHANT_IDENTITY_COLLISION`.

Then collect only:

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
for explicit approval before continuing. If the user explicitly approves the
complete bounded onboarding plan, continue only after each automated gate
passes and stop immediately on the first failed gate.

1. **Preflight** — Run the Existing Resource Gate; verify the fixed existing resources, current release, backup method, unique identifiers, and exact host. Require `RESOURCE_MODE: existing_buyna_resources`, `NEW_EC2_INSTANCES: 0`, `NEW_DATABASES: 0`, `NEW_BUCKETS: 0`, and `NEW_PORTS: 0`.
2. **Staging copy** — Back up the database and run registration plus reversible schema/table migrations on a disposable copy. Do not alter production data.
3. **Pending registration** — Create the merchant identity as inactive or pending in the existing database. Do not expose its domain yet.
4. **Project file layout** — For a new local project directory only, call
   `packages/buyna-merchant-file-core` `scaffoldMerchantProject` with the
   approved `project_id`, `seller_id`, and merchant type. Stop if the target
   already exists; never overwrite it or create replacement AWS resources.
5. **Data and storage scope** — Bind every owned query to `project_id + seller_id`;
   route file lifecycle work to `buyna-s3-storage`, which uses the fixed file
   core, while retaining only required legacy reads.
6. **Administrator scope** — Configure one merchant administrator and prove its session cannot be reused for another seller.
7. **Application route** — Add the exact hostname to the existing application and Nginx route. Reuse the approved process and port; do not use a wildcard domain as a shortcut.
8. **Functional validation** — Validate login, category/product or service CRUD, image upload/display/replacement/deletion, order detail with the complete customer submission, payment/subscription settings, refresh persistence, and cross-merchant denial.
9. **Activation** — Activate only this merchant after all applicable checks pass. Verify the live hostname and preserve the backup and previous release.

Register every merchant identity in CRM with `project_id + seller_id`, add its
`seller_id` to the server-side subscription-read allowlist, and verify that the
merchant Dashboard can read only its own plan, status, start date, and domain.
Do not copy a case project's identity or credential. When
payment is required now, route a mandatory pre-activation step to
`buyna-gmv-commerce`: install the fixed module, create the outbox and worker,
bind the CRM credential, and verify paid/refund synchronization. When payment
is not required, retain a disabled GMV binding that is activated with payment
later. GMV is not permission to change payment configuration or deploy
production.

If payment is requested, keep it disabled until the applicable
`buyai-globepay-payment` workflow has its own credentials, callback, server-side
status verification, and controlled test. Never inherit another seller's payment
configuration.

## Boundaries

- Reuse the approved database, S3 bucket, EC2 instance, application process, and port.
- Never create a database, SQLite fallback, RDS/Aurora/DynamoDB resource, Bucket, EC2 instance, service, or extra port to bypass missing configuration. A new isolated merchant schema inside the registered existing PostgreSQL database is allowed only in the approved staging/pending-registration sequence with backup, reversible migration, and explicit approval.
- Call `@buyna/postgres-merchant-core/schema-migration` before an approved isolated-Schema candidate; keep the existing database name unchanged.
- Stop with `BLOCKED: EXISTING_RESOURCES_NOT_CONFIRMED` when a required resource is missing, unverified, or a placeholder. Do not recommend replacement infrastructure as the next step.
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
