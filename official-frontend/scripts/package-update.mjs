#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(projectRoot, "..");
const projectName = basename(projectRoot);
const excludedDirs = new Set([
  "node_modules",
  "dist-packages",
  ".output",
  ".wrangler",
  ".vinxi",
  ".git",
]);
const excludedFiles = new Set([
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
]);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? projectRoot,
    encoding: "utf8",
    shell: options.shell ?? false,
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] ?? "";
}

function timestamp() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ];
  return parts.join("");
}

function defaultOutDir() {
  const downloads = join(homedir(), "Downloads");
  return existsSync(downloads) ? downloads : join(projectRoot, "dist-packages");
}

function shouldCopy(source) {
  const name = basename(source);
  if (excludedDirs.has(name) && statSync(source).isDirectory()) return false;
  if (excludedFiles.has(name) && statSync(source).isFile()) return false;
  return true;
}

function compressArchive(source, destination) {
  if (process.platform !== "win32") {
    const result = spawnSync("zip", ["-r", destination, "."], {
      cwd: source,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || "zip failed.");
    }
    return;
  }

  const command = [
    "$ErrorActionPreference = 'Stop';",
    "Compress-Archive",
    "-Path $env:BUYNA_PACKAGE_SOURCE",
    "-DestinationPath $env:BUYNA_PACKAGE_DESTINATION",
    "-Force",
  ].join(" ");

  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        BUYNA_PACKAGE_SOURCE: source,
        BUYNA_PACKAGE_DESTINATION: destination,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Compress-Archive failed.");
  }
}

const outDir = resolve(readArg("--out-dir") || defaultOutDir());
mkdirSync(outDir, { recursive: true });

const shortCommit =
  run("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot }).stdout || "nogit";
const fullCommit = run("git", ["rev-parse", "HEAD"], { cwd: repoRoot }).stdout || "";
const branch = run("git", ["branch", "--show-current"], { cwd: repoRoot }).stdout || "";
const createdAt = new Date().toISOString();
const packageName = `buyna-official-frontend-${timestamp()}-${shortCommit}.zip`;
const zipPath = join(outDir, packageName);
const stageRoot = join(tmpdir(), `buyna-official-frontend-package-${timestamp()}-${process.pid}`);
const stageProject = join(stageRoot, projectName);
const stageGithub = join(stageRoot, ".github");
const repoGithub = join(repoRoot, ".github");

try {
  cpSync(projectRoot, stageProject, {
    recursive: true,
    filter: shouldCopy,
  });
  if (existsSync(repoGithub)) {
    cpSync(repoGithub, stageGithub, {
      recursive: true,
      filter: shouldCopy,
    });
  }

  const manifest = {
    packageSchemaVersion: 2,
    name: "Buyna.ai official frontend update package",
    createdAt,
    sourceCommit: fullCommit,
    sourceCommitShort: shortCommit,
    sourceBranch: branch,
    packageFile: packageName,
    includedRoots: [projectName, ".github"],
    excludedDirectories: Array.from(excludedDirs).sort(),
    excludedFiles: Array.from(excludedFiles).sort(),
    verificationCommands: [
      "pnpm install --frozen-lockfile",
      "pnpm run handoff:summary",
      "pnpm run preview:local",
      "pnpm run check:content",
      "pnpm run verify",
      "pnpm run check:launch",
      "pnpm run package:check",
      "pnpm run audit:goal",
    ],
    externalGateCommands: [
      "pnpm run github:source-plan",
      "pnpm run cloudflare:env-plan -- --env-file .env.production",
      "pnpm run supabase:migration-plan",
      "pnpm run globepay:dashboard-plan -- --env-file .env.production",
      "pnpm run payment:verification-plan -- --amount 100 --currency JPY",
      "pnpm run prod-evidence:todo",
      "pnpm run audit:goal:strict",
    ],
    notes: [
      "This package is for source updates only.",
      "Install dependencies with pnpm install --frozen-lockfile after extracting.",
      "Production secrets and evidence files are intentionally excluded.",
    ],
  };

  writeFileSync(
    join(stageRoot, "UPDATE_PACKAGE_MANIFEST.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  compressArchive(process.platform === "win32" ? join(stageRoot, "*") : stageRoot, zipPath);
} finally {
  if (existsSync(stageRoot)) {
    const resolvedStage = resolve(stageRoot);
    const resolvedTemp = resolve(tmpdir());
    if (resolvedStage.startsWith(`${resolvedTemp}${sep}`)) {
      rmSync(stageRoot, { recursive: true, force: true });
    }
  }
}

if (!existsSync(zipPath)) {
  throw new Error(`Expected package was not created: ${zipPath}`);
}

console.log("Created Buyna.ai official frontend update package:");
console.log(zipPath);
