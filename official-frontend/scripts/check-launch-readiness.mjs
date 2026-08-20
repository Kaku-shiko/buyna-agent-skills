#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(projectRoot, "..");
const failures = [];
const warnings = [];

function rel(path) {
  return relative(projectRoot, path).replaceAll("\\", "/");
}

function hasFile(path) {
  return existsSync(join(projectRoot, path));
}

function read(path) {
  return readFileSync(join(projectRoot, path), "utf8");
}

function readMaybe(path) {
  const full = join(projectRoot, path);
  return existsSync(full) ? readFileSync(full, "utf8") : "";
}

function readJson(path) {
  try {
    return JSON.parse(read(path));
  } catch (error) {
    failures.push(`${path} is not valid JSON: ${error.message}`);
    return {};
  }
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function warn(condition, message) {
  if (!condition) warnings.push(message);
}

function parseVersion(version) {
  const [major = 0, minor = 0, patch = 0] = version
    .replace(/^v/, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  return { major, minor, patch };
}

function atLeast(version, min) {
  const a = parseVersion(version);
  const b = parseVersion(min);
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  return a.patch >= b.patch;
}

function parseEnvFile(path) {
  const values = new Map();
  for (const line of read(path).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    values.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  return values;
}

const requiredEnvKeys = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PUBLIC_SITE_URL",
  "APP_URL",
  "LOVABLE_API_KEY",
  "OPENAI_API_KEY",
  "GLOBEPAY_MODE",
  "GLOBEPAY_API_BASE_URL",
  "GLOBEPAY_BASE_URL",
  "GLOBEPAY_PARTNER_CODE",
  "GLOBEPAY_CREDENTIAL_CODE",
  "GLOBEPAY_NOTIFY_URL",
  "GLOBEPAY_RECURRING_NOTIFY_URL",
  "GLOBEPAY_RETURN_URL",
  "BILLING_TOKEN_ENCRYPTION_KEY",
  "PLATFORM_ACCOUNT_URL",
  "PLATFORM_SUBSCRIPTION_API_URL",
  "PLATFORM_SUBSCRIPTION_API_KEY",
];

function checkCommonEnvShape(env, label) {
  for (const key of requiredEnvKeys) {
    check(env.has(key), `${label} must include ${key}`);
  }
  check(
    env.get("GLOBEPAY_API_BASE_URL") === "https://pay.globepay.co.jp",
    `${label} GLOBEPAY_API_BASE_URL must be the Japan host`,
  );
  check(
    env.get("GLOBEPAY_BASE_URL") === "https://pay.globepay.co.jp/api/v1.0",
    `${label} GLOBEPAY_BASE_URL must include exactly one /api/v1.0`,
  );
  check(
    env.get("GLOBEPAY_NOTIFY_URL") === "https://www.buyna.ai/api/public/globepay/notify",
    `${label} GLOBEPAY_NOTIFY_URL must use the production one-time notify path`,
  );
  check(
    env.get("GLOBEPAY_RECURRING_NOTIFY_URL") ===
      "https://www.buyna.ai/api/public/globepay-recurring-notify",
    `${label} GLOBEPAY_RECURRING_NOTIFY_URL must use the recurring notify path`,
  );
  check(
    env.get("GLOBEPAY_RETURN_URL") === "https://www.buyna.ai/subscription/return",
    `${label} GLOBEPAY_RETURN_URL must use the production subscription return path`,
  );
  check(
    !env.has("VITE_GLOBEPAY_CREDENTIAL_CODE") &&
      !env.has("VITE_OPENAI_API_KEY") &&
      !env.has("VITE_LOVABLE_API_KEY") &&
      !env.has("VITE_PLATFORM_SUBSCRIPTION_API_KEY"),
    `${label} must not expose server-only secrets through VITE_* names`,
  );
}

function walkFiles(start, predicate = () => true) {
  const root = join(projectRoot, start);
  if (!existsSync(root)) return [];
  const found = [];
  const stack = [root];
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

function combinedMigrationText() {
  return walkFiles("supabase/migrations", (path) => path.endsWith(".sql"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

function checkNoMojibake(path) {
  const text = read(path);
  const mojibakeFragments = [
    "浣犲ソ",
    "缃戠粶",
    "閿欒",
    "鎯充",
    "姝ｅ湪",
    "鏌ョ湅",
    "鏌ヨ",
    "璁㈤",
    "缂哄",
    "鎺堟",
    "杩斿",
    "閲嶆",
    "鏀粯",
    "濂楅",
    "寮€",
    "鍔犺",
    "鈫",
    "璐墿",
    "瀵艰喘",
    "鈥",
    "楼",
  ];
  for (const fragment of mojibakeFragments) {
    check(!text.includes(fragment), `${path} must not contain mojibake fragment: ${fragment}`);
  }
}

console.log("Buyna.ai launch readiness check");

const pkg = readJson("package.json");

// Runtime and package manager
check(atLeast(process.versions.node, "22.13.0"), "Current Node.js runtime must be >= 22.13.0");
check(read(".node-version").trim() === "22.13.0", ".node-version must pin Node 22.13.0");
check(pkg.packageManager === "pnpm@11.7.0", "packageManager must be pnpm@11.7.0");
check(
  pkg.devEngines?.runtime?.name === "node",
  "package.json devEngines.runtime must declare Node.js",
);
check(
  pkg.devEngines?.runtime?.version === "22.13.0",
  "package.json devEngines.runtime must pin Node 22.13.0",
);
check(
  pkg.devEngines?.runtime?.onFail === "download",
  "package.json devEngines.runtime must download the pinned runtime when missing",
);
check(
  (pkg.engines?.node ?? "").includes(">=22.13"),
  "package.json engines.node must require >=22.13",
);
check(hasFile("pnpm-lock.yaml"), "pnpm-lock.yaml must exist");
check(!hasFile("package-lock.json"), "package-lock.json must not exist");
check(!hasFile("bun.lock"), "bun.lock must not exist");

// Scripts and CI
for (const script of [
  "verify",
  "check:content",
  "check:prod-env",
  "check:github-source",
  "github:source-plan",
  "check:cloudflare-account",
  "cloudflare:env-plan",
  "supabase:migration-plan",
  "globepay:dashboard-plan",
  "payment:verification-plan",
  "production:readiness-plan",
  "prod-evidence:plan",
  "prod-evidence:todo",
  "handoff:summary",
  "prod-evidence:init",
  "check:prod-evidence",
  "check:launch",
  "audit:goal",
  "audit:goal:strict",
  "package:check",
  "package:update",
  "resume:after-access",
  "resume:status",
  "resume:watch",
  "resume:deploy-after-access",
  "resume:watch:background:windows",
  "resume:deploy-after-access:background:windows",
  "preview:local",
  "preview:local:status",
  "preview:local:stop",
  "smoke:local",
  "smoke:url",
  "deploy:preflight",
  "cf:clean",
  "cf:prepare",
  "cf:check",
  "cf:deploy:dry-run",
  "cf:deploy",
]) {
  check(Boolean(pkg.scripts?.[script]), `package.json must define ${script}`);
}
const buildRunsCloudflarePrepare = pkg.scripts?.build?.includes("pnpm run cf:prepare");
for (const script of ["cf:check", "cf:preview", "cf:deploy:dry-run", "cf:deploy"]) {
  check(
    buildRunsCloudflarePrepare || pkg.scripts?.[script]?.includes("pnpm run cf:prepare"),
    `${script} must prepare the generated Cloudflare config before running Wrangler, either through build or directly`,
  );
  check(
    pkg.scripts?.[script]?.includes("pnpm run cf:clean"),
    `${script} must clean stale Wrangler deploy state before running Wrangler`,
  );
}
check(
  pkg.scripts?.["cf:deploy"]?.includes("--keep-vars"),
  "cf:deploy must keep dashboard-managed Cloudflare variables",
);
check(
  pkg.scripts?.["cf:check"]?.includes("deploy --dry-run"),
  "cf:check must validate Worker output with wrangler deploy --dry-run",
);
check(
  pkg.scripts?.["cf:deploy:dry-run"]?.includes("deploy --dry-run"),
  "cf:deploy:dry-run must run wrangler deploy --dry-run",
);

const workflow = existsSync(join(repoRoot, ".github/workflows/official-frontend-ci.yml"))
  ? readFileSync(join(repoRoot, ".github/workflows/official-frontend-ci.yml"), "utf8")
  : "";
const pullRequestTemplate = existsSync(join(repoRoot, ".github/pull_request_template.md"))
  ? readFileSync(join(repoRoot, ".github/pull_request_template.md"), "utf8")
  : "";
check(Boolean(workflow), "GitHub workflow .github/workflows/official-frontend-ci.yml must exist");
check(
  workflow.includes("node-version-file: official-frontend/.node-version"),
  "CI must use .node-version",
);
check(
  workflow.includes("pnpm install --frozen-lockfile"),
  "CI must install with frozen pnpm lockfile",
);
check(workflow.includes("pnpm run verify"), "CI must run pnpm run verify");
check(workflow.includes("pnpm run cf:check"), "CI must run pnpm run cf:check");
check(workflow.includes("pnpm run check:launch"), "CI must run pnpm run check:launch");
check(workflow.includes("pnpm run package:update"), "CI must run pnpm run package:update");
check(workflow.includes("pnpm run package:check"), "CI must run pnpm run package:check");
check(workflow.includes("pnpm run smoke:local"), "CI must run pnpm run smoke:local");
check(Boolean(pullRequestTemplate), ".github/pull_request_template.md must exist");
for (const requiredPrText of [
  "official-frontend/src/content/official-site.ts",
  "pnpm run check:launch",
  "pnpm run cf:check",
  "pnpm run resume:after-access",
  "pnpm run resume:status",
  ".production-evidence.json",
  "resume:deploy-after-access",
  "only the explicit deploy-after-access scripts may run it",
]) {
  check(pullRequestTemplate.includes(requiredPrText), `PR template must include ${requiredPrText}`);
}

const smokeScript = readMaybe("scripts/smoke-official-site.mjs");
const contentCheckScript = readMaybe("scripts/check-official-content.mjs");
const localPreviewScript = readMaybe("scripts/local-preview.mjs");
check(Boolean(contentCheckScript), "scripts/check-official-content.mjs must exist");
check(
  contentCheckScript.includes("officialSiteContentByLanguage") &&
    contentCheckScript.includes("officialLanguageOptions") &&
    contentCheckScript.includes('zh", "ja", "en') &&
    contentCheckScript.includes("compareShape") &&
    contentCheckScript.includes("subscriptionPlanFeatures") &&
    contentCheckScript.includes("mojibake"),
  "content check must validate three language structures, language options, plan features, and mojibake",
);
check(Boolean(localPreviewScript), "scripts/local-preview.mjs must exist");
check(
  localPreviewScript.includes("--strictPort") &&
    localPreviewScript.includes(".local-preview.out.log") &&
    localPreviewScript.includes(".local-preview.err.log") &&
    localPreviewScript.includes("previewProcesses") &&
    localPreviewScript.includes("waitForUrl"),
  "local preview script must start a fixed-port preview, write local logs, report status, and stop stale preview processes",
);
check(Boolean(smokeScript), "scripts/smoke-official-site.mjs must exist");
check(
  smokeScript.includes("AI guide must gracefully report configured=false") &&
    smokeScript.includes("/payment/success") &&
    smokeScript.includes("/subscription/return") &&
    smokeScript.includes("--ai-mode") &&
    smokeScript.includes("optional"),
  "smoke script must cover AI fallback, deployed URL AI mode, and payment/subscription return pages",
);

const githubSourcePlanScript = readMaybe("scripts/print-github-source-plan.mjs");
check(Boolean(githubSourcePlanScript), "scripts/print-github-source-plan.mjs must exist");
check(
  githubSourcePlanScript.includes("This command is read-only") &&
    githubSourcePlanScript.includes("git push -u origin") &&
    githubSourcePlanScript.includes("gh pr create --draft") &&
    githubSourcePlanScript.includes("check:github-source"),
  "GitHub source plan script must print read-only source-of-truth setup steps",
);

const supabaseMigrationPlanScript = readMaybe("scripts/print-supabase-migration-plan.mjs");
check(Boolean(supabaseMigrationPlanScript), "scripts/print-supabase-migration-plan.mjs must exist");
check(
  supabaseMigrationPlanScript.includes("This command is read-only") &&
    supabaseMigrationPlanScript.includes("ai_guide_sources") &&
    supabaseMigrationPlanScript.includes("globepay_recurring_agreements") &&
    supabaseMigrationPlanScript.includes("information_schema.tables") &&
    supabaseMigrationPlanScript.includes(".production-evidence.json"),
  "Supabase migration plan script must print read-only migration, table verification, and evidence steps",
);

const globepayDashboardPlanScript = readMaybe("scripts/print-globepay-dashboard-plan.mjs");
check(Boolean(globepayDashboardPlanScript), "scripts/print-globepay-dashboard-plan.mjs must exist");
check(
  globepayDashboardPlanScript.includes("This command is read-only") &&
    globepayDashboardPlanScript.includes("https://pay.globepay.co.jp/api/v1.0") &&
    globepayDashboardPlanScript.includes("https://www.buyna.ai/api/public/globepay/notify") &&
    globepayDashboardPlanScript.includes(
      "https://www.buyna.ai/api/public/globepay-recurring-notify",
    ) &&
    globepayDashboardPlanScript.includes("WorldPay Recurring") &&
    globepayDashboardPlanScript.includes("Hosted 3DS") &&
    globepayDashboardPlanScript.includes("PAY_SUCCESS") &&
    globepayDashboardPlanScript.includes("ACTIVE"),
  "GlobePay dashboard plan script must print read-only host, callback, recurring, 3DS, and success-state checks",
);

const paymentVerificationPlanScript = readMaybe("scripts/print-payment-verification-plan.mjs");
check(
  Boolean(paymentVerificationPlanScript),
  "scripts/print-payment-verification-plan.mjs must exist",
);
check(
  paymentVerificationPlanScript.includes("This command is read-only") &&
    paymentVerificationPlanScript.includes("PAY_SUCCESS") &&
    paymentVerificationPlanScript.includes("ACTIVE") &&
    paymentVerificationPlanScript.includes("notify/query") &&
    paymentVerificationPlanScript.includes("paidRecordVisibleInAdmin") &&
    paymentVerificationPlanScript.includes("csvOrAdminTotalsVerified") &&
    paymentVerificationPlanScript.includes("Raw card data") &&
    paymentVerificationPlanScript.includes("credential_code"),
  "Payment verification plan script must print read-only one-time and recurring proof steps without sensitive evidence",
);

const productionReadinessPlanScript = readMaybe("scripts/print-production-readiness-plan.mjs");
check(
  Boolean(productionReadinessPlanScript),
  "scripts/print-production-readiness-plan.mjs must exist",
);
check(
  productionReadinessPlanScript.includes("This command is non-deploying") &&
    productionReadinessPlanScript.includes("github:source-plan") &&
    productionReadinessPlanScript.includes("cloudflare:env-plan") &&
    productionReadinessPlanScript.includes("supabase:migration-plan") &&
    productionReadinessPlanScript.includes("globepay:dashboard-plan") &&
    productionReadinessPlanScript.includes("payment:verification-plan") &&
    productionReadinessPlanScript.includes("audit:goal:strict"),
  "Production readiness plan must sequence every read-only external launch plan and final strict audit gate",
);

const productionEvidencePlanScript = readMaybe("scripts/print-production-evidence-plan.mjs");
const productionEvidenceTodoScript = readMaybe("scripts/print-production-evidence-todo.mjs");
check(
  Boolean(productionEvidencePlanScript),
  "scripts/print-production-evidence-plan.mjs must exist",
);
check(
  Boolean(productionEvidenceTodoScript),
  "scripts/print-production-evidence-todo.mjs must exist",
);
check(
  productionEvidencePlanScript.includes("This command is read-only") &&
    productionEvidencePlanScript.includes("github") &&
    productionEvidencePlanScript.includes("productionEnv") &&
    productionEvidencePlanScript.includes("supabase") &&
    productionEvidencePlanScript.includes("globepayDashboard") &&
    productionEvidencePlanScript.includes("productionDeployment") &&
    productionEvidencePlanScript.includes("paymentVerification") &&
    productionEvidencePlanScript.includes("Never record") &&
    productionEvidencePlanScript.includes("credential_code") &&
    productionEvidencePlanScript.includes("Raw webhook payloads"),
  "Production evidence plan must cover every evidence section and forbid sensitive data",
);
check(
  productionEvidenceTodoScript.includes("This command is read-only") &&
    productionEvidenceTodoScript.includes("Summary:") &&
    productionEvidenceTodoScript.includes("Safe evidence to record") &&
    productionEvidenceTodoScript.includes("Never record") &&
    productionEvidenceTodoScript.includes("check:prod-evidence") &&
    productionEvidenceTodoScript.includes("audit:goal:strict"),
  "Production evidence todo must summarize missing evidence, safe fields, and final strict gate",
);

const handoffSummaryScript = readMaybe("scripts/print-handoff-summary.mjs");
check(Boolean(handoffSummaryScript), "scripts/print-handoff-summary.mjs must exist");
check(
  handoffSummaryScript.includes("Buyna.ai Official Frontend Handoff") &&
    handoffSummaryScript.includes("Latest Update Package") &&
    handoffSummaryScript.includes("Read-Only Launch Plans") &&
    handoffSummaryScript.includes("Remaining External Gates") &&
    handoffSummaryScript.includes("Never Commit Or Share") &&
    handoffSummaryScript.includes("audit:goal:strict"),
  "Handoff summary must include package, verification, external gates, safety, and final strict audit sections",
);

const cloudflarePrepareScript = readMaybe("scripts/prepare-cloudflare-config.mjs");
const cloudflareEnvPlanScript = readMaybe("scripts/print-cloudflare-env-plan.mjs");
check(Boolean(cloudflarePrepareScript), "scripts/prepare-cloudflare-config.mjs must exist");
check(Boolean(cloudflareEnvPlanScript), "scripts/print-cloudflare-env-plan.mjs must exist");
for (const secret of [
  "SUPABASE_SERVICE_ROLE_KEY",
  "GLOBEPAY_CREDENTIAL_CODE",
  "BILLING_TOKEN_ENCRYPTION_KEY",
]) {
  check(
    cloudflarePrepareScript.includes(secret),
    `Cloudflare config prepare script must require ${secret}`,
  );
}
check(
  cloudflarePrepareScript.includes("keep_vars") &&
    cloudflarePrepareScript.includes("observability"),
  "Cloudflare config prepare script must preserve dashboard vars and enable observability",
);
check(
  cloudflareEnvPlanScript.includes("secret put") &&
    cloudflareEnvPlanScript.includes("This command never prints secret or variable values") &&
    cloudflareEnvPlanScript.includes("GLOBEPAY_NOTIFY_URL") &&
    cloudflareEnvPlanScript.includes("GLOBEPAY_RECURRING_NOTIFY_URL"),
  "Cloudflare environment plan script must print redacted setup steps for required secrets and callback variables",
);

const packageUpdateScript = readMaybe("scripts/package-update.mjs");
const packageCheckScript = readMaybe("scripts/check-update-package.mjs");
check(Boolean(packageUpdateScript), "scripts/package-update.mjs must exist");
check(Boolean(packageCheckScript), "scripts/check-update-package.mjs must exist");
for (const excludedName of [
  "node_modules",
  ".output",
  ".wrangler",
  ".env",
  ".env.production",
  ".production-evidence.json",
  ".resume-after-access-status.json",
  ".resume-after-access-watch.log",
  ".local-preview.out.log",
  ".local-preview.err.log",
]) {
  check(
    packageUpdateScript.includes(excludedName),
    `update package script must exclude ${excludedName}`,
  );
}
check(
  packageUpdateScript.includes("UPDATE_PACKAGE_MANIFEST.json"),
  "update package script must include a package manifest",
);
check(
  packageUpdateScript.includes("packageSchemaVersion") &&
    packageUpdateScript.includes("verificationCommands") &&
    packageUpdateScript.includes("externalGateCommands") &&
    packageUpdateScript.includes("pnpm run check:content") &&
    packageUpdateScript.includes("pnpm run audit:goal:strict"),
  "update package manifest must include schema version, local verification commands, and external gate commands",
);
check(
  packageUpdateScript.includes("repoGithub") &&
    packageUpdateScript.includes("includedRoots") &&
    packageUpdateScript.includes(".github"),
  "update package script must include root .github CI and PR template files",
);
check(
  packageCheckScript.includes("UPDATE_PACKAGE_MANIFEST.json") &&
    packageCheckScript.includes(".github/pull_request_template.md") &&
    packageCheckScript.includes("official-frontend/package.json") &&
    packageCheckScript.includes("official-frontend/scripts/print-production-evidence-todo.mjs") &&
    packageCheckScript.includes("packageSchemaVersion") &&
    packageCheckScript.includes("verificationCommands") &&
    packageCheckScript.includes("externalGateCommands") &&
    packageCheckScript.includes("sourceCommit must be a full 40-character commit SHA") &&
    packageCheckScript.includes(".production-evidence.json") &&
    packageCheckScript.includes("node_modules"),
  "update package check script must validate structure and sensitive exclusions",
);

const resumeAfterAccessScript = readMaybe("scripts/resume-after-access.mjs");
const showResumeStatusScript = readMaybe("scripts/show-resume-status.mjs");
const startResumeWatchScript = readMaybe("scripts/start-resume-watch.ps1");
check(Boolean(resumeAfterAccessScript), "scripts/resume-after-access.mjs must exist");
check(Boolean(showResumeStatusScript), "scripts/show-resume-status.mjs must exist");
check(Boolean(startResumeWatchScript), "scripts/start-resume-watch.ps1 must exist");
check(
  resumeAfterAccessScript.includes("check:github-source") &&
    resumeAfterAccessScript.includes("check:cloudflare-account") &&
    resumeAfterAccessScript.includes("check:prod-env") &&
    resumeAfterAccessScript.includes("deploy:preflight") &&
    resumeAfterAccessScript.includes("check:prod-evidence") &&
    resumeAfterAccessScript.includes("audit:goal") &&
    resumeAfterAccessScript.includes("--watch") &&
    resumeAfterAccessScript.includes("--deploy-when-ready") &&
    resumeAfterAccessScript.includes("cf:deploy") &&
    resumeAfterAccessScript.includes("smoke:url") &&
    resumeAfterAccessScript.includes(".resume-after-access-status.json") &&
    resumeAfterAccessScript.includes("does not run pnpm run cf:deploy"),
  "resume-after-access script must run non-deploying external readiness checks by default and support explicit deploy-when-ready mode",
);
check(
  startResumeWatchScript.includes("Start-Process") &&
    startResumeWatchScript.includes("resume:watch") &&
    startResumeWatchScript.includes("DeployWhenReady") &&
    startResumeWatchScript.includes("--deploy-when-ready") &&
    startResumeWatchScript.includes(".resume-after-access-status.json") &&
    startResumeWatchScript.includes(".resume-after-access-watch.log"),
  "Windows background resume watcher must start resume:watch, support explicit deploy mode, and write local status/log files",
);

// Environment checklist shape
const env = parseEnvFile(".env.example");
const productionEnvTemplate = parseEnvFile(".env.production.example");
check(hasFile(".env.production.example"), ".env.production.example must exist");
checkCommonEnvShape(env, ".env.example");
checkCommonEnvShape(productionEnvTemplate, ".env.production.example");
check(
  productionEnvTemplate.get("GLOBEPAY_MODE") === "live",
  ".env.production.example must set GLOBEPAY_MODE=live",
);
check(
  productionEnvTemplate.get("PUBLIC_SITE_URL") === "https://www.buyna.ai",
  ".env.production.example must use the production PUBLIC_SITE_URL",
);
check(
  productionEnvTemplate.get("APP_URL") === "https://www.buyna.ai",
  ".env.production.example must use the production APP_URL",
);

const productionEnvCheck = read("scripts/check-production-env.mjs");
const deployPreflightScript = read("scripts/deploy-preflight.mjs");
check(
  deployPreflightScript.includes("prod-evidence:todo") &&
    deployPreflightScript.includes("audit:goal") &&
    deployPreflightScript.includes("verify") &&
    deployPreflightScript.includes("cf:check") &&
    deployPreflightScript.includes("smoke:local"),
  "deploy preflight must run verification, Cloudflare dry-run, smoke, evidence todo, and goal audit report",
);
for (const requiredGuard of [
  "assertServerOnlySecretNotPublic",
  "serverOnlySecrets",
  "must not use localhost for production",
  "must not point to a Lovable preview domain in production",
  "must not include query strings or hash fragments",
  "must not start with =",
  "SUPABASE_SERVICE_ROLE_KEY must not equal SUPABASE_PUBLISHABLE_KEY",
  "Cloudflare secrets to set",
  "GlobePay dashboard callback URLs",
]) {
  check(
    productionEnvCheck.includes(requiredGuard),
    `production env preflight must guard: ${requiredGuard}`,
  );
}

const rootGitignore = existsSync(join(repoRoot, ".gitignore"))
  ? readFileSync(join(repoRoot, ".gitignore"), "utf8")
  : "";
const localGitignore = readMaybe(".gitignore");
check(
  /(^|\n)(\*\*\/)?\.env(\r?\n|$)/.test(`${rootGitignore}\n${localGitignore}`),
  ".env must be ignored by git",
);

// Official site content source
const content = read("src/content/official-site.ts");
check(content.includes("officialSiteMeta"), "official content config must expose officialSiteMeta");
check(content.includes("officialNavLinks"), "official content config must expose officialNavLinks");
check(
  content.includes("homepageSubscriptionPlans"),
  "official content config must expose homepageSubscriptionPlans",
);
for (const exportName of [
  "homeEcosystemSection",
  "homeMerchantSection",
  "homePricingSection",
  "homeAiGuideSection",
  "homeWhyChooseSection",
  "pricingPageContent",
]) {
  check(content.includes(exportName), `official content config must expose ${exportName}`);
}
check(
  content.includes("subscriptionPlanFeatures"),
  "official content config must expose subscriptionPlanFeatures",
);
check(
  read("src/routes/index.tsx").includes("@/content/official-site"),
  "home route must read official content config",
);
check(
  read("src/routes/pricing.tsx").includes("@/content/official-site"),
  "pricing route must read official content config",
);
check(
  read("src/routes/index.tsx").includes("homeEcosystemSection") &&
    read("src/routes/index.tsx").includes("homeAiGuideSection"),
  "home route must render staged official content sections from config",
);
check(
  read("src/routes/pricing.tsx").includes("pricingPageContent"),
  "pricing route must render page copy from official content config",
);
check(
  read("src/components/AppNav.tsx").includes("officialNavLinks"),
  "AppNav must read shared nav links",
);

// AI shopping guide
const aiRoute = read("src/routes/api/ai-shopping-guide.ts");
check(
  aiRoute.includes("process.env.LOVABLE_API_KEY"),
  "AI route must read LOVABLE_API_KEY server-side",
);
check(
  aiRoute.includes("process.env.OPENAI_API_KEY"),
  "AI route must read OPENAI_API_KEY server-side",
);
check(aiRoute.includes("configured: false"), "AI route must return a not-configured state");
check(aiRoute.includes('.from("ai_guide_sources")'), "AI route must read ai_guide_sources");
check(
  aiRoute.includes('.from("ai_guide_conversations")'),
  "AI route must log ai_guide_conversations",
);
check(
  read("src/components/AIShoppingGuideInline.tsx").includes("/api/ai-shopping-guide"),
  "inline AI guide component must call /api/ai-shopping-guide",
);
check(
  read("src/components/AIShoppingGuide.tsx").includes("/api/ai-shopping-guide"),
  "floating AI guide component must call /api/ai-shopping-guide",
);
for (const path of [
  "src/routes/api/ai-shopping-guide.ts",
  "src/components/AIShoppingGuideInline.tsx",
  "src/components/AIShoppingGuide.tsx",
  "src/routes/subscription.return.tsx",
  "src/routes/payment.success.tsx",
  "src/routes/subscribe.$plan.tsx",
]) {
  checkNoMojibake(path);
}

const migrations = combinedMigrationText();
for (const table of [
  "ai_guide_sources",
  "ai_guide_conversations",
  "subscription_plans",
  "buyna_customers",
  "buyna_subscriptions",
  "buyna_subscription_charges",
  "globepay_recurring_agreements",
]) {
  check(migrations.includes(table), `Supabase migrations must include ${table}`);
}

// GlobePay and subscription safety
const oneTimeNotify = read("src/routes/api/public/globepay.notify.ts");
check(
  oneTimeNotify.includes("verifyNotifySignature"),
  "one-time notify route must verify GlobePay signature",
);
check(oneTimeNotify.includes("PAY_SUCCESS"), "one-time notify route must require PAY_SUCCESS");
check(
  oneTimeNotify.includes("markAttemptPaid"),
  "one-time notify route must mark paid through server logic",
);

const recurringNotify = read("src/routes/api/public/globepay-recurring-notify.ts");
check(
  recurringNotify.includes("verifyRecurringNotify"),
  "recurring notify route must verify GlobePay signature",
);
check(
  recurringNotify.includes("buyna_subscription_charges"),
  "recurring notify route must update charge records",
);
check(
  recurringNotify.includes("globepay_recurring_agreements"),
  "recurring notify route must update agreement records",
);

const recurringFunctions = read("src/lib/buyna-recurring.functions.ts");
check(
  recurringFunctions.includes("GLOBEPAY_RECURRING_NOTIFY_URL"),
  "recurring subscription functions must prefer GLOBEPAY_RECURRING_NOTIFY_URL",
);

for (const serverFnFile of [
  "src/lib/api/example.functions.ts",
  "src/lib/billing.functions.ts",
  "src/lib/buyna-recurring.functions.ts",
]) {
  check(
    !read(serverFnFile).includes(".inputValidator("),
    `${serverFnFile} must use createServerFn().validator() instead of deprecated inputValidator()`,
  );
}

const recurringAdapter = read("src/lib/globepay-recurring.server.ts");
check(
  recurringAdapter.includes("partnerCode&time&nonce_str&credentialCode") ||
    recurringAdapter.includes("${partnerCode}&${time}&${nonce_str}&${credentialCode}"),
  "recurring adapter must sign partner_code&time&nonce_str&credential_code",
);
check(
  recurringAdapter.includes("https://pay.globepay.co.jp/api/v1.0"),
  "recurring adapter must default to GlobePay Japan API base URL",
);

const secretEnvAccess =
  /process\.env\.(SUPABASE_SERVICE_ROLE_KEY|GLOBEPAY_CREDENTIAL_CODE|OPENAI_API_KEY|LOVABLE_API_KEY|BILLING_TOKEN_ENCRYPTION_KEY|PLATFORM_SUBSCRIPTION_API_KEY)/;
const disallowedSecretUsers = walkFiles("src", (path) => /\.(ts|tsx)$/.test(path)).filter(
  (path) => {
    const normalized = rel(path);
    if (
      normalized.includes("/api/") ||
      normalized.endsWith(".server.ts") ||
      normalized.endsWith(".functions.ts") ||
      normalized.endsWith("config.server.ts")
    ) {
      return false;
    }
    return secretEnvAccess.test(readFileSync(path, "utf8"));
  },
);
check(
  disallowedSecretUsers.length === 0,
  `server-only secrets must not be read from browser/client modules: ${disallowedSecretUsers.map(rel).join(", ")}`,
);

// Cloudflare build output
const wranglerOutputPath = ".output/server/wrangler.json";
check(
  hasFile(wranglerOutputPath),
  "Cloudflare generated wrangler.json must exist; run pnpm run build first",
);
if (hasFile(wranglerOutputPath)) {
  const wrangler = readJson(wranglerOutputPath);
  check(wrangler.name === "buyna-ai-official", "Cloudflare worker name must be buyna-ai-official");
  check(wrangler.main === "index.mjs", "Cloudflare worker main must be index.mjs");
  check(wrangler.assets?.binding === "ASSETS", "Cloudflare worker must bind static assets");
  check(
    Array.isArray(wrangler.compatibility_flags) &&
      wrangler.compatibility_flags.includes("nodejs_compat"),
    "Cloudflare worker must enable nodejs_compat",
  );
  check(
    /^\d{4}-\d{2}-\d{2}$/.test(wrangler.compatibility_date ?? ""),
    "Cloudflare compatibility_date must be set",
  );
  check(
    wrangler.keep_vars === true,
    "Cloudflare worker config must keep dashboard-managed variables",
  );
  check(
    wrangler.observability?.enabled === true,
    "Cloudflare worker config must enable observability",
  );
  for (const secret of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "GLOBEPAY_CREDENTIAL_CODE",
    "BILLING_TOKEN_ENCRYPTION_KEY",
  ]) {
    check(
      wrangler.secrets?.required?.includes(secret),
      `Cloudflare worker config must require ${secret}`,
    );
  }
}

// Documentation
for (const doc of [
  "README.md",
  "docs/CLOUDFLARE_DEPLOYMENT.md",
  "docs/CONTENT_EDITING_GUIDE.md",
  "docs/EXTERNAL_PRODUCTION_CHECKLIST.md",
  "docs/OFFICIAL_SITE_ROADMAP.md",
  "docs/UPDATE_PACKAGE.md",
]) {
  check(hasFile(doc), `${doc} must exist`);
}
check(
  read("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes("pnpm run check:github-source") &&
    read("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes("pnpm run production:readiness-plan") &&
    read("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes("pnpm run prod-evidence:plan") &&
    read("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes("pnpm run check:cloudflare-account") &&
    read("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes("pnpm run supabase:migration-plan") &&
    read("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes("pnpm run globepay:dashboard-plan") &&
    read("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes("pnpm run check:prod-env") &&
    read("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes("WorldPay Recurring") &&
    read("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes("pnpm run payment:verification-plan") &&
    read("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes("PAY_SUCCESS") &&
    read("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes("pnpm run audit:goal:strict"),
  "external production checklist must cover GitHub, Cloudflare, prod env, GlobePay, payment proof, and final strict audit",
);
check(
  read("docs/UPDATE_PACKAGE.md").includes("pnpm run package:update") &&
    read("docs/UPDATE_PACKAGE.md").includes("pnpm run package:check") &&
    read("docs/UPDATE_PACKAGE.md").includes("UPDATE_PACKAGE_MANIFEST.json") &&
    read("docs/UPDATE_PACKAGE.md").includes(".github") &&
    read("docs/UPDATE_PACKAGE.md").includes(".production-evidence.json") &&
    read("docs/UPDATE_PACKAGE.md").includes("node_modules"),
  "update package docs must explain the command, manifest, and excluded files",
);
check(
  read("docs/CLOUDFLARE_DEPLOYMENT.md").includes("pnpm run check:prod-env"),
  "Cloudflare deployment docs must include production env preflight",
);
check(
  read("docs/CLOUDFLARE_DEPLOYMENT.md").includes("pnpm run check:cloudflare-account"),
  "Cloudflare deployment docs must include Cloudflare account preflight",
);
check(
  read("docs/CLOUDFLARE_DEPLOYMENT.md").includes("pnpm run cloudflare:env-plan"),
  "Cloudflare deployment docs must include Cloudflare environment setup plan",
);
check(
  read("docs/CLOUDFLARE_DEPLOYMENT.md").includes("pnpm run check:launch"),
  "Cloudflare deployment docs must include launch readiness check",
);
check(
  read("docs/CLOUDFLARE_DEPLOYMENT.md").includes("pnpm run deploy:preflight"),
  "Cloudflare deployment docs must include deployment preflight command",
);
check(
  read("docs/CLOUDFLARE_DEPLOYMENT.md").includes("pnpm run check:prod-evidence"),
  "Cloudflare deployment docs must include production evidence check",
);
check(
  read("docs/CLOUDFLARE_DEPLOYMENT.md").includes("pnpm run cf:prepare"),
  "Cloudflare deployment docs must explain generated config preparation",
);
check(
  read("docs/CLOUDFLARE_DEPLOYMENT.md").includes("must not use localhost") &&
    read("docs/CLOUDFLARE_DEPLOYMENT.md").includes("must not point to a Lovable preview domain"),
  "Cloudflare deployment docs must document production-domain callback guards",
);
check(
  read("docs/CLOUDFLARE_DEPLOYMENT.md").includes("Do not create any VITE_* variables for secrets"),
  "Cloudflare deployment docs must warn against VITE-prefixed secrets",
);
check(
  read("scripts/deploy-preflight.mjs").includes(".env.production.example"),
  "deployment preflight must direct missing production env files to .env.production.example",
);
check(hasFile("scripts/audit-official-goal.mjs"), "goal audit script must exist");
check(
  hasFile("scripts/check-production-evidence.mjs"),
  "production evidence check script must exist",
);
check(
  hasFile("scripts/production-evidence-rules.mjs"),
  "production evidence validation rules must exist",
);
check(hasFile(".production-evidence.example.json"), ".production-evidence.example.json must exist");
check(
  read(".gitignore").includes(".production-evidence.json"),
  ".production-evidence.json must be ignored by git",
);
check(
  read(".gitignore").includes(".resume-after-access-status.json"),
  ".resume-after-access-status.json must be ignored by git",
);
check(
  read(".gitignore").includes(".resume-after-access-watch.log"),
  ".resume-after-access-watch.log must be ignored by git",
);
check(
  hasFile(".resume-after-access-status.example.json"),
  ".resume-after-access-status.example.json must exist",
);
const resumeStatusExample = readJson(".resume-after-access-status.example.json");
check(
  resumeStatusExample.statusFile === ".resume-after-access-status.json" &&
    Array.isArray(resumeStatusExample.steps) &&
    resumeStatusExample.steps.some((step) => step.name === "GitHub source of truth") &&
    resumeStatusExample.steps.some((step) => step.name === "Cloudflare account and Worker config"),
  "resume status example must document the local status file shape",
);
check(
  showResumeStatusScript.includes(".resume-after-access-status.json") &&
    showResumeStatusScript.includes("--status-file") &&
    showResumeStatusScript.includes("resume:after-access") &&
    showResumeStatusScript.includes("Ready:"),
  "resume status script must summarize the local readiness status file",
);
const evidenceTemplate = readJson(".production-evidence.example.json");
check(
  evidenceTemplate.globepayDashboard?.oneTimeNotifyUrl ===
    "https://www.buyna.ai/api/public/globepay/notify" &&
    evidenceTemplate.globepayDashboard?.recurringNotifyUrl ===
      "https://www.buyna.ai/api/public/globepay-recurring-notify" &&
    evidenceTemplate.globepayDashboard?.returnUrl === "https://www.buyna.ai/subscription/return",
  "production evidence template must pin GlobePay production callback URLs",
);
check(
  evidenceTemplate.paymentVerification?.oneTime?.resultCode === "PAY_SUCCESS" &&
    evidenceTemplate.paymentVerification?.recurring?.agreementStatus === "ACTIVE" &&
    evidenceTemplate.paymentVerification?.recurring?.firstChargeResultCode === "PAY_SUCCESS",
  "production evidence template must require PAY_SUCCESS and ACTIVE recurring agreement proof",
);
check(
  read("README.md").includes("pnpm run audit:goal") &&
    read("docs/OFFICIAL_SITE_ROADMAP.md").includes("pnpm run audit:goal") &&
    read("docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md").includes("pnpm run audit:goal"),
  "docs must include the full-goal audit command",
);

const runbook = readMaybe("docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md");
check(Boolean(runbook), "docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md must exist");
for (const requiredRunbookText of [
  ".env.production.example",
  "pnpm run check:prod-env",
  "pnpm run cf:deploy:dry-run",
  "pnpm run cf:deploy",
  "pnpm run smoke:url",
  "supabase/migrations",
  "WorldPay Recurring",
  "3DS",
  "ACTIVE",
  "PAY_SUCCESS",
  "https://www.buyna.ai/api/public/globepay/notify",
  "https://www.buyna.ai/api/public/globepay-recurring-notify",
  "https://www.buyna.ai/subscription/return",
  "wrangler tail",
  "wrangler rollback",
]) {
  check(
    runbook.includes(requiredRunbookText),
    `production runbook must include ${requiredRunbookText}`,
  );
}

warn(
  env.get("GLOBEPAY_MODE") === "mock",
  ".env.example should stay in mock mode; production must set GLOBEPAY_MODE=live in Cloudflare",
);

if (warnings.length) {
  console.log("\nWarnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (failures.length) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("\nOK: launch readiness source checks passed.");
