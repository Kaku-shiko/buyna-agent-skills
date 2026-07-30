---
name: buyna-project-framework
description: "Inspect or establish the shared Buyna.ai website development framework, module boundaries, environments, and runtime commands. Use after design and page-structure approval and before broad frontend or backend implementation."
---

# Buyna.ai Project Framework

Define the project foundation without building business features or forcing a framework.

## First Move

Inspect the current project, runtime versions, build commands, database configuration, deployment files, and existing data. Read `references/approved-stack.md` only when the project has no approved stack.

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
