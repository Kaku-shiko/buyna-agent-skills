---
name: buyna-aws-release
description: "Prepare and verify Buyna.ai website releases on the approved AWS environment. Use for deployment readiness, environment variables, migrations, S3, domains, HTTPS, health checks, rollback, and production verification."
---

# Buyna.ai AWS Release

Coordinate release work without guessing infrastructure or claiming unverified success.

## Steps

1. Inspect the real runtime, build/start commands, deployment files, database, S3, domain, and environment variables.
2. Run `buyna-testing-quality`, including its pre-upload package gate, before
   release.
3. Show the proposed resources, persistent-cost risks, migration plan, secrets plan, and rollback path.
4. Use `aws-project-deployer` for live AWS inspection or deployment operations.
5. Verify HTTPS, routes, API health, migrations, uploads, logs, and critical user journeys.

## Rules

- Never ask for secrets in chat or commit them to source.
- Never create paid persistent AWS resources without confirmation.
- Apply production migrations through the backend/deployment environment.
- Keep production database access private.
- Update payment callback URLs to the production domain.
- Distinguish prepared, deployed, and live verified states.
- Upload only the approved runtime artifact. Do not upload the complete
  development workspace, `node_modules`, caches, local environment files, or
  an unreviewed source archive.
- Stop the release when the pre-upload package gate is missing or failed.

## Output

Report the release version, environment, uploaded artifact path and size,
verified URLs, migration result, health result, rollback location, and
unresolved risks.

Deliver required deployment, infrastructure, or environment configuration
changes as real project files without secrets and report their paths. Run the
approved deployment/verification commands. A release plan without executed
delivery evidence is not a completed release.
