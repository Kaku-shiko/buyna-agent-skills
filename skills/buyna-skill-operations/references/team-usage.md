# Team installation and usage

## Skill-only installation

Ask Codex:

```text
Use $skill-installer to install all Skills under skills/ from the public
GitHub repository Kaku-shiko/buyna-agent-skills.
```

The repository is public, so installation does not require an invitation or GitHub token. Never paste a GitHub token into a prompt or repository file.

This method installs instructions only. It is insufficient for the fixed
Dashboard, catalog, cart, order, PostgreSQL, and file modules.

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

## Diagnose missing Skills

1. Confirm the complete folder exists under the intended Skill root.
2. For commerce work, confirm all six fixed modules exist under the installed
   module root. Re-run the cloned repository installer with `-Force` when they
   are missing.
3. Confirm `SKILL.md` is directly inside the Skill folder, not inside a duplicate nested folder.
4. Confirm YAML frontmatter has valid `name` and `description`.
5. Restart Codex or create a new task.
6. Invoke explicitly with `$skill-name`.

## Update

Pull the newest repository version, run the installer with `-Force`, then start a new Codex task. Record the commit or release version used by the team.

