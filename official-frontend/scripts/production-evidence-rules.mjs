import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export const DEFAULT_EVIDENCE_FILE = ".production-evidence.json";

const productionOrigin = "https://www.buyna.ai";
const requiredTables = [
  "ai_guide_sources",
  "ai_guide_conversations",
  "subscription_plans",
  "buyna_customers",
  "buyna_subscriptions",
  "buyna_subscription_charges",
  "globepay_recurring_agreements",
];

const requiredSecretNames = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "GLOBEPAY_CREDENTIAL_CODE",
  "BILLING_TOKEN_ENCRYPTION_KEY",
];

const serverOnlyNameValues = new Set([
  "SUPABASE_SERVICE_ROLE_KEY",
  "GLOBEPAY_CREDENTIAL_CODE",
  "BILLING_TOKEN_ENCRYPTION_KEY",
  "LOVABLE_API_KEY",
  "OPENAI_API_KEY",
  "PLATFORM_SUBSCRIPTION_API_KEY",
]);

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

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function runGit(repoRoot, args) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function isProductionUrl(value) {
  if (!isHttpsUrl(value)) return false;
  const url = new URL(value);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1") {
    return false;
  }
  if (url.hostname.endsWith(".lovableproject.com") || url.hostname.endsWith(".lovable.app")) {
    return false;
  }
  return true;
}

function isIsoDate(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

function isFullCommitSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function hasAll(values, required) {
  const set = new Set(Array.isArray(values) ? values : []);
  return required.every((value) => set.has(value));
}

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function collectSecretValueFailures(value, path = []) {
  const failures = [];
  if (!value || typeof value !== "object") return failures;

  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    const keyLooksSensitive =
      /(secret|credential|password|token|apikey|api_key|service_role)/i.test(key);

    if (typeof child === "string") {
      const trimmed = child.trim();
      if (keyLooksSensitive && trimmed && !serverOnlyNameValues.has(trimmed)) {
        failures.push(`${childPath.join(".")} must not contain a secret value`);
      }
      if (/^(sk-|sk-proj-|ghp_|glpat-)/.test(trimmed)) {
        failures.push(`${childPath.join(".")} looks like a raw secret`);
      }
    } else if (Array.isArray(child)) {
      for (const [index, item] of child.entries()) {
        if (typeof item === "string") {
          const trimmed = item.trim();
          if (keyLooksSensitive && trimmed && !serverOnlyNameValues.has(trimmed)) {
            failures.push(`${childPath.join(".")}[${index}] must not contain a secret value`);
          }
          if (/^(sk-|sk-proj-|ghp_|glpat-)/.test(trimmed)) {
            failures.push(`${childPath.join(".")}[${index}] looks like a raw secret`);
          }
        } else {
          failures.push(...collectSecretValueFailures(item, [...childPath, String(index)]));
        }
      }
    } else {
      failures.push(...collectSecretValueFailures(child, childPath));
    }
  }

  return failures;
}

function addCheck(checks, area, ok, evidence, next) {
  checks.push({
    area,
    ok,
    evidence,
    next: ok ? "" : next,
  });
}

export function validateProductionEvidence({
  projectRoot,
  repoRoot = resolve(projectRoot, ".."),
  evidenceFile = DEFAULT_EVIDENCE_FILE,
} = {}) {
  const evidencePath = resolve(projectRoot, evidenceFile);
  const checks = [];
  const failures = [];

  if (!existsSync(evidencePath)) {
    return {
      exists: false,
      ok: false,
      evidenceFile,
      evidencePath,
      checks,
      failures: [`evidence file not found: ${evidenceFile}`],
    };
  }

  let evidence = {};
  try {
    evidence = readJson(evidencePath);
  } catch (error) {
    return {
      exists: true,
      ok: false,
      evidenceFile,
      evidencePath,
      checks,
      failures: [`${evidenceFile} is not valid JSON: ${error.message}`],
    };
  }

  failures.push(...collectSecretValueFailures(evidence));

  const currentCommit = runGit(repoRoot, ["rev-parse", "HEAD"]);
  const migrationFiles = walkFiles(join(projectRoot, "supabase/migrations"), (path) =>
    path.endsWith(".sql"),
  )
    .map((path) => basename(path))
    .sort();

  const github = evidence.github ?? {};
  addCheck(
    checks,
    "GitHub source of truth",
    isHttpsUrl(github.remoteUrl) &&
      /github\.com/i.test(github.remoteUrl) &&
      github.pushed === true &&
      github.ciStatus === "success" &&
      isHttpsUrl(github.ciRunUrl) &&
      isFullCommitSha(github.commitSha) &&
      github.commitSha === currentCommit,
    "GitHub remote, pushed commit, and successful CI are recorded",
    "Push the current commit to GitHub, wait for CI success, then record remoteUrl, full commitSha, and ciRunUrl.",
  );

  const productionEnv = evidence.productionEnv ?? {};
  addCheck(
    checks,
    "Production env",
    productionEnv.checkPassed === true &&
      isIsoDate(productionEnv.checkedAt) &&
      safeString(productionEnv.command).includes("check:prod-env") &&
      productionEnv.publicSiteUrl === productionOrigin &&
      productionEnv.appUrl === productionOrigin &&
      productionEnv.globepayMode === "live" &&
      productionEnv.aiGuideConfigured === true &&
      hasAll(productionEnv.serverOnlySecretNamesConfigured, requiredSecretNames) &&
      (productionEnv.serverOnlySecretNamesConfigured ?? []).some((name) =>
        ["LOVABLE_API_KEY", "OPENAI_API_KEY"].includes(name),
      ),
    "Production environment preflight passed with live GlobePay and server-only AI/payment secrets",
    "Run pnpm run check:prod-env -- --env-file .env.production and record only secret names, not values.",
  );

  const supabase = evidence.supabase ?? {};
  addCheck(
    checks,
    "Supabase production migration",
    supabase.stagingMigrationsApplied === true &&
      supabase.productionMigrationsApplied === true &&
      isIsoDate(supabase.productionCheckedAt) &&
      hasAll(supabase.appliedMigrationFiles, migrationFiles) &&
      hasAll(supabase.verifiedTables, requiredTables),
    "Staging and production Supabase migrations plus required tables are recorded",
    "Apply every supabase/migrations SQL file to staging and production, then record applied files and verified tables.",
  );

  const globepayDashboard = evidence.globepayDashboard ?? {};
  addCheck(
    checks,
    "GlobePay merchant dashboard",
    isIsoDate(globepayDashboard.checkedAt) &&
      globepayDashboard.japanHostConfirmed === true &&
      globepayDashboard.oneTimeNotifyUrl === `${productionOrigin}/api/public/globepay/notify` &&
      globepayDashboard.recurringNotifyUrl ===
        `${productionOrigin}/api/public/globepay-recurring-notify` &&
      globepayDashboard.returnUrl === `${productionOrigin}/subscription/return` &&
      globepayDashboard.worldPayRecurringEnabled === true &&
      globepayDashboard.threeDsEnabled === true,
    "GlobePay dashboard callback URLs, WorldPay Recurring, and 3DS enablement are recorded",
    "Configure exact production callback URLs in GlobePay and confirm WorldPay Recurring plus 3DS for the partner code.",
  );

  const deployment = evidence.productionDeployment ?? {};
  addCheck(
    checks,
    "Production deployment",
    deployment.provider === "cloudflare" &&
      deployment.workerName === "buyna-ai-official" &&
      isProductionUrl(deployment.deployedUrl) &&
      originOf(deployment.deployedUrl) === productionOrigin &&
      deployment.deploymentStatus === "success" &&
      safeString(deployment.deployCommand).includes("cf:deploy") &&
      deployment.deployedCommitSha === currentCommit &&
      deployment.smokeUrlStatus === "passed" &&
      safeString(deployment.smokeCommand).includes("smoke:url") &&
      isIsoDate(deployment.checkedAt),
    "Cloudflare production deployment and deployed URL smoke check are recorded",
    "Deploy the current GitHub commit to Cloudflare and run pnpm run smoke:url -- --base-url https://www.buyna.ai/.",
  );

  const oneTime = evidence.paymentVerification?.oneTime ?? {};
  const recurring = evidence.paymentVerification?.recurring ?? {};
  addCheck(
    checks,
    "Real payment verification",
    oneTime.tested === true &&
      isIsoDate(oneTime.checkedAt) &&
      ["JPY", "CNY"].includes(oneTime.currency) &&
      Number(oneTime.amount) > 0 &&
      oneTime.resultCode === "PAY_SUCCESS" &&
      oneTime.localStatus === "paid" &&
      oneTime.notifyOrQueryVerified === true &&
      oneTime.paidRecordVisibleInAdmin === true &&
      oneTime.csvVerified === true &&
      recurring.tested === true &&
      isIsoDate(recurring.checkedAt) &&
      recurring.hosted3dsCompleted === true &&
      recurring.agreementStatus === "ACTIVE" &&
      recurring.firstChargeResultCode === "PAY_SUCCESS" &&
      recurring.recurringNotifyVerified === true &&
      recurring.adminSubscriptionVisible === true &&
      recurring.csvOrAdminTotalsVerified === true,
    "Small one-time payment and recurring subscription verification are recorded",
    "Run a small one-time payment and a hosted-3DS recurring subscription; verify PAY_SUCCESS, ACTIVE, admin records, and CSV/totals.",
  );

  return {
    exists: true,
    ok: failures.length === 0 && checks.every((check) => check.ok),
    evidenceFile,
    evidencePath,
    checks,
    failures,
  };
}
