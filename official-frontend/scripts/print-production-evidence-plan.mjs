#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_EVIDENCE_FILE, validateProductionEvidence } from "./production-evidence-rules.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const evidenceFile = readArg("--evidence-file") || DEFAULT_EVIDENCE_FILE;
const evidencePath = resolve(projectRoot, evidenceFile);
const result = validateProductionEvidence({ projectRoot, evidenceFile });

const sections = [
  {
    name: "github",
    gate: "GitHub source of truth",
    plan: "pnpm run github:source-plan",
    proof: [
      "remoteUrl: production GitHub repository URL",
      "branch: codex/official-frontend-source",
      "commitSha: full current commit SHA",
      "pushed: true",
      "ciStatus: success",
      "ciRunUrl: successful GitHub Actions run URL",
    ],
  },
  {
    name: "productionEnv",
    gate: "Production env",
    plan: "pnpm run check:prod-env -- --env-file .env.production",
    proof: [
      "checkedAt: timestamp after check passes",
      "checkPassed: true",
      "publicSiteUrl/appUrl: https://www.buyna.ai",
      "globepayMode: live",
      "aiGuideConfigured: true when LOVABLE_API_KEY or OPENAI_API_KEY is set",
      "serverOnlySecretNamesConfigured: names only, never values",
    ],
  },
  {
    name: "supabase",
    gate: "Supabase production migration",
    plan: "pnpm run supabase:migration-plan",
    proof: [
      "stagingMigrationsApplied: true",
      "productionMigrationsApplied: true",
      "productionCheckedAt: timestamp after production table verification",
      "appliedMigrationFiles: every SQL file under supabase/migrations",
      "verifiedTables: required AI, subscription, charge, and recurring tables",
    ],
  },
  {
    name: "globepayDashboard",
    gate: "GlobePay merchant dashboard",
    plan: "pnpm run globepay:dashboard-plan -- --env-file .env.production",
    proof: [
      "checkedAt: timestamp after dashboard confirmation",
      "japanHostConfirmed: true",
      "oneTimeNotifyUrl / recurringNotifyUrl / returnUrl: exact production URLs",
      "worldPayRecurringEnabled: true",
      "threeDsEnabled: true",
    ],
  },
  {
    name: "productionDeployment",
    gate: "Production deployment",
    plan: "pnpm run deploy:preflight -- --env-file .env.production && pnpm run cf:deploy",
    proof: [
      "provider: cloudflare",
      "workerName: buyna-ai-official",
      "deployedUrl: https://www.buyna.ai/",
      "deployedCommitSha: full current commit SHA",
      "deploymentStatus: success",
      "smokeUrlStatus: passed after pnpm run smoke:url",
    ],
  },
  {
    name: "paymentVerification",
    gate: "Real payment verification",
    plan: "pnpm run payment:verification-plan -- --amount 100 --currency JPY",
    proof: [
      "oneTime.tested: true with resultCode PAY_SUCCESS",
      "oneTime.localStatus: paid only after verified notify/query",
      "oneTime.paidRecordVisibleInAdmin and csvVerified: true",
      "recurring.hosted3dsCompleted: true",
      "recurring.agreementStatus: ACTIVE",
      "recurring.firstChargeResultCode: PAY_SUCCESS",
      "recurring.adminSubscriptionVisible and csvOrAdminTotalsVerified: true",
    ],
  },
];

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return args[index + 1] ?? "";
}

function safeReadJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

console.log("Buyna.ai production evidence collection plan");
console.log("This command is read-only: it does not create, overwrite, or upload evidence files.");
console.log(`Evidence file: ${evidenceFile}`);
console.log(`Exists: ${existsSync(evidencePath) ? "yes" : "no"}`);

if (!existsSync(evidencePath)) {
  console.log("\nStart here:");
  console.log("pnpm run prod-evidence:init");
}

const evidence = existsSync(evidencePath) ? safeReadJson(evidencePath) : {};
const checksByArea = new Map(result.checks.map((check) => [check.area, check]));

console.log("\nEvidence sections:");
for (const section of sections) {
  const check = checksByArea.get(section.gate);
  const status = check?.ok ? "PROVED" : "MISSING";
  console.log(`\n[${status}] ${section.name}`);
  console.log(`Gate: ${section.gate}`);
  console.log(`Plan command: ${section.plan}`);
  if (check && !check.ok) console.log(`Next: ${check.next}`);
  if (!evidence[section.name]) console.log("Current section: missing from evidence file");
  console.log("Proof to record:");
  for (const item of section.proof) console.log(`- ${item}`);
}

if (result.failures.length) {
  console.log("\nFile-level problems:");
  for (const failure of result.failures) console.log(`- ${failure}`);
}

console.log("\nNever record:");
console.log("- API keys, service-role keys, GlobePay credential_code, passwords, or tokens");
console.log("- Raw card data or customer PII");
console.log("- Raw webhook payloads");
console.log("- Unmasked provider/customer identifiers");

console.log("\nFinal proof commands:");
console.log("pnpm run check:prod-evidence");
console.log("pnpm run audit:goal:strict");
