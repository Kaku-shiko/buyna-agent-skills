---
name: aws-project-deployer
description: Connect Codex projects to AWS through the local codex-deploy profile, then inspect, deploy, update, or troubleshoot Buyna websites on approved existing resources. Use for the fixed Buyna EC2 release path and existing database/S3/domain operations; use new infrastructure only when the user explicitly requests and separately approves it.
---

# AWS Project Deployer

Use the local AWS CLI profile `codex-deploy`; default to Tokyo `ap-northeast-1` unless the project explicitly requires another region.

When called by `buyna-aws-release`, consume its `releaseCheckReceipt`. Reuse
matching `resourceRecordDigest`, `artifactDigest`, and `releasePlanDigest`
evidence instead of repeating registry, data-layer, build, or unchanged test
work. Standalone deployment creates equivalent evidence once.

## Select execution context first

For a direct, user-authorized update of an existing project through the
operator's AWS CLI, follow [direct release](references/direct-release.md).
Its current-release live inspection replaces the cached-baseline prerequisite
in the steps below; missing platform signing configuration alone does not block
this route. All resource, isolation, scope, rollback and health checks still apply.
Do not switch a platform-managed task to this route after an authority failure.

Only when the project explicitly uses a signed inspection service for trusted cross-task evidence,
load the confirmed `projectDeploymentBaseline` from the project resource
record. It is project evidence, not a per-release gate: reuse it across later AI
tasks and subsequent releases while its stable resource identity and policy
digest remain unchanged.

## Safety contract

- Never ask the user to paste Access Key IDs, Secret Access Keys, database passwords, or payment credentials into chat, source files, frontend variables, logs, or screenshots.
- Never read or print credential file contents. It is acceptable to report masked metadata, lengths, profile names, and `sts get-caller-identity` results.
- Treat successful STS identity verification as part of creating or repairing
  `projectDeploymentBaseline`. Do not rerun it for every unchanged release.
- Show the resources to be created and obtain confirmation immediately before creating paid or persistent resources such as RDS, Aurora, NAT Gateway, EC2, ECS, or provisioned capacity.
- Prefer infrastructure as code and reversible updates. Do not delete production resources, databases, buckets, domains, certificates, or secrets without explicit confirmation and a backup/retention check.

## Resource Mode

- Load and machine-validate the registered resource record and confirmed baseline first. Invoke the full `buyna-project-resource-registry` inspection only when either is missing or its stable digest is invalid; an unchanged project must not repeat registration. Default every task to `existing_buyna_resources` and preserve its registered architecture: shared EC2/PostgreSQL, AWS serverless, AWS static, or external legacy.
- Treat a request to build, publish, migrate, onboard, upload, or connect a new website as authorization to add only logical project/seller records, exact host mappings, approved storage prefixes, and application configuration. It is never authorization to create AWS infrastructure.
- For a new shared merchant, reuse the verified EC2 instance, approved PostgreSQL connection, approved S3 bucket, project prefix, and existing network/domain boundary. For a registered serverless/static project, reuse its recorded CloudFront, Lambda/API, DynamoDB, and S3 resources; do not force it onto EC2/RDS.
- Never infer permission to create a bucket, database, RDS/Aurora/DynamoDB resource, CloudFront distribution, Lambda/API stack, compute host, or extra port from a normal build, publish, storage, or database request.
- Stop with `BLOCKED: EXISTING_RESOURCES_NOT_CONFIRMED` when the resource record is absent, contains placeholders, conflicts with AWS inspection, or does not explicitly keep every create counter at zero. Never create a substitute resource to clear the blocker.
- Enter `new_infrastructure` only when the user explicitly requests new infrastructure, names the required resource class, and approves the cost/risk preview. This mode is outside `buyna-website-builder` and `buyna-aws-release`.
- Require a separate confirmation immediately before an approved `new_infrastructure` mutation. A website-build or deployment approval is not infrastructure approval.

## Registered Buyna server

- Deploy shared Buyna merchant websites and long-running backends only to the
  EC2 `instance_id` recorded for that project and verified in the current AWS
  account and region. A public IPv4 address is mutable evidence, never the
  stable resource identity.
- Never create, clone, replace, terminate, or automatically provision
  another EC2 instance for a Buyna deployment. Do not substitute ECS, App
  Runner, Lightsail, or another compute host without a later explicit change
  to this policy from the user.
- When creating or invalidating `projectDeploymentBaseline`, query the
  registered `instance_id` through AWS and verify
  its account, region, state, tags/environment ownership, and current network
  addresses before connecting or deploying. When the same verified instance
  has a changed address, refresh the secret-free resource evidence instead of
  blocking on the retired address. Stop on instance/account/region/ownership
  conflict or missing evidence; never create a replacement.
- Reuse the existing server through isolated application directories,
  processes, ports, Nginx routes, logs, and environment files. Inspect current
  allocations before choosing any of them; never overwrite another site.

## Workflow

1. Load `projectDeploymentBaseline` and consume matching static
   project/artifact evidence from the release receipt. An unchanged application
   files or runtime artifact update reuses the baseline and inspects only the
   changed artifact/release fields.
2. Only when the baseline is missing or invalidated, run
   `scripts/verify-connection.ps1`, query the registered target, and record the
   AWS account, region, architecture, stable target identity, ownership,
   approved runtime identity, SSM evidence, and zero-create policy. Do this once, then persist
   the confirmed baseline without secrets.
3. For a valid baseline, do not repeat STS/account, EC2 ownership, current-IP,
   SSM-online, database/storage, or zero-create discovery. Connect using the
   recorded target. If SSM is unavailable, return the current release
   execution/connection error; it does not invalidate the baseline or trigger
   the full gate. Immediately before writing, run one low-cost read-only
   runtime-slot check for this project's directory, process/service, Socket or
   assigned port, Nginx host route, environment source, and log path. Stop with
   `RUNTIME_SLOT_CONFLICT` if another project owns any target; do not replace
   files first.
4. Preserve the inspected runtime stack. For shared merchants, deploy only to the verified existing EC2 and use the approved PostgreSQL/S3 resources. For registered serverless/static projects, update only their recorded existing resources. Do not force Django, EC2, RDS, or a specific Node version across architectures.
5. Create a unique normalized project slug. Isolate application directories, processes, assigned ports, Nginx routes, database schema/ownership, S3 prefixes, secrets, logs, and deployment records inside the approved shared resources. Do not create per-project buckets or databases.
6. Generate or update the deployment manifest and infrastructure template in the project. Keep environment-specific values parameterized.
7. Build only when `artifactDigest` is absent or changed. Reuse matching
   `FAST_RELEASE` build evidence; still run project tests changed by this release.
8. Reuse the confirmed zero-create policy and counters from the baseline. Do
   not present or approve them again for an unchanged release. Inspect only the
   current release diff and stop if it proposes a new persistent resource:

   ```text
   RESOURCE_MODE: existing_buyna_resources
   NEW_EC2_INSTANCES: 0
   NEW_DATABASES: 0
   NEW_BUCKETS: 0
   NEW_PORTS: 0
   ```

   Stop if a CloudFormation change set, CDK diff, Terraform plan, shell script, or SDK call proposes a non-zero value.
9. Consume the Builder's recorded release/traffic-switch approval. Ask again
   only when target, resource mode, release plan, cost, destructive scope, or
   traffic plan changed; then deploy using the verified profile and region.
10. Run post-deploy health exactly once for every current release: live URL,
    HTTPS, client-side routes,
    critical API, logs, current target identity, and rollback state. Return the
    evidence to `buyna-aws-release`; do not make the coordinator repeat it.

## Database and secrets

- Store database credentials and application secrets in AWS Secrets Manager or service-native secret configuration.
- Never make RDS publicly accessible for convenience. Use security groups and private networking.
- Run migrations from the backend/deployment environment, not from browser code.
- Enable backups and deletion protection for production databases; use explicit environment labels for development resources.

## GlobePay integration

- Keep `partner_code`, `credential_code`, signing secrets, and recurring-payment credentials server-side only.
- Route payment work through the available Buyai GlobePay skills when present.
- Do not mark a payment deployment live until notify/return URLs, server-side verification, status sync, and a controlled end-to-end payment test succeed.

Read `references/architecture.md` when selecting resources or explaining the reusable project model.
