#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(projectRoot, "..");
const args = process.argv.slice(2);
const failures = [];
const requiredExcludedFiles = [
  ".env",
  ".env.local",
  ".env.production",
  ".production-evidence.json",
  ".resume-after-access-status.json",
  ".resume-after-access-watch.log",
  ".local-preview.out.log",
  ".local-preview.err.log",
  ".dev-server.log",
  ".dev-server.err.log",
];
const requiredExcludedDirectories = [
  "node_modules",
  "dist-packages",
  ".output",
  ".wrangler",
  ".vinxi",
  ".git",
];
const requiredVerificationCommands = [
  "pnpm install --frozen-lockfile",
  "pnpm run handoff:summary",
  "pnpm run preview:local",
  "pnpm run check:content",
  "pnpm run verify",
  "pnpm run check:launch",
  "pnpm run package:check",
  "pnpm run audit:goal",
];
const requiredExternalGateCommands = [
  "pnpm run github:source-plan",
  "pnpm run cloudflare:env-plan -- --env-file .env.production",
  "pnpm run supabase:migration-plan",
  "pnpm run globepay:dashboard-plan -- --env-file .env.production",
  "pnpm run payment:verification-plan -- --amount 100 --currency JPY",
  "pnpm run prod-evidence:todo",
  "pnpm run audit:goal:strict",
];

const requiredEntries = [
  "UPDATE_PACKAGE_MANIFEST.json",
  ".github/pull_request_template.md",
  ".github/workflows/official-frontend-ci.yml",
  "official-frontend/package.json",
  "official-frontend/src/content/official-site.ts",
  "official-frontend/scripts/check-official-content.mjs",
  "official-frontend/scripts/package-update.mjs",
  "official-frontend/scripts/local-preview.mjs",
  "official-frontend/scripts/print-handoff-summary.mjs",
  "official-frontend/scripts/print-production-evidence-todo.mjs",
];

const forbiddenEntries = [
  "official-frontend/.env",
  "official-frontend/.env.local",
  "official-frontend/.env.production",
  "official-frontend/.production-evidence.json",
  "official-frontend/.resume-after-access-status.json",
  "official-frontend/.resume-after-access-watch.log",
  "official-frontend/.local-preview.out.log",
  "official-frontend/.local-preview.err.log",
];

const forbiddenFragments = requiredExcludedDirectories.map((name) => `/${name}/`);

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return args[index + 1] ?? "";
}

function latestPackage() {
  const searchDirs = [join(homedir(), "Downloads"), join(projectRoot, "dist-packages")];
  const candidates = searchDirs
    .filter((dir) => existsSync(dir))
    .flatMap((dir) =>
      readdirSync(dir)
        .filter((name) => /^buyna-official-frontend-.*\.zip$/i.test(name))
        .map((name) => join(dir, name)),
    )
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0] ?? "";
}

function expandZip(zipPath, destination) {
  if (process.platform !== "win32") {
    const result = spawnSync("unzip", ["-q", zipPath, "-d", destination], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || "unzip failed.");
    }
    return;
  }

  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath $env:BUYNA_PACKAGE_ZIP -DestinationPath $env:BUYNA_PACKAGE_DESTINATION -Force",
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        BUYNA_PACKAGE_ZIP: zipPath,
        BUYNA_PACKAGE_DESTINATION: destination,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Expand-Archive failed.");
  }
}

function walkFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) stack.push(full);
      else files.push(full);
    }
  }
  return files;
}

function rel(path, root) {
  return path.slice(root.length + 1).replaceAll("\\", "/");
}

function fail(message) {
  failures.push(message);
}

function isIsoDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function hasAll(values, requiredValues) {
  const set = new Set(Array.isArray(values) ? values : []);
  return requiredValues.every((value) => set.has(value));
}

const zipPath = resolve(readArg("--zip") || latestPackage());
if (!zipPath || !existsSync(zipPath)) {
  console.error("No update package found. Run pnpm run package:update or pass --zip <path>.");
  process.exit(1);
}

const tempRoot = mkdtempSync(join(tmpdir(), "buyna-package-check-"));

try {
  expandZip(zipPath, tempRoot);
  const entries = walkFiles(tempRoot).map((path) => rel(path, tempRoot));

  for (const entry of requiredEntries) {
    if (!entries.includes(entry)) fail(`Missing required package entry: ${entry}`);
  }

  for (const entry of forbiddenEntries) {
    if (entries.includes(entry)) fail(`Forbidden package entry found: ${entry}`);
  }

  for (const entry of entries) {
    for (const fragment of forbiddenFragments) {
      if (`/${entry}`.includes(fragment)) fail(`Forbidden package path found: ${entry}`);
    }
  }

  const manifestPath = join(tempRoot, "UPDATE_PACKAGE_MANIFEST.json");
  if (!existsSync(manifestPath)) {
    fail("Missing UPDATE_PACKAGE_MANIFEST.json at package root.");
  } else {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const packageFile = basename(zipPath);
    const currentCommit = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).stdout.trim();
    const currentFullCommit = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).stdout.trim();

    if (manifest.packageSchemaVersion !== 2) {
      fail("Manifest packageSchemaVersion must be 2.");
    }
    if (manifest.packageFile !== packageFile) {
      fail(`Manifest packageFile ${manifest.packageFile} does not match zip ${packageFile}.`);
    }
    if (!isIsoDate(manifest.createdAt)) {
      fail("Manifest createdAt must be an ISO timestamp.");
    }
    if (manifest.sourceCommit !== currentFullCommit) {
      fail(
        `Manifest full commit ${manifest.sourceCommit} does not match HEAD ${currentFullCommit}.`,
      );
    }
    if (manifest.sourceCommitShort !== currentCommit) {
      fail(`Manifest commit ${manifest.sourceCommitShort} does not match HEAD ${currentCommit}.`);
    }
    if (!/^[0-9a-f]{40}$/i.test(manifest.sourceCommit ?? "")) {
      fail("Manifest sourceCommit must be a full 40-character commit SHA.");
    }
    if (!manifest.sourceBranch) {
      fail("Manifest sourceBranch must not be empty.");
    }
    if (!manifest.includedRoots?.includes("official-frontend")) {
      fail("Manifest includedRoots must include official-frontend.");
    }
    if (!manifest.includedRoots?.includes(".github")) {
      fail("Manifest includedRoots must include .github.");
    }
    if (!hasAll(manifest.excludedFiles, requiredExcludedFiles)) {
      fail(
        "Manifest excludedFiles must include every local secret, evidence, and preview log file.",
      );
    }
    if (!hasAll(manifest.excludedDirectories, requiredExcludedDirectories)) {
      fail(
        "Manifest excludedDirectories must include every dependency, build, deploy, and Git directory.",
      );
    }
    if (!hasAll(manifest.verificationCommands, requiredVerificationCommands)) {
      fail(
        "Manifest verificationCommands must include install, handoff, preview, content, verify, launch, package, and audit checks.",
      );
    }
    if (!hasAll(manifest.externalGateCommands, requiredExternalGateCommands)) {
      fail(
        "Manifest externalGateCommands must include GitHub, Cloudflare, Supabase, GlobePay, payment, evidence, and strict audit commands.",
      );
    }
  }

  console.log("Buyna.ai update package check");
  console.log(`Package: ${zipPath}`);
  console.log(`Entries: ${entries.length}`);

  if (failures.length) {
    console.error("\nFailures:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("\nOK: update package structure is valid.");
} finally {
  const resolvedTemp = resolve(tempRoot);
  if (resolvedTemp.startsWith(`${resolve(tmpdir())}${sep}`)) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
