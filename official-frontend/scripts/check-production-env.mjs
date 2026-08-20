#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const failures = [];
const warnings = [];

const serverOnlySecrets = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "GLOBEPAY_CREDENTIAL_CODE",
  "BILLING_TOKEN_ENCRYPTION_KEY",
  "LOVABLE_API_KEY",
  "OPENAI_API_KEY",
  "PLATFORM_SUBSCRIPTION_API_KEY",
];

const cloudflareRequiredSecrets = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "GLOBEPAY_CREDENTIAL_CODE",
  "BILLING_TOKEN_ENCRYPTION_KEY",
];

const cloudflareOptionalSecrets = [
  "LOVABLE_API_KEY or OPENAI_API_KEY",
  "PLATFORM_SUBSCRIPTION_API_KEY",
];

const cloudflareVariables = [
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

function argValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function loadEnvFile(filePath) {
  const resolved = resolve(process.cwd(), filePath);
  if (!existsSync(resolved)) {
    failures.push(`env file not found: ${filePath}`);
    return;
  }

  const lines = readFileSync(resolved, "utf8").split(/\r?\n/);
  for (const line of lines) {
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
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const envFile = argValue("--env-file");
if (envFile) loadEnvFile(envFile);

function valueOf(name) {
  return (process.env[name] ?? "").trim();
}

function hasValue(name) {
  return valueOf(name).length > 0;
}

function isPlaceholder(value) {
  if (!value) return true;
  return [
    /^your-/i,
    /your-project/i,
    /your-server/i,
    /example\.com/i,
    /changeme/i,
    /todo/i,
    /placeholder/i,
  ].some((pattern) => pattern.test(value));
}

function requireValue(name, { secret = false, minLength = 1 } = {}) {
  const value = valueOf(name);
  if (isPlaceholder(value)) {
    failures.push(`${name} is missing or still a placeholder`);
    return "";
  }
  if (secret && value.length < minLength) {
    failures.push(`${name} is too short for production`);
  }
  return value;
}

function parseUrl(name, { required = true, https = true } = {}) {
  const value = required ? requireValue(name) : valueOf(name);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (https && url.protocol !== "https:") failures.push(`${name} must use https`);
    return url;
  } catch {
    failures.push(`${name} must be a valid URL`);
    return null;
  }
}

function assertExactUrl(name, expected) {
  const value = requireValue(name).replace(/\/$/, "");
  if (!value) return;
  if (value !== expected) {
    failures.push(`${name} must be ${expected}`);
  }
}

function assertNoLeadingEquals(name) {
  if (valueOf(name).startsWith("=")) {
    failures.push(`${name} must not start with =`);
  }
}

function assertProductionOrigin(name, url) {
  if (!url) return;
  if (url.username || url.password) {
    failures.push(`${name} must not include credentials in the URL`);
  }
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1") {
    failures.push(`${name} must not use localhost for production`);
  }
  if (url.hostname.endsWith(".local") || url.hostname.endsWith(".test")) {
    failures.push(`${name} must use a real production domain`);
  }
  if (url.hostname.endsWith(".lovableproject.com") || url.hostname.endsWith(".lovable.app")) {
    failures.push(`${name} must not point to a Lovable preview domain in production`);
  }
}

function assertOriginOnly(name, url) {
  if (!url) return;
  assertProductionOrigin(name, url);
  if (url.pathname !== "/" || url.search || url.hash) {
    failures.push(`${name} must be an origin only, for example https://www.buyna.ai`);
  }
}

function assertCallbackUrl(name, url) {
  if (!url) return;
  assertProductionOrigin(name, url);
  if (url.search || url.hash) {
    failures.push(`${name} must not include query strings or hash fragments`);
  }
}

function assertServerOnlySecretNotPublic(secretName) {
  const publicName = `VITE_${secretName}`;
  if (hasValue(publicName)) {
    failures.push(`${publicName} must not be set; ${secretName} is server-only`);
  }
}

const publicUrl = parseUrl("PUBLIC_SITE_URL");
const appUrl = parseUrl("APP_URL");
const supabaseUrl = parseUrl("SUPABASE_URL");
const viteSupabaseUrl = parseUrl("VITE_SUPABASE_URL");

requireValue("SUPABASE_PUBLISHABLE_KEY");
requireValue("VITE_SUPABASE_PUBLISHABLE_KEY");
requireValue("SUPABASE_SERVICE_ROLE_KEY", { secret: true, minLength: 24 });
requireValue("GLOBEPAY_PARTNER_CODE");
requireValue("GLOBEPAY_CREDENTIAL_CODE", { secret: true, minLength: 8 });
requireValue("BILLING_TOKEN_ENCRYPTION_KEY", { secret: true, minLength: 32 });

for (const secretName of serverOnlySecrets) {
  assertServerOnlySecretNotPublic(secretName);
}

const mode = valueOf("GLOBEPAY_MODE").toLowerCase();
if (mode !== "live") failures.push("GLOBEPAY_MODE must be live for production");

assertExactUrl("GLOBEPAY_API_BASE_URL", "https://pay.globepay.co.jp");
assertExactUrl("GLOBEPAY_BASE_URL", "https://pay.globepay.co.jp/api/v1.0");

assertOriginOnly("PUBLIC_SITE_URL", publicUrl);
assertOriginOnly("APP_URL", appUrl);

for (const name of ["GLOBEPAY_API_BASE_URL", "GLOBEPAY_BASE_URL"]) {
  const value = valueOf(name);
  if (value.includes("pay.globepay.co/") || value.includes("pay.globepay.cn")) {
    failures.push(`${name} must use the GlobePay Japan host`);
  }
  if (/api\/v1\.0\/api\/v1\.0/i.test(value)) {
    failures.push(`${name} contains a duplicated api/v1.0 path`);
  }
}

const notifyUrl = parseUrl("GLOBEPAY_NOTIFY_URL");
const recurringNotifyUrl = parseUrl("GLOBEPAY_RECURRING_NOTIFY_URL");
const returnUrl = parseUrl("GLOBEPAY_RETURN_URL");

for (const name of [
  "GLOBEPAY_NOTIFY_URL",
  "GLOBEPAY_RECURRING_NOTIFY_URL",
  "GLOBEPAY_RETURN_URL",
]) {
  assertNoLeadingEquals(name);
}

const expectedOrigin = publicUrl?.origin;
for (const [name, url] of [
  ["APP_URL", appUrl],
  ["GLOBEPAY_NOTIFY_URL", notifyUrl],
  ["GLOBEPAY_RECURRING_NOTIFY_URL", recurringNotifyUrl],
  ["GLOBEPAY_RETURN_URL", returnUrl],
]) {
  if (expectedOrigin && url && url.origin !== expectedOrigin) {
    failures.push(`${name} must use the same origin as PUBLIC_SITE_URL`);
  }
}

for (const [name, url] of [
  ["GLOBEPAY_NOTIFY_URL", notifyUrl],
  ["GLOBEPAY_RECURRING_NOTIFY_URL", recurringNotifyUrl],
  ["GLOBEPAY_RETURN_URL", returnUrl],
]) {
  assertCallbackUrl(name, url);
}

if (notifyUrl && notifyUrl.pathname !== "/api/public/globepay/notify") {
  failures.push("GLOBEPAY_NOTIFY_URL must point to /api/public/globepay/notify");
}
if (recurringNotifyUrl && recurringNotifyUrl.pathname !== "/api/public/globepay-recurring-notify") {
  failures.push(
    "GLOBEPAY_RECURRING_NOTIFY_URL must point to /api/public/globepay-recurring-notify",
  );
}
if (returnUrl && returnUrl.pathname !== "/subscription/return") {
  failures.push("GLOBEPAY_RETURN_URL must point to /subscription/return");
}

if (supabaseUrl && viteSupabaseUrl && supabaseUrl.origin !== viteSupabaseUrl.origin) {
  failures.push("SUPABASE_URL and VITE_SUPABASE_URL must point to the same Supabase project");
}

if (valueOf("SUPABASE_SERVICE_ROLE_KEY") === valueOf("SUPABASE_PUBLISHABLE_KEY")) {
  failures.push("SUPABASE_SERVICE_ROLE_KEY must not equal SUPABASE_PUBLISHABLE_KEY");
}
if (valueOf("SUPABASE_SERVICE_ROLE_KEY") === valueOf("VITE_SUPABASE_PUBLISHABLE_KEY")) {
  failures.push("SUPABASE_SERVICE_ROLE_KEY must not equal VITE_SUPABASE_PUBLISHABLE_KEY");
}

if (!valueOf("LOVABLE_API_KEY") && !valueOf("OPENAI_API_KEY")) {
  warnings.push("AI guide is not enabled: LOVABLE_API_KEY or OPENAI_API_KEY is missing");
}

if (!valueOf("PLATFORM_ACCOUNT_URL")) {
  warnings.push(
    "PLATFORM_ACCOUNT_URL is not set; subscription fallback account link will be unavailable",
  );
}

console.log("Buyna.ai production environment preflight");
console.log(`Checked env source: ${envFile ? envFile : "process.env"}`);

if (publicUrl) {
  console.log(`Production origin: ${publicUrl.origin}`);
}
console.log("\nGlobePay dashboard callback URLs:");
console.log(`- One-time notify: ${notifyUrl?.toString() ?? "missing"}`);
console.log(`- Recurring notify: ${recurringNotifyUrl?.toString() ?? "missing"}`);
console.log(`- Return URL: ${returnUrl?.toString() ?? "missing"}`);

console.log("\nCloudflare secrets to set:");
for (const secret of cloudflareRequiredSecrets) console.log(`- ${secret} (required)`);
for (const secret of cloudflareOptionalSecrets) console.log(`- ${secret} (optional/conditional)`);

console.log("\nCloudflare non-secret variables to set:");
for (const variable of cloudflareVariables) console.log(`- ${variable}`);

if (warnings.length) {
  console.log("\nWarnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (failures.length) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("\nOK: production environment shape looks deploy-ready.");
