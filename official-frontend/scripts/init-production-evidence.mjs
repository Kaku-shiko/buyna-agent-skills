#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_EVIDENCE_FILE } from "./production-evidence-rules.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(projectRoot, "..");
const args = process.argv.slice(2);

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function runGit(gitArgs) {
  try {
    return execFileSync("git", gitArgs, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function walkFiles(start, predicate = () => true) {
  if (!existsSync(start)) return [];
  const found = [];
  const stack = [start];

  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        stack.push(full);
      } else if (predicate(full)) {
        found.push(full);
      }
    }
  }

  return found;
}

const outputArg = argValue("--output", DEFAULT_EVIDENCE_FILE);
const outputPath = resolve(projectRoot, outputArg);
const force = args.includes("--force");
const print = args.includes("--print");
const currentCommit = runGit(["rev-parse", "HEAD"]);
const branch = runGit(["branch", "--show-current"]) || "codex/official-frontend-source";
const migrationFiles = walkFiles(join(projectRoot, "supabase/migrations"), (path) =>
  path.endsWith(".sql"),
)
  .map((path) => path.split(/[\\/]/).at(-1))
  .sort();

const evidence = {
  evidenceVersion: 1,
  updatedAt: new Date().toISOString(),
  github: {
    remoteUrl: "",
    branch,
    commitSha: currentCommit,
    pushed: false,
    ciStatus: "pending",
    ciRunUrl: "",
  },
  productionEnv: {
    checkedAt: "",
    command: "pnpm run check:prod-env -- --env-file .env.production",
    checkPassed: false,
    publicSiteUrl: "https://www.buyna.ai",
    appUrl: "https://www.buyna.ai",
    globepayMode: "live",
    aiGuideConfigured: false,
    serverOnlySecretNamesConfigured: [
      "SUPABASE_SERVICE_ROLE_KEY",
      "GLOBEPAY_CREDENTIAL_CODE",
      "BILLING_TOKEN_ENCRYPTION_KEY",
    ],
  },
  supabase: {
    stagingMigrationsApplied: false,
    productionMigrationsApplied: false,
    productionCheckedAt: "",
    appliedMigrationFiles: migrationFiles,
    verifiedTables: [],
  },
  globepayDashboard: {
    checkedAt: "",
    japanHostConfirmed: false,
    oneTimeNotifyUrl: "https://www.buyna.ai/api/public/globepay/notify",
    recurringNotifyUrl: "https://www.buyna.ai/api/public/globepay-recurring-notify",
    returnUrl: "https://www.buyna.ai/subscription/return",
    worldPayRecurringEnabled: false,
    threeDsEnabled: false,
  },
  productionDeployment: {
    provider: "cloudflare",
    workerName: "buyna-ai-official",
    deployedUrl: "https://www.buyna.ai/",
    deployedCommitSha: currentCommit,
    deploymentStatus: "pending",
    deployCommand: "pnpm run cf:deploy",
    smokeCommand: "pnpm run smoke:url -- --base-url https://www.buyna.ai/",
    smokeUrlStatus: "pending",
    checkedAt: "",
  },
  paymentVerification: {
    oneTime: {
      tested: false,
      checkedAt: "",
      amount: 0,
      currency: "JPY",
      providerOrderIdRef: "",
      resultCode: "",
      localStatus: "",
      notifyOrQueryVerified: false,
      paidRecordVisibleInAdmin: false,
      csvVerified: false,
    },
    recurring: {
      tested: false,
      checkedAt: "",
      amount: 0,
      currency: "JPY",
      agreementRef: "",
      hosted3dsCompleted: false,
      agreementStatus: "",
      firstChargeResultCode: "",
      recurringNotifyVerified: false,
      adminSubscriptionVisible: false,
      csvOrAdminTotalsVerified: false,
    },
  },
};

const serialized = `${JSON.stringify(evidence, null, 2)}\n`;

if (print) {
  process.stdout.write(serialized);
  process.exit(0);
}

if (existsSync(outputPath) && !force) {
  console.error(`${outputArg} already exists. Re-run with --force to overwrite it.`);
  process.exit(1);
}

writeFileSync(outputPath, serialized, "utf8");
console.log(`Initialized ${outputArg}`);
console.log(
  "Fill it only with non-secret production proof, then run pnpm run check:prod-evidence.",
);
