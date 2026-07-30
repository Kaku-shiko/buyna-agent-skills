---
name: buyna-project-framework
description: "Inspect or establish the shared Buyna.ai website development framework, module boundaries, environments, and runtime commands. Use only after the public frontend and merchant Dashboard runnable source code, API contract, build/type checks, and user approval are recorded."
---

# Buyna.ai Project Framework

Define the project foundation from the approved interface and API contract
without building business features or forcing a framework.

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
- Use the framework selected in the approved design or project record.
- Do not require Django, Lovable, Supabase, or another framework by default.
- Keep browser, server, database, storage, and payment responsibilities separate.
- Keep structured business data in the approved AWS database and files in S3 when AWS is selected.
- Produce a short framework decision for user approval before implementation.

## Handoff

Route merchant classification to `buyai-merchant-builder`, UI work to `buyna-frontend-builder`, structured data to `buyna-aws-data-layer`, files to `buyna-s3-storage`, domain work to the selected product or booking Skill, and final checks to `buyna-testing-quality`.
