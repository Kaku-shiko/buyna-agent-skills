---
name: buyna-project-framework
description: "Establish the post-frontend Buyna.ai technical foundation, backend/data/storage boundaries, environments, and runtime commands. Use only after the approved frontend framework has produced runnable public and merchant Dashboard code with API contracts and passing checks."
---

# Buyna.ai Project Framework

Begin post-UI data-interaction development from the approved interface and API
contract without building domain features or changing the approved frontend
framework.

## First Move

Verify the approved Phase 4 frontend code completion record first. If runnable
public/Dashboard source code, the API contract, passed frontend build/type
checks, or user approval is missing, stop and return to
`buyna-frontend-builder` Phase 4 without establishing backend infrastructure.

After the gate passes, inspect the current project, runtime versions, build commands, database configuration, deployment files, and existing data. Read `references/approved-stack.md` only when the project has no approved stack.

## Establish

- Project type and scope.
- Frontend, backend, database, storage, and deployment choices.
- Folder and module ownership.
- Development, staging, and production environments.
- Environment-variable and secret boundaries.
- Migration, testing, build, start, and release commands.

## Rules

- Preserve a working stack unless migration is approved.
- Preserve the frontend framework selected in Phase 2 and implemented in Phase
  4; do not reselect it here.
- Do not require Django, Lovable, Supabase, or another framework by default.
- Keep browser, server, database, storage, and payment responsibilities separate.
- Keep structured business data in the approved AWS database and files in S3 when AWS is selected.
- Produce a short framework decision for user approval before implementation.

## Code Delivery

Save the approved project structure and required configuration, environment
example, and command scripts in the real project. Run the applicable
build/start command. Report changed file paths and results; a framework decision
written only in chat is not complete.

Deliver an executable server/API boundary, not only folders or documentation.
The next data and domain Skills must be able to add migrations, services, and
endpoints without replacing this foundation.

## Handoff

Route merchant classification to `buyai-merchant-builder`, UI work to `buyna-frontend-builder`, structured data to `buyna-aws-data-layer`, files to `buyna-s3-storage`, domain work to the selected product or booking Skill, and final checks to `buyna-testing-quality`.
