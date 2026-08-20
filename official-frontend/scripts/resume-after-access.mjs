#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = ".env.production";
const args = process.argv.slice(2);
const watch = args.includes("--watch");
const deployWhenReady = args.includes("--deploy-when-ready");
const intervalSeconds = Number(readArg("--interval-seconds") || "300");
const maxAttempts = Number(readArg("--max-attempts") || "0");
const statusFile = readArg("--status-file") || ".resume-after-access-status.json";
const baseUrl = readArg("--base-url") || "https://www.buyna.ai/";
const steps = [
  {
    name: "GitHub source of truth",
    command: ["pnpm", "run", "check:github-source"],
  },
  {
    name: "Cloudflare account and Worker config",
    command: ["pnpm", "run", "check:cloudflare-account"],
  },
  {
    name: "Production environment",
    command: ["pnpm", "run", "check:prod-env", "--", "--env-file", envFile],
    skipWhen: () => !existsSync(resolve(projectRoot, envFile)),
    skipReason: `${envFile} is missing. Copy .env.production.example to ${envFile} and fill production values outside Git.`,
  },
  {
    name: "Local release gate and Cloudflare dry-run",
    command: ["pnpm", "run", "deploy:preflight", "--", "--env-file", envFile],
    skipWhen: () => !existsSync(resolve(projectRoot, envFile)),
    skipReason: `${envFile} is missing, so deploy:preflight cannot validate production values.`,
  },
  {
    name: "Production evidence file",
    command: ["pnpm", "run", "check:prod-evidence"],
  },
  {
    name: "Full goal audit",
    command: ["pnpm", "run", "audit:goal"],
  },
];
const deploySteps = [
  {
    name: "Cloudflare production deploy",
    command: ["pnpm", "run", "cf:deploy"],
  },
  {
    name: "Production URL smoke check",
    command: ["pnpm", "run", "smoke:url", "--", "--base-url", baseUrl],
  },
];

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return args[index + 1] ?? "";
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runStep(step) {
  if (step.skipWhen?.()) {
    return {
      name: step.name,
      status: "skipped",
      message: step.skipReason,
    };
  }

  const result = spawnSync(step.command[0], step.command.slice(1), {
    cwd: projectRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return {
    name: step.name,
    status: result.status === 0 ? "passed" : "failed",
    command: step.command.join(" "),
    output: [result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n"),
  };
}

function runOnce() {
  const results = steps.map(runStep);

  for (const result of results) {
    const icon = result.status === "passed" ? "OK" : result.status === "skipped" ? "SKIP" : "FAIL";
    console.log(`\n[${icon}] ${result.name}`);
    if (result.command) console.log(`Command: ${result.command}`);
    if (result.message) console.log(result.message);
    if (result.status !== "passed" && result.output) {
      const lines = result.output.split(/\r?\n/).slice(-12);
      console.log(lines.join("\n"));
    }
  }

  const failed = results.filter((result) => result.status === "failed");
  const skipped = results.filter((result) => result.status === "skipped");

  console.log("\nSummary:");
  console.log(`- Passed: ${results.filter((result) => result.status === "passed").length}`);
  console.log(`- Failed: ${failed.length}`);
  console.log(`- Skipped: ${skipped.length}`);

  let deployment = [];
  const ready = failed.length === 0 && skipped.length === 0;

  if (ready && deployWhenReady) {
    console.log("\nAll access checks passed. Deploy-when-ready is enabled.");
    deployment = deploySteps.map(runStep);

    for (const result of deployment) {
      const icon = result.status === "passed" ? "OK" : "FAIL";
      console.log(`\n[${icon}] ${result.name}`);
      if (result.command) console.log(`Command: ${result.command}`);
      if (result.status !== "passed" && result.output) {
        const lines = result.output.split(/\r?\n/).slice(-12);
        console.log(lines.join("\n"));
      }
    }
  } else if (ready) {
    console.log("\nReady for the explicit production deploy step:");
    console.log("pnpm run cf:deploy");
    console.log(`pnpm run smoke:url -- --base-url ${baseUrl}`);
  } else {
    console.log("\nNext:");
    console.log("- Fix the failed or skipped external items above.");
    console.log(
      watch
        ? "- Watch mode will check again automatically."
        : "- Rerun pnpm run resume:after-access.",
    );
  }

  const status = {
    ok: ready && deployment.every((result) => result.status === "passed"),
    checkedAt: new Date().toISOString(),
    watch,
    deployWhenReady,
    baseUrl,
    statusFile,
    summary: {
      passed: results.filter((result) => result.status === "passed").length,
      failed: failed.length,
      skipped: skipped.length,
      deploymentPassed: deployment.filter((result) => result.status === "passed").length,
      deploymentFailed: deployment.filter((result) => result.status === "failed").length,
    },
    steps: results.map((result) => ({
      name: result.name,
      status: result.status,
      command: result.command,
      message: result.message,
    })),
    deployment: deployment.map((result) => ({
      name: result.name,
      status: result.status,
      command: result.command,
      message: result.message,
    })),
    next:
      failed.length || skipped.length
        ? "Fix failed or skipped external items, then rerun pnpm run resume:after-access or keep pnpm run resume:watch running."
        : deployWhenReady
          ? "Deployment automation has run. Fill production evidence, then run pnpm run check:prod-evidence and pnpm run audit:goal:strict."
          : `Run pnpm run cf:deploy, then pnpm run smoke:url -- --base-url ${baseUrl}.`,
  };

  writeFileSync(resolve(projectRoot, statusFile), `${JSON.stringify(status, null, 2)}\n`);
  console.log(`\nStatus file: ${statusFile}`);

  return status;
}

console.log("Buyna.ai resume-after-access check");
if (deployWhenReady) {
  console.log(
    "Deploy-when-ready enabled: this command runs pnpm run cf:deploy after all access checks pass.",
  );
  console.log(`Production smoke base URL: ${baseUrl}`);
} else {
  console.log("This command is non-destructive: it does not run pnpm run cf:deploy.");
}

if (!watch) {
  process.exit(runOnce().ok ? 0 : 1);
}

console.log(
  `Watch mode enabled. Interval: ${intervalSeconds}s. Max attempts: ${maxAttempts || "unlimited"}.`,
);

let attempt = 0;
while (true) {
  attempt += 1;
  console.log(`\nAttempt ${attempt}${maxAttempts ? ` / ${maxAttempts}` : ""}`);
  const result = runOnce();
  if (result.ok) process.exit(0);
  if (maxAttempts && attempt >= maxAttempts) process.exit(1);
  sleep(Math.max(1, intervalSeconds) * 1000);
}
