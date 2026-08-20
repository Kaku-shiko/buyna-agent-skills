# Update Package

Use this when the official frontend source needs to be handed off or manually updated from a zip.

## Create The Package

```bash
pnpm run package:update
pnpm run package:check
```

By default, the zip is written to the current user's `Downloads` folder:

```text
buyna-official-frontend-YYYYMMDD-HHMMSS-<commit>.zip
```

The package includes `UPDATE_PACKAGE_MANIFEST.json` at the zip root. That manifest records the schema version, source branch, full commit SHA, created timestamp, package filename, included roots, intentionally excluded files/directories, local verification commands, and external production-gate commands.
`pnpm run package:check` validates the latest package in `Downloads`, or a specific package with `-- --zip <path>`.

Included roots:

- `official-frontend`
- `.github`

## Excluded From The Package

The update package is source-only. It intentionally excludes:

- `.env`
- `.env.local`
- `.env.production`
- `.production-evidence.json`
- `.local-preview.out.log`
- `.local-preview.err.log`
- `.dev-server.log`
- `.dev-server.err.log`
- `node_modules`
- `.output`
- `.wrangler`
- `.vinxi`
- `.git`

Template files such as `.env.example`, `.env.production.example`, and `.production-evidence.example.json` stay inside the package because they do not contain real secrets.

## Apply An Update

1. Extract the zip.
2. Enter `official-frontend`.
3. Run `pnpm run handoff:summary` to print the one-page source, package, verification, and external-gate handoff.
4. Run `pnpm install --frozen-lockfile`.
5. Run `pnpm run preview:local` and open `http://127.0.0.1:8080/`.
6. Run `pnpm run verify`.
7. Run `pnpm run check:launch`.
8. Configure real production secrets outside Git before any cloud deploy.

For production deployment, continue with `docs/CLOUDFLARE_DEPLOYMENT.md` and `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md`.
