#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(projectRoot, "..");
const args = process.argv.slice(2);
const shouldWrite = args.includes("--write");
const outputFile = readArg("--output") || "OFFICIAL_FRONTEND_HANDOFF.md";

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return args[index + 1] ?? "";
}

function runGit(gitArgs) {
  try {
    return execFileSync("git", gitArgs, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function latestPackage() {
  const candidates = [join(homedir(), "Downloads"), join(projectRoot, "dist-packages")]
    .filter((dir) => existsSync(dir))
    .flatMap((dir) =>
      readdirSync(dir)
        .filter((name) => /^buyna-official-frontend-.*\.zip$/i.test(name))
        .map((name) => join(dir, name)),
    )
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0] ?? "";
}

const branch = runGit(["branch", "--show-current"]) || "(unknown)";
const commit = runGit(["rev-parse", "HEAD"]) || "(unknown)";
const shortCommit = runGit(["rev-parse", "--short", "HEAD"]) || "(unknown)";
const status = runGit([
  "status",
  "--porcelain",
  "--",
  ".github",
  ".gitignore",
  "official-frontend",
]);
const zip = latestPackage();
const generatedAt = new Date().toISOString();

const body = `# Buyna.ai Official Frontend Handoff

Generated at: ${generatedAt}

## Source

- Branch: ${branch}
- Commit: ${commit}
- Source status: ${status ? "has local changes" : "clean"}
- Project root: official-frontend

## Latest Update Package

- ${zip ? basename(zip) : "No update package found"}
${zip ? `- ${zip}` : "- Run pnpm run package:update"}

## Verify Locally

\`\`\`bash
pnpm install --frozen-lockfile
pnpm run preview:local
pnpm run check:content
pnpm run lint
pnpm run check:launch
pnpm run package:check
pnpm run audit:goal
\`\`\`

## Read-Only Launch Plans

\`\`\`bash
pnpm run production:readiness-plan -- --env-file .env.production --amount 100 --currency JPY
pnpm run github:source-plan
pnpm run cloudflare:env-plan -- --env-file .env.production
pnpm run supabase:migration-plan
pnpm run globepay:dashboard-plan -- --env-file .env.production
pnpm run payment:verification-plan -- --amount 100 --currency JPY
pnpm run prod-evidence:plan
pnpm run prod-evidence:todo
\`\`\`

## Resume After Access

\`\`\`bash
pnpm run resume:after-access
pnpm run resume:watch
pnpm run resume:deploy-after-access
\`\`\`

Use \`resume:watch\` for automatic checking without deployment. Use \`resume:deploy-after-access\` only when production deployment should start automatically after every access and evidence gate passes.

## Remaining External Gates

- Configure the production GitHub remote and push this branch.
- Install/authenticate GitHub CLI and wait for successful CI.
- Log in to Cloudflare Wrangler and set dashboard variables/secrets.
- Fill .env.production locally; never commit it.
- Apply Supabase migrations to staging and production.
- Confirm GlobePay Japan callbacks, WorldPay Recurring, and Hosted 3DS.
- Deploy to Cloudflare and run deployed URL smoke tests.
- Verify real one-time payment and recurring subscription with provider status.
- Fill .production-evidence.json with non-secret proof and run strict audit.

## Never Commit Or Share

- .env or .env.production
- .production-evidence.json when it contains real production references
- API keys, service-role keys, GlobePay credential_code, passwords, or tokens
- Raw card data, customer PII, or raw webhook payloads

## Final Completion Gate

\`\`\`bash
pnpm run resume:after-access
pnpm run prod-evidence:todo
pnpm run check:prod-evidence
pnpm run audit:goal:strict
\`\`\`

The official-site goal is complete only when the strict audit passes with real current production evidence.
`;

if (shouldWrite) {
  const outputPath = resolve(projectRoot, outputFile);
  writeFileSync(outputPath, body, "utf8");
  console.log(`Wrote ${outputFile}`);
} else {
  process.stdout.write(body);
}
