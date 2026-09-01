---
name: buyna-aws-release
description: "Prepare and verify Buyna.ai website releases on the approved AWS environment. Use for deployment readiness, environment variables, migrations, S3, domains, HTTPS, health checks, rollback, and production verification."
---

# Buyna.ai AWS Release

Coordinate release work without guessing infrastructure or claiming unverified success.

Own one `releaseCheckReceipt` for the release. It binds
`resourceRecordDigest`, `artifactDigest`, and `releasePlanDigest` plus the
`FAST_RELEASE` evidence. Pass it to `buyna-aws-data-layer`,
`aws-project-deployer`, and `buyna-testing-quality`; unchanged static evidence
is consumed, not rerun. A changed digest invalidates only that field.

Also consume the project's confirmed `projectDeploymentBaseline`. That baseline
owns AWS account, region, architecture, stable target identity, ownership,
approved runtime identity, SSM evidence, and the zero-create policy. Reuse it across
later AI tasks and subsequent releases; do not turn it into a per-release gate.

## Steps

1. Load `projects/<project_id>/resources.yaml` and its confirmed
   `projectDeploymentBaseline`. Create or repair that baseline only when absent
   or invalidated by a changed normalized resource record digest, AWS account,
   region, `instance_id`/target, architecture, ownership boundary, zero-create
   policy, or explicitly approved resource migration.
2. With an unchanged baseline, skip the full deployment gate. Do not rerun STS,
   target ownership, current IP, SSM-online, full runtime allocation, database/S3
   identity, or zero-create discovery merely because a new AI task or release
   began. A temporary SSM failure is a current execution/connection error and
   does not invalidate the baseline. The deployer still performs one low-cost
   read-only runtime-slot ownership check immediately before writing, so a
   shared-host directory/process/Socket-or-port/Nginx route conflict stops
   before replacement without reopening the full gate.
3. Run `buyna-testing-quality` in default `FAST_RELEASE` mode, or consume its
   matching artifact evidence. Verify the
   runtime artifact, secrets boundary, registered target, tenant write
   isolation, and rollback before mutation; do not expand this into the full
   package/test audit unless the user explicitly requests `FULL_VERIFICATION`.
4. Reuse the baseline's zero-create policy and counters. Inspect the current
   release diff for a changed resource plan, cost, destructive action, migration,
   secrets boundary, traffic switch, and rollback path; ask only for a real new
   decision.
5. Use `aws-project-deployer` with the same baseline and receipt for deployment.
   An unchanged application files/runtime artifact replacement on the registered
   target proceeds without another full AWS deployment gate and preserves the
   recorded rollback snapshot, version, or path.
6. Deploy to the registered baseline target, then let the deployer run the one
   minimum post-deploy health verification for every current release:
   HTTPS, the primary route, one critical API/route, logs, target identity, and
   rollback readiness. Consume that evidence instead of running a second copy.
   Run `FULL_VERIFICATION` only when explicitly requested.

## Rules

- Never ask for secrets in chat or store them in project files.
- Reuse only the database, bucket, region, project prefix, and connection sources recorded for this project. Stop if the record is missing or conflicts with AWS inspection.
- Never create a database, RDS/Aurora resource, DynamoDB table, SQLite fallback, S3 bucket, or replacement storage resource during release.
- Require `aws-project-deployer` mode `existing_buyna_resources`; stop if it proposes `new_infrastructure`, changes architecture type, or introduces any unrecorded persistent resource.
- Treat missing, placeholder, `unknown`, `unverified`, `pending`, or `tbd` evidence as a blocker. Stop before applying any plan that creates an EC2 instance, database, bucket, permanent application port, NAT Gateway, or load balancer.
- Never create paid persistent AWS resources without confirmation.
- Never create, clone, replace, or terminate an EC2 instance during a release.
  Shared EC2 projects use only their registered, AWS-verified `instance_id`;
  registered serverless/static projects use no EC2 target. Refresh a changed IP
  for the same verified instance as evidence rather than treating it as a new host.
- For shared-EC2 projects, keep each website isolated by application directory,
  approved shared process/port routing, Nginx route, logs, and environment file.
  For serverless/static projects, preserve their registered distribution,
  function/API, table, and bucket boundaries. Never overwrite another project.
- Apply production migrations through the backend/deployment environment.
- Keep production database access private.
- Update payment callback URLs to the production domain.
- Distinguish prepared, deployed, and live verified states.
- Upload only the approved runtime artifact. Do not upload the complete
  development workspace, `node_modules`, caches, local environment files, or
  an unreviewed source archive.
- Stop only when a `FAST_RELEASE` essential fails: secrets exposure, missing or
  invalid runtime artifact, wrong/unregistered target, tenant write isolation
  risk, no rollback, unauthorized persistent resource creation, or failed
  post-deploy health. Deferred package-size and exhaustive regression checks do
  not block the normal release.
- If the user owns the real payment test, record
  `PAYMENT_VERIFICATION: USER_OWNED_PENDING`. It does not block the website
  release, but the release must not call payment live or verified.

## Output

Report the release version, environment, architecture type, verified target identifiers, all four zero-create counters, uploaded artifact path and size,
verified URLs, migration result, health result, rollback location, and
unresolved risks.

Deliver required deployment, infrastructure, or environment configuration
changes as real project files without secrets and report their paths. Run the
approved deployment/verification commands. A release plan without executed
delivery evidence is not a completed release.
