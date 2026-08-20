#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const envFile = readArg("--env-file") || ".env.production";

const requiredSecrets = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "GLOBEPAY_CREDENTIAL_CODE",
  "BILLING_TOKEN_ENCRYPTION_KEY",
];

const conditionalSecrets = [
  {
    names: ["LOVABLE_API_KEY", "OPENAI_API_KEY"],
    note: "Set at least one when the AI shopping guide should answer real users.",
  },
  {
    names: ["PLATFORM_SUBSCRIPTION_API_KEY"],
    note: "Set only when PLATFORM_SUBSCRIPTION_API_URL is enabled.",
  },
];

const variables = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "PUBLIC_SITE_URL",
  "APP_URL",
  "GLOBEPAY_MODE",
  "GLOBEPAY_API_BASE_URL",
  "GLOBEPAY_BASE_URL",
  "GLOBEPAY_PARTNER_CODE",
  "GLOBEPAY_NOTIFY_URL",
  "GLOBEPAY_RECURRING_NOTIFY_URL",
  "GLOBEPAY_RETURN_URL",
  "PLATFORM_ACCOUNT_URL",
  "PLATFORM_SUBSCRIPTION_API_URL",
];

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return args[index + 1] ?? "";
}

function parseEnvFile(path) {
  const values = new Map();
  const resolved = resolve(process.cwd(), path);
  if (!existsSync(resolved)) return { values, exists: false, path };

  for (const line of readFileSync(resolved, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }

  return { values, exists: true, path };
}

function valueState(values, name) {
  const value = values.get(name) ?? "";
  if (!value) return "missing";
  if (
    /^your-/i.test(value) ||
    /your-project/i.test(value) ||
    /changeme/i.test(value) ||
    /placeholder/i.test(value)
  ) {
    return "placeholder";
  }
  return "present";
}

function marker(state) {
  if (state === "present") return "OK";
  if (state === "placeholder") return "PLACEHOLDER";
  return "MISSING";
}

function printKeyState(values, name) {
  const state = valueState(values, name);
  console.log(`- [${marker(state)}] ${name}`);
  return state;
}

const env = parseEnvFile(envFile);
const missingRequired = [];

console.log("Buyna.ai Cloudflare environment setup plan");
console.log(`Env source: ${env.exists ? env.path : `${env.path} (not found)`}`);
console.log("This command never prints secret or variable values.");

console.log("\n1. Required Worker secrets");
for (const secret of requiredSecrets) {
  const state = printKeyState(env.values, secret);
  if (state !== "present") missingRequired.push(secret);
}

console.log("\nSet required secrets with:");
for (const secret of requiredSecrets) {
  console.log(`pnpm exec wrangler --cwd .output/server secret put ${secret}`);
}

console.log("\n2. Conditional Worker secrets");
for (const group of conditionalSecrets) {
  const states = group.names.map((name) => [name, valueState(env.values, name)]);
  const groupMarker = states.some(([, state]) => state === "present") ? "OK" : "OPTIONAL";
  console.log(`- [${groupMarker}] ${group.names.join(" or ")}`);
  console.log(`  ${group.note}`);
  for (const [name, state] of states) {
    console.log(`  ${name}: ${marker(state)}`);
  }
}

console.log("\n3. Cloudflare dashboard variables");
for (const variable of variables) {
  printKeyState(env.values, variable);
}

console.log("\nRecommended order after access is available:");
console.log("1. Fill .env.production locally without committing it.");
console.log("2. Run pnpm run check:prod-env -- --env-file .env.production.");
console.log("3. Set the dashboard variables above in Cloudflare.");
console.log("4. Run each wrangler secret put command above.");
console.log("5. Run pnpm run check:cloudflare-account.");
console.log("6. Run pnpm run deploy:preflight -- --env-file .env.production.");

if (strict && missingRequired.length) {
  console.error("\nMissing required secret values in the selected env file:");
  for (const secret of missingRequired) console.error(`- ${secret}`);
  process.exit(1);
}
