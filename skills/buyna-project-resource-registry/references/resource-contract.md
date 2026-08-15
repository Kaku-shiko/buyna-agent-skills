# Project Resource Contract

Every record starts with:

```yaml
record:
  version: 1
  checked_at: 2026-08-15T00:00:00Z
  evidence_source: aws-and-runtime-inspection
project:
  id: project-slug
  seller_id: seller-id
architecture:
  type: shared_ec2_postgresql
domains:
  primary: shop.example.com
release_limits:
  new_ec2_instances: 0
  new_databases: 0
  new_buckets: 0
  new_ports: 0
```

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

`allow_create_schema: true` is valid only in an already approved onboarding/migration candidate record. It does not authorize execution and must include `schema_change_mode: approved_reversible_migration`.

When a verified legacy EC2/PostgreSQL project uses local/EBS files instead of S3, record `storage.provider: local_ebs`, `storage.root_source`, and `storage.migration_status`; do not invent a bucket. New shared merchants continue to use the approved existing S3 bucket.

## AWS serverless

Use for BlueSequoia-like projects:

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
- Every merchant-owned PostgreSQL operation remains scoped by server-derived `project_id + seller_id`, even with a dedicated schema.
- S3 prefixes are server generated and ownership scoped.
- Wildcard DNS does not prove a project exists.
- A running service without production routing is candidate/dormant, not live.
- Existing serverless resources remain valid architecture; normal release work must not replace them.
- `unknown`, `unverified`, `pending`, `placeholder`, `tbd`, `todo`, and `n/a` values document gaps but never satisfy validation.
- Every existing-resource record requires all four `release_limits` values to be numeric zero. A normal website request never authorizes a non-zero value.
