#!/usr/bin/env node

import { existsSync, rmSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deployConfigPath = resolve(projectRoot, ".wrangler/deploy/config.json");

function normalized(value) {
  return String(value ?? "")
    .replaceAll("\\", "/")
    .toLowerCase();
}

if (!existsSync(deployConfigPath)) {
  process.exit(0);
}

let deployConfig;
try {
  deployConfig = JSON.parse(readFileSync(deployConfigPath, "utf8"));
} catch (error) {
  console.error(`Unable to parse ${deployConfigPath}: ${error.message}`);
  console.error("Remove the stale Wrangler deploy state file and retry.");
  process.exit(1);
}

const configPath = normalized(deployConfig.configPath);
if (!configPath.includes(".output/server/wrangler.json")) {
  console.error(`Unexpected Wrangler deploy state at ${deployConfigPath}.`);
  console.error(`It points to: ${deployConfig.configPath ?? "(missing configPath)"}`);
  console.error("Move or remove that state before running official-frontend Cloudflare scripts.");
  process.exit(1);
}

rmSync(deployConfigPath, { force: true });
console.log("Removed stale Wrangler deploy state for generated Cloudflare output.");
