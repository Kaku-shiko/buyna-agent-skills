---
name: buyna-skill-operations
description: "Guide Buyna.ai team members through GitHub-based Skill installation, invocation, updates, contribution, validation, review, and release. Use when a teammate cannot call a Skill, needs to install or update this repository, wants to create or change a Skill, or needs help following the repository Issue and Pull Request workflow."
---

# Buyna Skill Operations

Operate the Buyna.ai Skill repository without mixing project implementation work into repository administration.

## Strict Scope Control

- Perform only the requested installation, update, validation, contribution,
  or release operation.
- Do not propose new Skills, repository features, release processes, or
  documentation unless the user requested them.
- Do not expand a Skill edit into implementation work in a customer project.
- When the requested repository operation is complete, report the result and
  stop.
- Raise only immediate security, credential, destructive-change, or execution
  blockers. Give the minimum warning needed to continue safely.

## Route the Request

1. For installation, access, invocation, or updates, read [references/team-usage.md](references/team-usage.md).
2. For creating, editing, reviewing, or releasing a Skill, read [references/github-workflow.md](references/github-workflow.md).
3. For writing or reviewing Skill content, read [references/writing-standard.md](references/writing-standard.md).
4. Inspect the real repository and current branch before changing files.
5. Never claim a Skill is installed merely because its documentation is visible on GitHub or Notion.

## Installation Rules

- Prefer `$skill-installer` with repository `Kaku-shiko/buyna-agent-skills`.
- Install personal Skills under `.codex/skills/`; install project-scoped Skills under `.agents/skills/`.
- Preserve the complete Skill directory, including `SKILL.md`, `agents/`, `references/`, `scripts/`, and `assets/` when present.
- Require a new Codex task after installation or update so discovery refreshes.
- The current repository is public and requires no invitation for installation. Require authenticated Git credentials only for write operations.

## Contribution Rules

- Create or update one clearly scoped Skill per change when practical.
- Keep only `name` and `description` in SKILL.md frontmatter.
- Put detailed rules in directly linked `references/` files.
- Never commit credentials, customer secrets, production URLs containing tokens, or payment keys.
- Run `scripts/validate.ps1` and the official Skill validator before approval.
- Use a branch, Pull Request, review, and merge; do not edit `main` directly.

## Done

Report the installed or changed Skill names, destination, validation result, branch or Pull Request, and any remaining access or restart step.
