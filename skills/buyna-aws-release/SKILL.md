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

## Steps

1. Validate `projects/<project_id>/resources.yaml` once and record its digest in
   `releaseCheckReceipt`. Run `buyna-aws-data-layer` only for registered
   PostgreSQL work not already covered by the same resource digest.
2. Verify the exact registered target through `aws-project-deployer`. For
   `shared_ec2_postgresql`, resolve the registered EC2 `instance_id` and verify
   its current account, region, state, ownership, and network addresses through
   AWS. For `aws_serverless` or `aws_static`, require the recorded
   distributions/functions/tables/buckets and do not introduce EC2. Stop on
   stable identity or ownership mismatch and never create a replacement resource.
3. Run `buyna-testing-quality` in default `FAST_RELEASE` mode, or consume its
   matching artifact evidence. Verify the
   runtime artifact, secrets boundary, registered target, tenant write
   isolation, and rollback before mutation; do not expand this into the full
   package/test audit unless the user explicitly requests `FULL_VERIFICATION`.
4. Show the proposed resources, persistent-cost risks, migration plan, secrets plan, and rollback path. State `RESOURCE_MODE: existing_buyna_resources`, `NEW_EC2_INSTANCES: 0`, `NEW_DATABASES: 0`, `NEW_BUCKETS: 0`, and `NEW_PORTS: 0`.
5. Use `aws-project-deployer` with the same receipt for live AWS inspection or
   deployment operations. Every release still performs fresh STS, current
   target ownership/network/runtime allocation checks, and never reuses those
   live observations from an older release.
6. Deploy to the verified registered target, then let the deployer run the one
   minimum post-deploy health verification for
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
