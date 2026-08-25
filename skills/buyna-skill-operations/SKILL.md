---
name: buyna-skill-operations
description: "Use when a teammate needs to install, discover, update, validate, review, contribute, or release Buyna Skills or fixed modules."
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

- For the complete website workflow, clone
  `Kaku-shiko/buyna-agent-skills` and run `scripts/install.ps1`; this installs
  both Skills and fixed code modules. Do not treat `$skill-installer` alone as
  a complete commerce installation because it installs Skill folders but not
  repository-level `packages/`.
- Install personal Skills under `.codex/skills/`; install project-scoped Skills under `.agents/skills/`.
- Preserve the complete Skill directory, including `SKILL.md`, `agents/`, `references/`, `scripts/`, and `assets/` when present.
- After installation read `.agents/buyna/repository-manifest.json` for project
  scope or `.codex/buyna/repository-manifest.json` for user scope, and verify
  every package in the selected profile at the installed module root. Never
  overwrite a project's own root `repository-manifest.json`.
- Verify `buyna-website-builder/scripts/route-builder.mjs` is present in both
  complete and project-scoped Builder installations.
- Require `buyna-merchant-dashboard-core`, `buyna-merchant-dashboard-headless`,
  `buyna-merchant-catalog-core`, `buyna-inventory-core`, `buyna-coupon-core`,
  `buyna-cart-core`, `buyna-order-core`, `buyna-postgres-merchant-core`,
  `buyna-merchant-file-core`, `buyna-auth-session-core`, and
  `buyna-merchant-context-core`, `buyna-commerce-read-model-core`, and
  `buyna-delivery-state-core` under the installed module root. A
  payment-capable website profile also requires `buyna-checkout-flow-core` and
  `buyna-commerce-settlement-core`.
- Verify the `buyai-coupon-commerce` Skill is present when the persisted
  website capability enables coupons. Missing optional coupon capability does
  not block ordinary checkout.
- Verify storefront gallery remains deferred and absent from the accepted
  manifest until a later approved deep shared module exists; current gallery
  behavior and presentation are generated per project.
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
