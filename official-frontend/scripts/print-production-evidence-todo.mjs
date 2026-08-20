#!/usr/bin/env node

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_EVIDENCE_FILE, validateProductionEvidence } from "./production-evidence-rules.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const evidenceFile = readArg("--evidence-file") || DEFAULT_EVIDENCE_FILE;
const strict = args.includes("--strict");
const result = validateProductionEvidence({ projectRoot, evidenceFile });

const safeEvidenceByArea = new Map([
  [
    "GitHub source of truth",
    [
      "GitHub repository URL",
      "branch name",
      "full commit SHA",
      "successful CI run URL",
      "CI conclusion",
    ],
  ],
  [
    "Production env",
    [
      "check timestamp",
      "public site URL",
      "APP_URL",
      "GLOBEPAY_MODE=live",
      "configured secret names only",
    ],
  ],
  [
    "Supabase production migration",
    [
      "staging/production migration status",
      "applied migration filenames",
      "verified table names",
      "masked project reference",
    ],
  ],
  [
    "GlobePay merchant dashboard",
    [
      "callback URLs",
      "WorldPay Recurring enabled status",
      "Hosted 3DS enabled status",
      "masked merchant/account reference",
    ],
  ],
  [
    "Production deployment",
    [
      "Cloudflare Worker name",
      "deployed URL",
      "full deployed commit SHA",
      "deployment status",
      "smoke check command and timestamp",
    ],
  ],
  [
    "Real payment verification",
    [
      "masked order/subscription references",
      "PAY_SUCCESS status names",
      "ACTIVE agreement status",
      "admin/CSV verification booleans",
      "verification timestamps",
    ],
  ],
]);

const commandByArea = new Map([
  ["GitHub source of truth", "pnpm run github:source-plan"],
  ["Production env", "pnpm run check:prod-env -- --env-file .env.production"],
  ["Supabase production migration", "pnpm run supabase:migration-plan"],
  ["GlobePay merchant dashboard", "pnpm run globepay:dashboard-plan -- --env-file .env.production"],
  [
    "Production deployment",
    "pnpm run deploy:preflight -- --env-file .env.production && pnpm run cf:deploy",
  ],
  [
    "Real payment verification",
    "pnpm run payment:verification-plan -- --amount 100 --currency JPY",
  ],
]);

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return args[index + 1] ?? "";
}

function printList(items) {
  for (const item of items) console.log(`  - ${item}`);
}

console.log("Buyna.ai production evidence todo");
console.log("This command is read-only. It never creates, edits, uploads, or deploys anything.");
console.log(`Evidence file: ${evidenceFile}`);
console.log(`Exists: ${existsSync(resolve(projectRoot, evidenceFile)) ? "yes" : "no"}`);
console.log(`Strict exit: ${strict ? "yes" : "no"}`);

if (!result.exists) {
  console.log("\nStart:");
  console.log("  pnpm run prod-evidence:init");
  console.log("  pnpm run prod-evidence:plan");
}

if (result.failures.length) {
  console.log("\nFile-level problems:");
  printList(result.failures);
}

const missing = result.exists
  ? result.checks.filter((check) => !check.ok)
  : [...safeEvidenceByArea.keys()].map((area) => ({
      area,
      evidence: `${evidenceFile} has not been initialized yet`,
      next: "Run pnpm run prod-evidence:init, then fill this section with real non-secret production proof.",
    }));
const proved = result.checks.filter((check) => check.ok);

console.log(`\nSummary: ${proved.length} proved, ${missing.length} missing or invalid`);

for (const check of missing) {
  console.log(`\n[MISSING] ${check.area}`);
  console.log(`Current evidence: ${check.evidence}`);
  console.log(`Next: ${check.next}`);

  const command = commandByArea.get(check.area);
  if (command) {
    console.log("Useful command:");
    console.log(`  ${command}`);
  }

  const safeFields = safeEvidenceByArea.get(check.area);
  if (safeFields) {
    console.log("Safe evidence to record:");
    printList(safeFields);
  }
}

if (proved.length) {
  console.log("\nAlready proved:");
  for (const check of proved) console.log(`- ${check.area}`);
}

console.log("\nNever record:");
printList([
  "API keys, service-role keys, GlobePay credential_code, passwords, or tokens",
  "raw card data, customer PII, or raw webhook payloads",
  "unmasked provider customer identifiers",
]);

console.log("\nFinal gate:");
console.log("  pnpm run check:prod-evidence");
console.log("  pnpm run audit:goal:strict");

process.exit(strict && !result.ok ? 1 : 0);
