#!/usr/bin/env node

import { existsSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageManagerExecPath = process.env.npm_execpath;

function packageManagerNodePath() {
  if (!packageManagerExecPath) {
    return process.execPath;
  }

  const bundledNodeName = process.platform === "win32" ? "node.exe" : "node";
  const bundledNodePath = resolve(
    dirname(packageManagerExecPath),
    "..",
    "..",
    "..",
    "bin",
    bundledNodeName,
  );

  if (existsSync(bundledNodePath)) {
    return bundledNodePath;
  }

  return process.env.npm_node_execpath || process.execPath;
}

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function hasFlag(name) {
  return args.includes(name);
}

function run(label, commandArgs) {
  if (!packageManagerExecPath) {
    console.error("Unable to locate the package manager runner.");
    console.error("Run this script through pnpm: pnpm run deploy:preflight");
    process.exit(1);
  }

  console.log(`\n==> ${label}`);
  const nodePath = packageManagerNodePath();
  const pathKey =
    process.platform === "win32"
      ? Object.keys(process.env).find((key) => key.toLowerCase() === "path") || "Path"
      : "PATH";
  const env = {
    ...process.env,
    [pathKey]: `${dirname(nodePath)}${delimiter}${process.env[pathKey] || ""}`,
  };

  const result = spawnSync(nodePath, [packageManagerExecPath, ...commandArgs], {
    cwd: projectRoot,
    env,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`Failed to run ${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${label} failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

const envFile = argValue("--env-file", ".env.production");
const skipProdEnv = hasFlag("--skip-prod-env");
const skipDryRun = hasFlag("--skip-dry-run");

if (hasFlag("--help") || hasFlag("-h")) {
  console.log(`Buyna.ai deployment preflight

Usage:
  pnpm run deploy:preflight -- --env-file .env.production

Options:
  --env-file <path>   Production env file to validate. Defaults to .env.production.
  --skip-prod-env     Skip production environment-variable validation.
  --skip-dry-run      Skip Cloudflare deploy dry-run.
`);
  process.exit(0);
}

if (!skipProdEnv && !existsSync(resolve(projectRoot, envFile))) {
  console.error(`Production env file not found: ${envFile}`);
  console.error("Create it locally from .env.production.example, or pass --env-file <path>.");
  console.error("Do not commit production env files.");
  process.exit(1);
}

console.log("Buyna.ai deployment preflight");
console.log(`Project: ${projectRoot}`);
console.log(`Production env check: ${skipProdEnv ? "skipped" : envFile}`);
console.log(`Cloudflare dry-run: ${skipDryRun ? "skipped" : "enabled"}`);

run("verify app", ["run", "verify"]);
if (!skipDryRun) {
  run("check Cloudflare Worker output dry-run", ["run", "cf:check"]);
}
run("check launch readiness", ["run", "check:launch"]);
run("smoke local official site", ["run", "smoke:local"]);
run("print production evidence todo", ["run", "prod-evidence:todo"]);
run("print goal audit report", ["run", "audit:goal"]);

if (!skipProdEnv) {
  run("check production environment variables", [
    "run",
    "check:prod-env",
    "--",
    "--env-file",
    envFile,
  ]);
}

console.log("\nOK: deployment preflight completed.");
