#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const statusFile = readArg("--status-file") || ".resume-after-access-status.json";
const statusPath = resolve(projectRoot, statusFile);

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return args[index + 1] ?? "";
}

function icon(status) {
  if (status === "passed") return "OK";
  if (status === "skipped") return "SKIP";
  return "FAIL";
}

if (!existsSync(statusPath)) {
  console.error(`Resume status file not found: ${statusFile}`);
  console.error("Run pnpm run resume:after-access or pnpm run resume:watch first.");
  process.exit(1);
}

let status;
try {
  status = JSON.parse(readFileSync(statusPath, "utf8"));
} catch (error) {
  console.error(`Unable to parse ${statusFile}: ${error.message}`);
  process.exit(1);
}

console.log("Buyna.ai resume status");
console.log(`Ready: ${status.ok === true ? "yes" : "no"}`);
console.log(`Checked at: ${status.checkedAt ?? "(unknown)"}`);
console.log(`Source: ${status.statusFile ?? statusFile}`);
console.log(`Deploy when ready: ${status.deployWhenReady === true ? "yes" : "no"}`);
if (status.baseUrl) console.log(`Base URL: ${status.baseUrl}`);

const summary = status.summary ?? {};
console.log("\nSummary:");
console.log(`- Passed: ${summary.passed ?? 0}`);
console.log(`- Failed: ${summary.failed ?? 0}`);
console.log(`- Skipped: ${summary.skipped ?? 0}`);
if ((summary.deploymentPassed ?? 0) || (summary.deploymentFailed ?? 0)) {
  console.log(`- Deployment passed: ${summary.deploymentPassed ?? 0}`);
  console.log(`- Deployment failed: ${summary.deploymentFailed ?? 0}`);
}

if (Array.isArray(status.steps)) {
  console.log("\nSteps:");
  for (const step of status.steps) {
    console.log(`- [${icon(step.status)}] ${step.name}`);
    if (step.command) console.log(`  Command: ${step.command}`);
    if (step.message) console.log(`  ${step.message}`);
  }
}

if (Array.isArray(status.deployment) && status.deployment.length) {
  console.log("\nDeployment:");
  for (const step of status.deployment) {
    console.log(`- [${icon(step.status)}] ${step.name}`);
    if (step.command) console.log(`  Command: ${step.command}`);
    if (step.message) console.log(`  ${step.message}`);
  }
}

if (status.next) {
  console.log("\nNext:");
  console.log(status.next);
}

process.exit(status.ok === true ? 0 : 1);
