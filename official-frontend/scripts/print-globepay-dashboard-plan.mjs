#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const envFile = readArg("--env-file") || ".env.production.example";
const strict = args.includes("--strict");

const expected = {
  apiHost: "https://pay.globepay.co.jp",
  apiBase: "https://pay.globepay.co.jp/api/v1.0",
  oneTimeNotifyUrl: "https://www.buyna.ai/api/public/globepay/notify",
  recurringNotifyUrl: "https://www.buyna.ai/api/public/globepay-recurring-notify",
  returnUrl: "https://www.buyna.ai/subscription/return",
};

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return args[index + 1] ?? "";
}

function parseEnvFile(path) {
  const values = new Map();
  const resolved = resolve(process.cwd(), path);
  if (!existsSync(resolved)) return { exists: false, values };

  for (const line of readFileSync(resolved, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    values.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }

  return { exists: true, values };
}

function checkValue(values, key, expectedValue) {
  const actual = values.get(key) ?? "";
  const ok = actual === expectedValue;
  console.log(`- [${ok ? "OK" : "CHECK"}] ${key}: ${expectedValue}`);
  return ok;
}

const env = parseEnvFile(envFile);
const failures = [];

console.log("Buyna.ai GlobePay merchant dashboard setup plan");
console.log("This command is read-only: it does not contact GlobePay or run payment requests.");
console.log(`Env source: ${env.exists ? envFile : `${envFile} (not found)`}`);

console.log("\n1. GlobePay Japan host and production mode");
if (env.exists) {
  if (!checkValue(env.values, "GLOBEPAY_API_BASE_URL", expected.apiHost)) {
    failures.push("GLOBEPAY_API_BASE_URL must use the GlobePay Japan host.");
  }
  if (!checkValue(env.values, "GLOBEPAY_BASE_URL", expected.apiBase)) {
    failures.push("GLOBEPAY_BASE_URL must be the Japan API base without duplicated /api/v1.0.");
  }
  if (!checkValue(env.values, "GLOBEPAY_MODE", "live")) {
    failures.push("GLOBEPAY_MODE must be live for production.");
  }
} else {
  failures.push(`${envFile} was not found.`);
  console.log(`- [CHECK] GLOBEPAY_API_BASE_URL: ${expected.apiHost}`);
  console.log(`- [CHECK] GLOBEPAY_BASE_URL: ${expected.apiBase}`);
  console.log("- [CHECK] GLOBEPAY_MODE: live");
}
console.log("- Never expose GLOBEPAY_CREDENTIAL_CODE through VITE_* or browser code.");
console.log("- Signing string must be partner_code&time&nonce_str&credential_code.");

console.log("\n2. Dashboard callback URLs to configure exactly");
if (env.exists) {
  if (!checkValue(env.values, "GLOBEPAY_NOTIFY_URL", expected.oneTimeNotifyUrl)) {
    failures.push("One-time notify URL does not match the production callback.");
  }
  if (!checkValue(env.values, "GLOBEPAY_RECURRING_NOTIFY_URL", expected.recurringNotifyUrl)) {
    failures.push("Recurring notify URL does not match the production callback.");
  }
  if (!checkValue(env.values, "GLOBEPAY_RETURN_URL", expected.returnUrl)) {
    failures.push("Return URL does not match the production subscription return path.");
  }
} else {
  console.log(`- [CHECK] One-time notify: ${expected.oneTimeNotifyUrl}`);
  console.log(`- [CHECK] Recurring notify: ${expected.recurringNotifyUrl}`);
  console.log(`- [CHECK] Return URL: ${expected.returnUrl}`);
}

console.log("\n3. Merchant capability confirmations");
console.log(
  "- [CONFIRM IN GLOBEPAY] Production partner code and credential belong to the same account.",
);
console.log("- [CONFIRM IN GLOBEPAY] WorldPay Recurring is enabled for this partner code.");
console.log(
  "- [CONFIRM IN GLOBEPAY] Hosted 3DS is enabled for first customer-initiated subscription authorization.",
);
console.log(
  "- [CONFIRM IN GLOBEPAY] Credit card / hosted checkout method is enabled for production payments.",
);
console.log("- [CONFIRM IN GLOBEPAY] Merchant dashboard accepts both notify URLs above.");

console.log("\n4. Payment success rules to preserve during testing");
console.log("- Provider order creation is not payment success.");
console.log("- Redirect/return page is not payment success.");
console.log(
  "- One-time payment is paid only after verified notify/query returns result_code=PAY_SUCCESS.",
);
console.log("- Recurring agreement must become ACTIVE before later MIT charges.");
console.log(
  "- Recurring monthly charge is paid only after query/notify returns result_code=PAY_SUCCESS.",
);

console.log("\n5. Evidence to record in .production-evidence.json");
console.log("- checkedAt timestamp");
console.log("- japanHostConfirmed: true");
console.log(`- oneTimeNotifyUrl: ${expected.oneTimeNotifyUrl}`);
console.log(`- recurringNotifyUrl: ${expected.recurringNotifyUrl}`);
console.log(`- returnUrl: ${expected.returnUrl}`);
console.log("- worldPayRecurringEnabled: true");
console.log("- threeDsEnabled: true");
console.log(
  "- masked merchant/account reference only; no credential_code or raw webhook payloads.",
);

if (strict && failures.length) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
