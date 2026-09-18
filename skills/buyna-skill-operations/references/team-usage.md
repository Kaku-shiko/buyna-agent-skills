# Team installation and usage

## Skill-only installation

Ask Codex:

```text
Use $skill-installer to install all Skills under skills/ from the public
GitHub repository Kaku-shiko/buyna-agent-skills.
```

The repository is public, so installation does not require an invitation or GitHub token. Never paste a GitHub token into a prompt or repository file.

This method installs instructions only. It is insufficient for the fixed
Dashboard, catalog, cart, order, PostgreSQL, file, and GMV modules.

## Install from a cloned repository

From the repository root on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

Use `-Force` only when intentionally updating existing installed Skills.

The script installs both `skills/` and `packages/`. User scope uses
`.codex/skills/` plus `.codex/packages/`; project scope uses `.agents/skills/`
plus the project's `packages/`.

For one project:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Scope Project -ProjectPath "C:\path\to\project"
```

## Start the website workflow

```text
Use $buyna-website-builder and begin with customer intake.
```

Call a specific step only when earlier approved outputs already exist:

- `$buyna-customer-intake`
- `$buyna-website-design`
- `$buyna-page-structure`
- `$buyna-frontend-builder`

Use `$buyai-globepay-payment` as the GlobePay entrypoint.

Use `$buyai-merchant-builder` as the merchant/seller backend entrypoint. It
routes product, booking, database, S3, checkout, storefront, testing, payment,
and AWS release work without loading every rule at once.

Use `$buyna-project-resource-registry` before database, storage, onboarding,
migration, or release work to classify and verify the project's existing
shared-EC2, serverless, static, or external architecture.

## Diagnose missing Skills

1. Confirm the complete folder exists under the intended Skill root.
2. For commerce work, confirm all six base fixed modules exist under the installed
   module root. Re-run the cloned repository installer with `-Force` when they
   are missing.
   When CRM GMV is requested, also confirm `buyna-gmv-core` exists.
3. Confirm `SKILL.md` is directly inside the Skill folder, not inside a duplicate nested folder.
4. Confirm YAML frontmatter has valid `name` and `description`.
5. Restart Codex or create a new task.
6. Invoke explicitly with `$skill-name`.

## Update

Pull the newest repository version, run the installer with `-Force`, then start a new Codex task. Record the commit or release version used by the team.


## SOP distribution

`scripts/install.ps1` requires Node.js and installs the SOP library together with
Skills, including when `-SkillsOnly` leaves modules unchanged. The project
namespace is `.agents/buyna/`; the user namespace is `~/.codex/buyna/`.
`sop-installation.json` selects the current snapshot under `sop/<sha256>/`.
Snapshots include `manifest.json`, the six SOPs, shared contracts, schemas and
examples. Reinstalling with `-Force` preserves old snapshots so existing task pins
remain usable. Do not manually edit or delete a snapshot used by an active task.

The project AGENTS generator selects `task.sopIds` and pins content before linking
the required SOPs. See the Builder reference `references/project-agent-guide.md`.
Installation is rule distribution only; it does not grant workflow authority or
prove Builder/CRM has connected to a production workflow store.
