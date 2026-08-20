#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wranglerPath = resolve(projectRoot, ".output/server/wrangler.json");

const requiredProductionSecrets = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "GLOBEPAY_CREDENTIAL_CODE",
  "BILLING_TOKEN_ENCRYPTION_KEY",
];

if (!existsSync(wranglerPath)) {
  console.error("Cloudflare Wrangler config not found at .output/server/wrangler.json.");
  console.error("Run pnpm run build before preparing the Cloudflare config.");
  process.exit(1);
}

let config;
try {
  config = JSON.parse(readFileSync(wranglerPath, "utf8"));
} catch (error) {
  console.error(`Unable to parse .output/server/wrangler.json: ${error.message}`);
  process.exit(1);
}

const existingRequiredSecrets = Array.isArray(config.secrets?.required)
  ? config.secrets.required
  : [];

config.keep_vars = true;
config.observability = {
  ...config.observability,
  enabled: true,
};
config.secrets = {
  ...config.secrets,
  required: Array.from(new Set([...existingRequiredSecrets, ...requiredProductionSecrets])).sort(),
};

writeFileSync(wranglerPath, `${JSON.stringify(config, null, 2)}\n`);

console.log("Prepared Cloudflare Wrangler config:");
console.log("- keep_vars enabled");
console.log("- observability enabled");
console.log(`- required production secrets: ${config.secrets.required.join(", ")}`);
