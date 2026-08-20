#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wranglerPath = resolve(projectRoot, ".output/server/wrangler.json");
const failures = [];
const warnings = [];
const requiredSecrets = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "GLOBEPAY_CREDENTIAL_CODE",
  "BILLING_TOKEN_ENCRYPTION_KEY",
];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function runWrangler(args) {
  const result = spawnSync("pnpm", ["exec", "wrangler", ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function parseVersion(text) {
  const match = text.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw: match[0],
  };
}

function isVersion4OrNewer(version) {
  return Boolean(version && version.major >= 4);
}

function readWranglerConfig() {
  if (!existsSync(wranglerPath)) {
    fail("Missing .output/server/wrangler.json. Run pnpm run build first.");
    return null;
  }

  try {
    return JSON.parse(readFileSync(wranglerPath, "utf8"));
  } catch (error) {
    fail(`Unable to parse .output/server/wrangler.json: ${error.message}`);
    return null;
  }
}

console.log("Buyna.ai Cloudflare account preflight");

const versionResult = runWrangler(["--version"]);
const wranglerVersion = parseVersion(`${versionResult.stdout}\n${versionResult.stderr}`);
if (versionResult.status !== 0) {
  fail("Unable to run Wrangler through pnpm exec. Run pnpm install --frozen-lockfile.");
} else if (!isVersion4OrNewer(wranglerVersion)) {
  fail(`Wrangler must be v4.x or newer. Current output: ${versionResult.stdout}`);
}

const config = readWranglerConfig();
if (config) {
  if (config.name !== "buyna-ai-official") {
    fail(`Worker name must be buyna-ai-official. Current: ${config.name ?? "(missing)"}`);
  }
  if (config.main !== "index.mjs") {
    fail(`Worker main must be index.mjs. Current: ${config.main ?? "(missing)"}`);
  }
  if (config.assets?.binding !== "ASSETS") {
    fail("Worker static assets binding must be ASSETS.");
  }
  if (config.keep_vars !== true) {
    fail("Worker config must set keep_vars=true so dashboard variables are preserved.");
  }
  if (config.observability?.enabled !== true) {
    fail("Worker config must enable observability.");
  }
  if (
    !Array.isArray(config.compatibility_flags) ||
    !config.compatibility_flags.includes("nodejs_compat")
  ) {
    fail("Worker config must include nodejs_compat compatibility flag.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.compatibility_date ?? "")) {
    fail("Worker config must set compatibility_date in YYYY-MM-DD format.");
  }

  for (const secret of requiredSecrets) {
    if (!config.secrets?.required?.includes(secret)) {
      fail(`Worker config must require Cloudflare secret ${secret}.`);
    }
  }
}

const whoamiResult = runWrangler(["whoami"]);
const whoamiText = `${whoamiResult.stdout}\n${whoamiResult.stderr}`;
if (whoamiResult.status !== 0 || /not authenticated/i.test(whoamiText)) {
  fail(
    "Wrangler is not authenticated for this machine. Run pnpm exec wrangler login, then rerun pnpm run check:cloudflare-account.",
  );
} else if (!whoamiResult.stdout) {
  warn("Wrangler whoami succeeded but did not print account details.");
}

if (wranglerVersion) {
  console.log(`- Wrangler: ${wranglerVersion.raw}`);
}
if (config) {
  console.log(`- Worker: ${config.name}`);
  console.log(`- Compatibility date: ${config.compatibility_date}`);
  console.log(`- Required secrets: ${requiredSecrets.join(", ")}`);
}
if (whoamiResult.status === 0 && !/not authenticated/i.test(whoamiText)) {
  console.log("- Wrangler auth: OK");
  console.log(whoamiResult.stdout);
}

if (warnings.length) {
  console.log("\nWarnings:");
  for (const message of warnings) console.log(`- ${message}`);
}

if (failures.length) {
  console.error("\nFailures:");
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log("\nOK: Cloudflare account preflight passed. No deploy was performed.");
