#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_EVIDENCE_FILE, validateProductionEvidence } from "./production-evidence-rules.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(projectRoot, "..");
const args = process.argv.slice(2);
const strict = args.includes("--strict");
const checks = [];

function read(path) {
  return readFileSync(join(projectRoot, path), "utf8");
}

function readMaybe(path) {
  const full = join(projectRoot, path);
  return existsSync(full) ? readFileSync(full, "utf8") : "";
}

function parseJsonMaybe(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function hasFile(path) {
  return existsSync(join(projectRoot, path));
}

function runGit(args, options = {}) {
  try {
    return execFileSync("git", args, {
      cwd: options.cwd ?? repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function runCommand(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd ?? repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
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

function migrationsText() {
  return walkFiles("supabase/migrations", (path) => path.endsWith(".sql"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

function parseEnvKeys(text) {
  const keys = new Set();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) keys.add(trimmed.slice(0, eq).trim());
  }
  return keys;
}

function add(status, area, evidence, next) {
  checks.push({ status, area, evidence, next });
}

function pass(area, evidence) {
  add("proved", area, evidence, "");
}

function action(area, evidence, next) {
  add("needs-action", area, evidence, next);
}

function missing(area, evidence, next) {
  add("missing", area, evidence, next);
}

function assertStatic(condition, area, evidence, next) {
  if (condition) pass(area, evidence);
  else missing(area, evidence, next);
}

const pkg = JSON.parse(read("package.json"));
const envExample = readMaybe(".env.production.example");
const content = readMaybe("src/content/official-site.ts");
const contentCheck = readMaybe("scripts/check-official-content.mjs");
const githubSourcePlan = readMaybe("scripts/print-github-source-plan.mjs");
const supabaseMigrationPlan = readMaybe("scripts/print-supabase-migration-plan.mjs");
const globepayDashboardPlan = readMaybe("scripts/print-globepay-dashboard-plan.mjs");
const paymentVerificationPlan = readMaybe("scripts/print-payment-verification-plan.mjs");
const productionReadinessPlan = readMaybe("scripts/print-production-readiness-plan.mjs");
const productionEvidencePlan = readMaybe("scripts/print-production-evidence-plan.mjs");
const productionEvidenceTodo = readMaybe("scripts/print-production-evidence-todo.mjs");
const handoffSummary = readMaybe("scripts/print-handoff-summary.mjs");
const aiRoute = readMaybe("src/routes/api/ai-shopping-guide.ts");
const oneTimeNotify = readMaybe("src/routes/api/public/globepay.notify.ts");
const recurringNotify = readMaybe("src/routes/api/public/globepay-recurring-notify.ts");
const recurringAdapter = readMaybe("src/lib/globepay-recurring.server.ts");
const cloudflarePrepare = readMaybe("scripts/prepare-cloudflare-config.mjs");
const cloudflareEnvPlan = readMaybe("scripts/print-cloudflare-env-plan.mjs");
const deployPreflight = readMaybe("scripts/deploy-preflight.mjs");
const packageCheck = readMaybe("scripts/check-update-package.mjs");
const packageUpdate = readMaybe("scripts/package-update.mjs");
const localPreview = readMaybe("scripts/local-preview.mjs");
const resumeAfterAccess = readMaybe("scripts/resume-after-access.mjs");
const showResumeStatus = readMaybe("scripts/show-resume-status.mjs");
const startResumeWatch = readMaybe("scripts/start-resume-watch.ps1");
const wranglerOutput = readMaybe(".output/server/wrangler.json");
const wranglerConfig = parseJsonMaybe(wranglerOutput);
const productionEnvKeys = parseEnvKeys(envExample);
const workflowPath = join(repoRoot, ".github/workflows/official-frontend-ci.yml");
const workflow = existsSync(workflowPath) ? readFileSync(workflowPath, "utf8") : "";
const pullRequestTemplatePath = join(repoRoot, ".github/pull_request_template.md");
const pullRequestTemplate = existsSync(pullRequestTemplatePath)
  ? readFileSync(pullRequestTemplatePath, "utf8")
  : "";
const productionEvidence = validateProductionEvidence({
  projectRoot,
  repoRoot,
  evidenceFile: DEFAULT_EVIDENCE_FILE,
});

console.log("Buyna.ai official frontend goal audit");
console.log(`Project: ${projectRoot}`);
console.log(`Mode: ${strict ? "strict" : "report"}`);

const branch = runGit(["branch", "--show-current"]) || "(unborn or detached)";
const trackedFiles = runGit(["ls-files", "official-frontend"]);
const trackedCount = trackedFiles ? trackedFiles.split(/\r?\n/).filter(Boolean).length : 0;
const sourceStatus = runGit([
  "status",
  "--porcelain",
  "--",
  ".github",
  ".gitignore",
  "official-frontend",
]);
const remotes = runGit(["remote", "-v"]);
const githubRemote = remotes
  .split(/\r?\n/)
  .some((line) => /github\.com[:/]/i.test(line) || /github\.com\//i.test(line));
const ghVersion = runCommand("gh", ["--version"]);
const ghAuthStatus = ghVersion ? runCommand("gh", ["auth", "status"]) : "";
const cloudflareAccountCheck = pkg.scripts?.["check:cloudflare-account"]
  ? runCommand("pnpm", ["run", "check:cloudflare-account"], { cwd: projectRoot })
  : "";
const evidenceCheckByArea = new Map(productionEvidence.checks.map((check) => [check.area, check]));

function applyEvidenceCheck(area) {
  const check = evidenceCheckByArea.get(area);
  if (check?.ok) {
    pass(area, check.evidence);
    return;
  }

  const evidenceMessage = productionEvidence.exists
    ? (check?.evidence ?? `${DEFAULT_EVIDENCE_FILE} is present but incomplete`)
    : `${DEFAULT_EVIDENCE_FILE} is missing`;
  const next = productionEvidence.exists
    ? (check?.next ?? `Run pnpm run check:prod-evidence and complete ${area}.`)
    : `Run pnpm run prod-evidence:init after production deployment, fill real non-secret proof, then run pnpm run check:prod-evidence.`;

  missing(area, evidenceMessage, next);
}

assertStatic(
  trackedCount > 0,
  "Git source",
  `official-frontend has ${trackedCount} tracked files on branch ${branch}`,
  "Add official-frontend and the CI workflow to Git before treating this as the source of truth.",
);

if (sourceStatus) {
  action(
    "Git source",
    "official-frontend/.github/.gitignore have local changes or untracked files",
    "Commit the intended official-frontend source changes before cloud deployment.",
  );
} else {
  pass("Git source", "official-frontend/.github/.gitignore are clean in Git status");
}

if (githubRemote) {
  pass("GitHub remote", "A GitHub remote is configured in this local repository");
} else {
  missing(
    "GitHub remote",
    "No GitHub remote is configured in this local repository",
    "Connect this local repository to the GitHub repository used for production source control.",
  );
}

if (ghVersion) {
  pass("GitHub CLI", ghVersion.split(/\r?\n/)[0]);
} else {
  missing(
    "GitHub CLI",
    "GitHub CLI gh is not installed or not on PATH",
    "Install GitHub CLI and authenticate before pushing the official frontend source.",
  );
}

if (ghVersion && ghAuthStatus) {
  pass("GitHub CLI auth", "gh auth status succeeded");
} else if (ghVersion) {
  missing(
    "GitHub CLI auth",
    "gh is installed but no authenticated session was detected",
    "Run gh auth login before pushing the official frontend source.",
  );
}

applyEvidenceCheck("GitHub source of truth");

assertStatic(
  Boolean(workflow) &&
    workflow.includes("pnpm run verify") &&
    workflow.includes("pnpm run cf:check") &&
    workflow.includes("pnpm run check:launch") &&
    workflow.includes("pnpm run package:update") &&
    workflow.includes("pnpm run package:check") &&
    workflow.includes("pnpm run smoke:local"),
  "CI",
  ".github/workflows/official-frontend-ci.yml verifies build, Cloudflare dry-run, launch checks, update package, and smoke",
  "Keep the official frontend CI workflow in GitHub.",
);

assertStatic(
  Boolean(pkg.scripts?.["github:source-plan"]) &&
    githubSourcePlan.includes("This command is read-only") &&
    githubSourcePlan.includes("git push -u origin") &&
    githubSourcePlan.includes("gh pr create --draft") &&
    readMaybe("docs/GITHUB_SOURCE_OF_TRUTH.md").includes("pnpm run github:source-plan"),
  "GitHub source plan",
  "github:source-plan prints a read-only push, CI, PR, and evidence plan for the official frontend source",
  "Keep a read-only GitHub setup plan available until the production remote and CI are connected.",
);

assertStatic(
  pullRequestTemplate.includes("official-frontend/src/content/official-site.ts") &&
    pullRequestTemplate.includes("pnpm run check:launch") &&
    pullRequestTemplate.includes("pnpm run resume:after-access") &&
    pullRequestTemplate.includes("pnpm run resume:deploy-after-access") &&
    pullRequestTemplate.includes(".production-evidence.json") &&
    pullRequestTemplate.includes("only the explicit deploy-after-access scripts may run it"),
  "PR checklist",
  ".github/pull_request_template.md covers official frontend scope, verification, external readiness, and safety",
  "Keep GitHub PRs aligned with the official frontend source-of-truth gates.",
);

assertStatic(
  pkg.packageManager === "pnpm@11.7.0" &&
    read(".node-version").trim() === "22.13.0" &&
    pkg.engines?.node?.includes(">=22.13"),
  "Runtime",
  "Node 22.13.0 and pnpm 11.7.0 are pinned",
  "Pin Node and pnpm before using the project as a reproducible source.",
);

assertStatic(
  Boolean(
    pkg.scripts?.verify &&
    pkg.scripts?.["preview:local"] &&
    pkg.scripts?.["preview:local:status"] &&
    pkg.scripts?.["preview:local:stop"] &&
    pkg.scripts?.["smoke:local"] &&
    pkg.scripts?.["deploy:preflight"],
  ) &&
    localPreview.includes("--strictPort") &&
    localPreview.includes("previewProcesses") &&
    localPreview.includes(".local-preview.out.log") &&
    deployPreflight.includes("prod-evidence:todo") &&
    deployPreflight.includes("audit:goal"),
  "Local preview and build",
  "verify, fixed-port local preview controls, smoke:local, and deploy:preflight with evidence/audit reporting are present",
  "Restore local verification scripts.",
);

assertStatic(
  Boolean(pkg.scripts?.["package:check"]) &&
    Boolean(pkg.scripts?.["package:update"]) &&
    packageCheck.includes("UPDATE_PACKAGE_MANIFEST.json") &&
    packageUpdate.includes("UPDATE_PACKAGE_MANIFEST.json") &&
    packageUpdate.includes("packageSchemaVersion") &&
    packageUpdate.includes("verificationCommands") &&
    packageUpdate.includes("externalGateCommands") &&
    packageUpdate.includes("includedRoots") &&
    packageUpdate.includes(".github") &&
    packageUpdate.includes(".production-evidence.json") &&
    packageUpdate.includes("node_modules") &&
    packageCheck.includes("sourceCommit must be a full 40-character commit SHA") &&
    packageCheck.includes("Manifest packageFile") &&
    readMaybe("docs/UPDATE_PACKAGE.md").includes("pnpm run package:update"),
  "Update package",
  "package:update creates source zips with official-frontend, .github, a verifiable manifest, and secret/build exclusions",
  "Keep the source update package workflow reproducible and documented.",
);

assertStatic(
  readMaybe("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes("pnpm run check:github-source") &&
    readMaybe("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes(
      "pnpm run check:cloudflare-account",
    ) &&
    readMaybe("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes("pnpm run check:prod-env") &&
    readMaybe("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes("WorldPay Recurring") &&
    readMaybe("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes("PAY_SUCCESS") &&
    readMaybe("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes("pnpm run audit:goal:strict"),
  "External production checklist",
  "docs/EXTERNAL_PRODUCTION_CHECKLIST.md maps remaining external proof gaps to concrete commands and evidence",
  "Keep external production evidence steps documented before final launch.",
);

assertStatic(
  Boolean(pkg.scripts?.["resume:after-access"]) &&
    Boolean(pkg.scripts?.["resume:status"]) &&
    Boolean(pkg.scripts?.["resume:watch"]) &&
    Boolean(pkg.scripts?.["resume:deploy-after-access"]) &&
    Boolean(pkg.scripts?.["resume:watch:background:windows"]) &&
    Boolean(pkg.scripts?.["resume:deploy-after-access:background:windows"]) &&
    resumeAfterAccess.includes("check:github-source") &&
    resumeAfterAccess.includes("check:cloudflare-account") &&
    resumeAfterAccess.includes("check:prod-env") &&
    resumeAfterAccess.includes("deploy:preflight") &&
    resumeAfterAccess.includes("--watch") &&
    resumeAfterAccess.includes("--deploy-when-ready") &&
    resumeAfterAccess.includes("cf:deploy") &&
    resumeAfterAccess.includes("smoke:url") &&
    resumeAfterAccess.includes(".resume-after-access-status.json") &&
    showResumeStatus.includes(".resume-after-access-status.json") &&
    showResumeStatus.includes("Deploy when ready") &&
    startResumeWatch.includes("Start-Process") &&
    startResumeWatch.includes("DeployWhenReady") &&
    startResumeWatch.includes(".resume-after-access-watch.log") &&
    hasFile(".resume-after-access-status.example.json") &&
    resumeAfterAccess.includes("does not run pnpm run cf:deploy") &&
    readMaybe("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes(
      "pnpm run resume:deploy-after-access",
    ) &&
    readMaybe("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes("pnpm run resume:after-access"),
  "Automatic resume after access",
  "resume checks remain safe by default, and explicit deploy-after-access watchers can auto-deploy after every external gate passes",
  "Keep automatic checking and explicit post-access deployment commands ready for after external restrictions are lifted.",
);

assertStatic(
  Boolean(pkg.scripts?.["cf:check"]?.includes("deploy --dry-run")) &&
    Boolean(pkg.scripts?.["cf:deploy"]?.includes("--keep-vars")) &&
    Boolean(pkg.scripts?.["check:cloudflare-account"]) &&
    Boolean(pkg.scripts?.["cloudflare:env-plan"]),
  "Cloudflare",
  "Cloudflare scripts include deploy dry-run, account preflight, redacted env planning, and keep dashboard vars on deploy",
  "Use Wrangler account preflight and deploy dry-runs before production, and preserve dashboard-managed secrets.",
);

if (!wranglerOutput) {
  missing(
    "Cloudflare",
    "Generated .output/server/wrangler.json is missing",
    "Run pnpm run build && pnpm run cf:prepare before Cloudflare deploy checks.",
  );
} else if (
  wranglerConfig.name === "buyna-ai-official" &&
  wranglerConfig.keep_vars === true &&
  wranglerConfig.observability?.enabled === true
) {
  pass(
    "Cloudflare",
    "Generated .output/server/wrangler.json is prepared with worker name, keep_vars, and observability",
  );
} else {
  missing(
    "Cloudflare",
    "Generated .output/server/wrangler.json exists but is not prepared with keep_vars and observability",
    "Run pnpm run cf:prepare or pnpm run cf:check before Cloudflare deploy checks.",
  );
}

assertStatic(
  cloudflarePrepare.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    cloudflarePrepare.includes("GLOBEPAY_CREDENTIAL_CODE") &&
    cloudflarePrepare.includes("BILLING_TOKEN_ENCRYPTION_KEY") &&
    cloudflareEnvPlan.includes("secret put") &&
    cloudflareEnvPlan.includes("This command never prints secret or variable values"),
  "Cloudflare secrets",
  "prepare-cloudflare-config requires the core server-only secrets and cloudflare:env-plan prints redacted setup commands",
  "Keep server-only secrets in Cloudflare secrets or dashboard variables, never in client code.",
);

if (cloudflareAccountCheck) {
  pass("Cloudflare account", "pnpm run check:cloudflare-account passed");
} else if (pkg.scripts?.["check:cloudflare-account"]) {
  missing(
    "Cloudflare account",
    "pnpm run check:cloudflare-account did not pass in this environment",
    "Run pnpm exec wrangler login, then rerun pnpm run check:cloudflare-account before production deployment.",
  );
}

assertStatic(
  content.includes("homeHeroContent") &&
    content.includes("homeEcosystemSection") &&
    content.includes("homeMerchantSection") &&
    content.includes("homePricingSection") &&
    content.includes("homeAiGuideSection") &&
    content.includes("pricingPageContent"),
  "Staged content editing",
  "Official homepage and pricing copy are centralized in src/content/official-site.ts",
  "Centralize official-site copy before staged content edits.",
);

assertStatic(
  Boolean(pkg.scripts?.["check:content"]) &&
    Boolean(pkg.scripts?.verify?.includes("check:content")) &&
    contentCheck.includes("officialSiteContentByLanguage") &&
    contentCheck.includes("compareShape") &&
    contentCheck.includes("subscriptionPlanFeatures") &&
    contentCheck.includes("mojibake"),
  "Staged content editing",
  "check:content verifies zh/ja/en official-site content stays structurally complete before build",
  "Keep multilingual content checks in the local verification path before staged copy edits.",
);

assertStatic(
  readMaybe("src/routes/index.tsx").includes("@/content/official-site") &&
    readMaybe("src/routes/pricing.tsx").includes("@/content/official-site"),
  "Staged content editing",
  "Home and pricing routes read the shared official-site content module",
  "Route pages should render from shared content config.",
);

const migrationSql = migrationsText();
assertStatic(
  aiRoute.includes("process.env.OPENAI_API_KEY") &&
    aiRoute.includes("configured: false") &&
    aiRoute.includes('.from("ai_guide_sources")') &&
    aiRoute.includes('.from("ai_guide_conversations")'),
  "AI shopping guide",
  "AI guide uses a server route, supports not-configured state, reads sources, and logs conversations",
  "Keep OpenAI/Lovable keys server-side and preserve graceful AI fallback.",
);

assertStatic(
  migrationSql.includes("ai_guide_sources") && migrationSql.includes("ai_guide_conversations"),
  "AI shopping guide",
  "Supabase migrations include AI source and conversation tables",
  "Apply AI guide migrations before enabling real answers in production.",
);

assertStatic(
  productionEnvKeys.has("OPENAI_API_KEY") &&
    productionEnvKeys.has("LOVABLE_API_KEY") &&
    !productionEnvKeys.has("VITE_OPENAI_API_KEY") &&
    !productionEnvKeys.has("VITE_LOVABLE_API_KEY"),
  "AI shopping guide",
  ".env.production.example documents server-only AI keys without VITE_ exposure",
  "Do not expose AI provider keys to browser bundles.",
);

assertStatic(
  envExample.includes("GLOBEPAY_BASE_URL=https://pay.globepay.co.jp/api/v1.0") &&
    envExample.includes("GLOBEPAY_NOTIFY_URL=https://www.buyna.ai/api/public/globepay/notify") &&
    envExample.includes(
      "GLOBEPAY_RECURRING_NOTIFY_URL=https://www.buyna.ai/api/public/globepay-recurring-notify",
    ) &&
    envExample.includes("GLOBEPAY_RETURN_URL=https://www.buyna.ai/subscription/return"),
  "GlobePay production config",
  ".env.production.example pins GlobePay Japan base URL and production callback paths",
  "Keep production GlobePay URLs on the production domain.",
);

assertStatic(
  Boolean(pkg.scripts?.["globepay:dashboard-plan"]) &&
    globepayDashboardPlan.includes("This command is read-only") &&
    globepayDashboardPlan.includes("https://pay.globepay.co.jp/api/v1.0") &&
    globepayDashboardPlan.includes("https://www.buyna.ai/api/public/globepay/notify") &&
    globepayDashboardPlan.includes("WorldPay Recurring") &&
    globepayDashboardPlan.includes("Hosted 3DS") &&
    globepayDashboardPlan.includes("PAY_SUCCESS") &&
    globepayDashboardPlan.includes("ACTIVE") &&
    readMaybe("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes("pnpm run globepay:dashboard-plan"),
  "GlobePay dashboard plan",
  "globepay:dashboard-plan prints the Japan host, exact callback URLs, WorldPay Recurring/3DS confirmations, and success-state evidence rules",
  "Keep a read-only GlobePay dashboard plan ready until merchant dashboard settings and payment capabilities are verified.",
);

assertStatic(
  oneTimeNotify.includes("verifyNotifySignature") &&
    oneTimeNotify.includes("PAY_SUCCESS") &&
    oneTimeNotify.includes("markAttemptPaid"),
  "GlobePay one-time payment",
  "One-time notify route verifies signature and only marks paid through server logic",
  "Payment creation or frontend return must never mark paid by itself.",
);

assertStatic(
  recurringNotify.includes("verifyRecurringNotify") &&
    recurringNotify.includes("buyna_subscription_charges") &&
    recurringNotify.includes("globepay_recurring_agreements"),
  "GlobePay recurring payment",
  "Recurring notify route verifies signature and updates charge/agreement records",
  "Keep recurring agreement and charge state synced from verified provider data.",
);

assertStatic(
  recurringAdapter.includes("https://pay.globepay.co.jp/api/v1.0") &&
    (recurringAdapter.includes("partnerCode&time&nonce_str&credentialCode") ||
      recurringAdapter.includes("${partnerCode}&${time}&${nonce_str}&${credentialCode}")),
  "GlobePay recurring payment",
  "Recurring adapter defaults to GlobePay Japan and signs partner_code&time&nonce_str&credential_code",
  "Preserve GlobePay Japan signing order.",
);

assertStatic(
  migrationSql.includes("subscription_plans") &&
    migrationSql.includes("buyna_subscriptions") &&
    migrationSql.includes("buyna_subscription_charges") &&
    migrationSql.includes("globepay_recurring_agreements"),
  "Merchant subscription",
  "Supabase migrations include subscription plans, subscriptions, charges, and recurring agreements",
  "Apply subscription migrations before real subscription billing.",
);

assertStatic(
  Boolean(pkg.scripts?.["payment:verification-plan"]) &&
    paymentVerificationPlan.includes("This command is read-only") &&
    paymentVerificationPlan.includes("PAY_SUCCESS") &&
    paymentVerificationPlan.includes("ACTIVE") &&
    paymentVerificationPlan.includes("notify/query") &&
    paymentVerificationPlan.includes("paidRecordVisibleInAdmin") &&
    paymentVerificationPlan.includes("csvOrAdminTotalsVerified") &&
    readMaybe("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes(
      "pnpm run payment:verification-plan",
    ),
  "Payment verification plan",
  "payment:verification-plan prints one-time and recurring real-payment proof steps, success boundaries, admin/CSV checks, and safe evidence fields",
  "Keep a read-only payment verification plan ready until real one-time and recurring payments are verified.",
);

assertStatic(
  Boolean(pkg.scripts?.["production:readiness-plan"]) &&
    productionReadinessPlan.includes("This command is non-deploying") &&
    productionReadinessPlan.includes("github:source-plan") &&
    productionReadinessPlan.includes("cloudflare:env-plan") &&
    productionReadinessPlan.includes("supabase:migration-plan") &&
    productionReadinessPlan.includes("globepay:dashboard-plan") &&
    productionReadinessPlan.includes("payment:verification-plan") &&
    productionReadinessPlan.includes("audit:goal:strict") &&
    readMaybe("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes(
      "pnpm run production:readiness-plan",
    ),
  "Production readiness plan",
  "production:readiness-plan sequences all read-only external launch plans and the final strict evidence gate",
  "Keep one aggregate launch plan ready so external access can be unlocked and verified in the right order.",
);

assertStatic(
  Boolean(pkg.scripts?.["prod-evidence:plan"]) &&
    Boolean(pkg.scripts?.["prod-evidence:todo"]) &&
    productionEvidencePlan.includes("This command is read-only") &&
    productionEvidencePlan.includes("github") &&
    productionEvidencePlan.includes("productionEnv") &&
    productionEvidencePlan.includes("supabase") &&
    productionEvidencePlan.includes("globepayDashboard") &&
    productionEvidencePlan.includes("productionDeployment") &&
    productionEvidencePlan.includes("paymentVerification") &&
    productionEvidencePlan.includes("Never record") &&
    productionEvidenceTodo.includes("Safe evidence to record") &&
    productionEvidenceTodo.includes("check:prod-evidence") &&
    productionEvidenceTodo.includes("audit:goal:strict") &&
    readMaybe("docs/EXTERNAL_PRODUCTION_CHECKLIST.md").includes("pnpm run prod-evidence:plan"),
  "Production evidence plan",
  "prod-evidence:plan and prod-evidence:todo map every production evidence section to proof commands, missing gates, and safe fields",
  "Keep a read-only evidence collection plan ready until .production-evidence.json proves every external launch gate.",
);

assertStatic(
  Boolean(pkg.scripts?.["handoff:summary"]) &&
    handoffSummary.includes("Buyna.ai Official Frontend Handoff") &&
    handoffSummary.includes("Latest Update Package") &&
    handoffSummary.includes("Read-Only Launch Plans") &&
    handoffSummary.includes("Remaining External Gates") &&
    handoffSummary.includes("Never Commit Or Share") &&
    handoffSummary.includes("audit:goal:strict"),
  "Handoff summary",
  "handoff:summary prints a one-page update package, verification, external gate, and safety handoff",
  "Keep a concise handoff summary available for whoever applies the update package or runs production deployment.",
);

assertStatic(
  Boolean(pkg.scripts?.["supabase:migration-plan"]) &&
    supabaseMigrationPlan.includes("This command is read-only") &&
    supabaseMigrationPlan.includes("information_schema.tables") &&
    supabaseMigrationPlan.includes("ai_guide_sources") &&
    supabaseMigrationPlan.includes("globepay_recurring_agreements") &&
    readMaybe("docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md").includes("pnpm run supabase:migration-plan"),
  "Supabase migration plan",
  "supabase:migration-plan prints the migration files, required production tables, SQL verification helper, and evidence steps",
  "Keep a read-only Supabase migration plan ready until staging and production migrations are applied.",
);

applyEvidenceCheck("Production env");
applyEvidenceCheck("Supabase production migration");
applyEvidenceCheck("GlobePay merchant dashboard");
applyEvidenceCheck("Production deployment");
applyEvidenceCheck("Real payment verification");

if (productionEvidence.exists && productionEvidence.failures.length) {
  for (const failure of productionEvidence.failures) {
    missing(
      "Production evidence file",
      failure,
      `Fix ${DEFAULT_EVIDENCE_FILE} or regenerate it from .production-evidence.example.json.`,
    );
  }
}

const grouped = new Map();
for (const check of checks) {
  if (!grouped.has(check.status)) grouped.set(check.status, []);
  grouped.get(check.status).push(check);
}

for (const status of ["proved", "needs-action", "missing"]) {
  const items = grouped.get(status) ?? [];
  console.log(`\n${status.toUpperCase()} (${items.length})`);
  for (const item of items) {
    console.log(`- ${item.area}: ${item.evidence}`);
    if (item.next) console.log(`  Next: ${item.next}`);
  }
}

const openItems = checks.filter((check) => check.status !== "proved");
if (openItems.length) {
  console.log(`\nGoal status: not complete (${openItems.length} open items).`);
  if (strict) process.exit(1);
} else {
  console.log("\nGoal status: complete.");
}
