# Project Resource Contract

Every record starts with:

```yaml
record:
  version: 1
  lifecycle: verified
  checked_at: 2026-08-15T00:00:00Z
  evidence_source: aws-and-runtime-inspection
project:
  id: project-slug
  seller_id: merchant_seller
architecture:
  type: shared_ec2_postgresql
domains:
  primary: shop.example.com
release_limits:
  new_ec2_instances: 0
  new_databases: 0
  new_buckets: 0
  new_ports: 0
projectDeploymentBaseline:
  version: 1
  status: confirmed
  resourceRecordDigest: normalized-stable-resource-record-digest
  account_id: confirmed-aws-account-id
  region: confirmed-region
  architecture_type: shared_ec2_postgresql
  target_id: confirmed-instance-id
  zero_create_policy_digest: confirmed-zero-create-policy-digest
  inspection_authority_id: ed25519-sha256-of-pinned-public-key
  inspection_receipt_path: resources.deployment-inspection.json
  inspection_receipt_digest: sha256-of-external-inspection-receipt
  verified_at: 2026-08-15T00:00:00Z
```

`projectDeploymentBaseline` is created once by
`buyna-project-resource-registry` after real AWS and runtime inspection. Reuse
it across later AI tasks and every subsequent release; a new chat, new agent,
application version, deployment date, mutable public IP, or temporary SSM
availability change does not expire it. Do not rerun the full STS/account,
instance ownership, current-IP, SSM-online, or zero-create gate merely because
another release started.

Compute `resourceRecordDigest` from stable resource identity and policy fields,
excluding mutable evidence such as `checked_at`, public IP, current state, and
SSM availability. Invalidate the baseline only when the normalized resource
record digest changes the AWS account, region, `instance_id`/target,
architecture, ownership boundary, or zero-create policy; also invalidate it
when the operator explicitly approves a resource migration. Missing or
conflicting baseline evidence fails closed. An SSM connection failure during a
release is an execution/connection error for that release, not automatic
baseline invalidation.

The baseline is valid only with its separate secret-free, Ed25519-signed
inspection receipt. The receipt must be produced by the trusted AWS/runtime
inspection Adapter and verified with the operator-pinned public key from
`BUYNA_DEPLOYMENT_INSPECTION_PUBLIC_KEY_FILE`; a caller cannot supply or switch
that key through chat or CLI arguments. That exact receipt records the STS
account, region, architecture, stable target, confirmed ownership evidence
digest, confirmed runtime-inspection digest, inspection sources, observation
time, authority ID, algorithm, and signature. The writer validates the complete
candidate first, records a recovery journal, then replaces the receipt and
resource record. Any write/validation failure restores both previous files; an
interrupted prepared journal is rolled back on the next validator run. It then
atomically commits the pair and reloads both files with
`--require-deployment-baseline`. An unsigned local JSON,
AI/chat value, or free-text account ID is never a receipt.

The baseline may record the approved runtime identity, but mutable shared-host
allocation is not cacheable. Immediately before any real write, perform one
low-cost read-only runtime-slot check for the current project's application
directory, process/service, Unix Socket or assigned port, Nginx host route,
environment source, and log path. A temporary SSM failure is a connection
error; a slot owned by another project is `BLOCKED: RUNTIME_SLOT_CONFLICT`
before files are replaced. This check does not rerun STS, instance ownership,
IP, database, Bucket, or zero-create discovery.

Record both IDs exactly as verified; accept `^[a-z0-9][a-z0-9_-]{0,79}$` and never derive or copy them.

Use lifecycle `candidate` for a new independent project, then
`approved -> provisioned -> verified -> active`. A candidate may name a proposed
Schema, runtime identity, route, and S3 prefix, but must clearly mark them as
candidate and cannot authorize their creation. Shared foundation identifiers
must already be verified.

Use environment-variable, Secrets Manager, or service configuration names as sources. Never record their values.

## Shared EC2 and PostgreSQL

```yaml
database:
  mode: existing
  provider: aws_rds
  engine: postgresql
  region: ap-northeast-1
  instance_identifier: confirmed-rds-identifier
  connection_source: DATABASE_URL
  name: confirmed-database-name
  schema: confirmed-project-schema
  resource_tags:
    Name: confirmed-rds-identifier
    Project: shared-workload-name
    Environment: production
    DatabaseName: confirmed-database-name
    TenantModel: independent-schema-project-id-seller-id
    ResourceMode: existing-buyna-resources
  allow_create_rds: false
  allow_create_database: false
  allow_create_schema: false
storage:
  mode: existing
  provider: s3
  region: ap-northeast-1
  bucket_source: AWS_STORAGE_BUCKET_NAME
  bucket: confirmed-bucket
  prefix: projects/project-slug/sellers/seller-id/
  allow_create_bucket: false
deployment:
  mode: existing
  provider: ec2
  region: ap-northeast-1
  instance_id: confirmed-instance-id
  instance_ip: confirmed-ip
  allow_create_instance: false
  allow_create_port: false
routing:
  ingress: nginx
  runtime_source: verified-systemd-or-static-root
```

`deployment.instance_id` is the stable EC2 identity. `deployment.instance_ip` is mutable network evidence, not project identity: resolve it from AWS for the registered account, region, and instance ID, then refresh this secret-free record when the same verified instance receives a different address. An IP change on that same instance does not authorize new infrastructure and is not an ownership mismatch. Block only when the account, region, instance ID, tags/environment ownership, or required evidence conflicts or cannot be verified.

`allow_create_schema: true` is valid only in an already approved onboarding/migration candidate record. It does not authorize execution and must include `schema_change_mode: approved_reversible_migration`.

The same existing EC2 instance, RDS instance, PostgreSQL database, and approved
shared bucket may appear in multiple project records. This is expected shared
foundation evidence, not copied merchant configuration. Never reuse another
project's Schema, process, Unix Socket, environment source, S3 prefix, logs,
credential, or business data.

`database.resource_tags` is secret-free operational metadata. When present, `Name` must equal `database.instance_identifier` and `DatabaseName` must equal the database that applications actually connect to. If the RDS console retains an immutable initial database name after PostgreSQL `ALTER DATABASE ... RENAME`, record it only as `LegacyProvisionedDbName`; do not treat it as the active database.

When a verified legacy EC2/PostgreSQL project uses local/EBS files instead of S3, record `storage.provider: local_ebs`, `storage.root_source`, and `storage.migration_status`; do not invent a bucket. New shared merchants continue to use the approved existing S3 bucket.

## AWS serverless

Use for registered AWS serverless projects:

```yaml
architecture:
  type: aws_serverless
database:
  mode: existing
  engine: dynamodb
  region: ap-northeast-1
  table_names: existing-commerce-table,existing-cache-table
  allow_create_database: false
storage:
  mode: existing
  provider: s3
  bucket_names: existing-assets-bucket,existing-images-bucket
  allow_create_bucket: false
deployment:
  mode: existing
  provider: lambda_open_next
  region: ap-northeast-1
  function_names: existing-server-function,existing-image-function
  allow_create_instance: false
routing:
  provider: cloudfront
  distribution_id: existing-distribution-id
  origin_evidence: verified-origin-or-routing-export
  function_association_evidence: verified-cloudfront-function-or-behavior
  allow_create_distribution: false
```

Do not describe serverless DynamoDB as RDS or add an EC2 target merely to satisfy another Skill.

## Other architectures

Use `architecture.type: aws_static` with existing S3 and CloudFront routing when the site has no database or compute. Use `architecture.type: external_legacy`, exact provider/origin evidence, and `migration_status` for retained external hosting; do not claim AWS ownership or migrate it implicitly.

## Conflict rules

- `database.instance_identifier` is an AWS RDS resource; `database.name` is inside PostgreSQL.
- Renaming an RDS identifier changes the endpoint and restarts the instance. Renaming a PostgreSQL database changes every consumer connection string. Neither operation creates a database, but both require an explicit maintenance-window migration and complete consumer inventory.
- Every merchant-owned PostgreSQL operation remains scoped by server-derived `project_id + seller_id`, even with a dedicated schema.
- S3 prefixes are server generated and ownership scoped.
- Wildcard DNS does not prove a project exists.
- A running service without production routing is candidate/dormant, not live.
- Existing serverless resources remain valid architecture; normal release work must not replace them.
- `unknown`, `unverified`, `pending`, `placeholder`, `tbd`, `todo`, and `n/a` values document gaps but never satisfy validation.
- Every existing-resource record requires all four `release_limits` values to be numeric zero. A normal website request never authorizes a non-zero value.
