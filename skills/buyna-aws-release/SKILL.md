---
name: buyna-aws-release
description: "Prepare and verify Buyna.ai website releases on the approved AWS environment. Use for deployment readiness, environment variables, migrations, S3, domains, HTTPS, health checks, rollback, and production verification."
---

# Buyna.ai AWS Release

Coordinate release work without guessing infrastructure or claiming unverified success.

## Steps

1. Read the approved `projects/<project_id>/resources.yaml`; run the `buyna-aws-data-layer` Existing Resource Gate and inspect the real runtime, build/start commands, deployment files, database, S3, domain, and environment variables.
2. Verify through `aws-project-deployer` that the deployment target is the
   existing Buyna EC2 instance at `35.73.127.215`. Record its instance id,
   region, running state, and current public IPv4 address. Stop on mismatch and
   never create a replacement instance.
3. Run `buyna-testing-quality`, including its pre-upload package gate, before
   release.
4. Show the proposed resources, persistent-cost risks, migration plan, secrets plan, and rollback path. State `NEW_EC2_INSTANCES: 0`.
5. Use `aws-project-deployer` for live AWS inspection or deployment operations on the verified existing instance.
6. Verify HTTPS, routes, API health, migrations, uploads, logs, target instance identity, and critical user journeys.

## Rules

- Never ask for secrets in chat or commit them to source.
- Reuse only the database, bucket, region, project prefix, and connection sources recorded for this project. Stop if the record is missing or conflicts with AWS inspection.
- Never create a database, RDS/Aurora resource, DynamoDB table, SQLite fallback, S3 bucket, or replacement storage resource during release.
- Require `aws-project-deployer` mode `existing_buyna_resources`; stop if it proposes `new_infrastructure` or any unrecorded persistent resource.
- Never create paid persistent AWS resources without confirmation.
- Never create, clone, replace, or terminate an EC2 instance during a
  Buyna website release. Use only the verified existing Buyna instance at
  `35.73.127.215`.
- Keep each website isolated by application directory, process name, port,
  Nginx route, logs, and environment file. Do not overwrite another deployed
  website on the shared instance.
- Apply production migrations through the backend/deployment environment.
- Keep production database access private.
- Update payment callback URLs to the production domain.
- Distinguish prepared, deployed, and live verified states.
- Upload only the approved runtime artifact. Do not upload the complete
  development workspace, `node_modules`, caches, local environment files, or
  an unreviewed source archive.
- Stop the release when the pre-upload package gate is missing or failed.

## Output

Report the release version, environment, verified EC2 instance id and public
IPv4 address, `NEW_EC2_INSTANCES: 0`, uploaded artifact path and size,
verified URLs, migration result, health result, rollback location, and
unresolved risks.

Deliver required deployment, infrastructure, or environment configuration
changes as real project files without secrets and report their paths. Run the
approved deployment/verification commands. A release plan without executed
delivery evidence is not a completed release.
