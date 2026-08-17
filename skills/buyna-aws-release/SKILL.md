---
name: buyna-aws-release
description: "Prepare and verify Buyna.ai website releases on the approved AWS environment. Use for deployment readiness, environment variables, migrations, S3, domains, HTTPS, health checks, rollback, and production verification."
---

# Buyna.ai AWS Release

Coordinate release work without guessing infrastructure or claiming unverified success.

## Steps

1. Run `buyna-project-resource-registry` on the approved `projects/<project_id>/resources.yaml`. Run `buyna-aws-data-layer` only for a registered PostgreSQL project; inspect the registered runtime, build/start commands, deployment files, data store, S3, domain, and environment sources.
2. Verify the exact registered target through `aws-project-deployer`. For `shared_ec2_postgresql`, require the existing Buyna EC2 at `35.73.127.215`. For `aws_serverless` or `aws_static`, require the recorded distributions/functions/tables/buckets and do not introduce EC2. Stop on mismatch and never create a replacement resource.
3. Run `buyna-testing-quality`, including its pre-upload package gate, before
   release.
4. Show the proposed resources, persistent-cost risks, migration plan, secrets plan, and rollback path. State `RESOURCE_MODE: existing_buyna_resources`, `NEW_EC2_INSTANCES: 0`, `NEW_DATABASES: 0`, `NEW_BUCKETS: 0`, and `NEW_PORTS: 0`.
5. Use `aws-project-deployer` for live AWS inspection or deployment operations on the verified existing instance.
6. Verify HTTPS, routes, API health, migrations, uploads, logs, target instance identity, and critical user journeys.

## Rules

- Never ask for secrets in chat or store them in project files.
- Reuse only the database, bucket, region, project prefix, and connection sources recorded for this project. Stop if the record is missing or conflicts with AWS inspection.
- Never create a database, RDS/Aurora resource, DynamoDB table, SQLite fallback, S3 bucket, or replacement storage resource during release.
- Require `aws-project-deployer` mode `existing_buyna_resources`; stop if it proposes `new_infrastructure`, changes architecture type, or introduces any unrecorded persistent resource.
- Treat missing, placeholder, `unknown`, `unverified`, `pending`, or `tbd` evidence as a blocker. Stop before applying any plan that creates an EC2 instance, database, bucket, permanent application port, NAT Gateway, or load balancer.
- Never create paid persistent AWS resources without confirmation.
- Never create, clone, replace, or terminate an EC2 instance during a release. Shared EC2 projects use only `35.73.127.215`; registered serverless/static projects use no EC2 target.
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
- Stop the release when the pre-upload package gate is missing or failed.

## Output

Report the release version, environment, architecture type, verified target identifiers, all four zero-create counters, uploaded artifact path and size,
verified URLs, migration result, health result, rollback location, and
unresolved risks.

Deliver required deployment, infrastructure, or environment configuration
changes as real project files without secrets and report their paths. Run the
approved deployment/verification commands. A release plan without executed
delivery evidence is not a completed release.
