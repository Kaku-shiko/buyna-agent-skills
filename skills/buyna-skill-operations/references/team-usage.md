# Team installation and usage

## Install all Skills with Codex

Ask Codex:

```text
Use $skill-installer to install all Skills under skills/ from the public
GitHub repository Kaku-shiko/buyna-agent-skills.
```

The repository is public, so installation does not require an invitation or GitHub token. Never paste a GitHub token into a prompt or repository file.

## Install from a cloned repository

From the repository root on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

Use `-Force` only when intentionally updating existing installed Skills.

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
2. Confirm `SKILL.md` is directly inside the Skill folder, not inside a duplicate nested folder.
3. Confirm YAML frontmatter has valid `name` and `description`.
4. Restart Codex or create a new task.
5. Invoke explicitly with `$skill-name`.

## Update

Pull the newest repository version, run the installer with `-Force`, then start a new Codex task. Record the commit or release version used by the team.

