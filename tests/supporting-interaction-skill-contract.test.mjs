import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const paths = {
  builder: "skills/buyna-website-builder/SKILL.md",
  routing: "skills/buyna-website-builder/references/routing-map.md",
  workflow: "skills/buyna-website-builder/references/workflow-state-contract.md",
  s3: "skills/buyna-s3-storage/SKILL.md",
  fileContract: "skills/buyna-s3-storage/references/merchant-file-adapter-contract.md",
  dashboard: "skills/buyai-dashboard-data-interaction/SKILL.md",
  product: "skills/buyai-product-merchant-backend/SKILL.md",
  booking: "skills/buyai-booking-service-backend/SKILL.md",
  frontend: "skills/buyna-frontend-builder/SKILL.md",
  storefront: "skills/buyai-storefront-layout-ux/SKILL.md",
  onboarding: "skills/buyna-merchant-onboarding/SKILL.md",
  operations: "skills/buyna-skill-operations/SKILL.md",
};

function assertNoFixedVisualRequirements(content) {
  const positiveLines = content.split(/\r?\n/).filter((line) =>
    !/\b(?:do not|does not|never|no |not |without|remain(?:s)? project-generated|generated per project|outside)\b/i.test(line)
  ).join("\n");
  assert.doesNotMatch(positiveLines, /\b(?:fixed|standard|shared|common|canonical)\s+(?:login screen|Dashboard shell|gallery theme|file-card component)\b/i);
  assert.doesNotMatch(positiveLines, /\b(?:fixed|standard|shared|common|canonical)\s+(?:colors?|fonts?|spacing|icons?|visual markup|layout|skin|theme)\b/i);
}

test("Builder is the single entrypoint and exposes bounded Dashboard selection without a new phase", () => {
  const builder = read(paths.builder);
  const routing = read(paths.routing);
  const workflow = read(paths.workflow);
  assert.match(builder, /single team entrypoint/i);
  assert.match(builder, /dashboardSlice/);
  assert.match(routing, /dashboardSlice.*persisted.*configuration\.dashboardSlices/is);
  assert.match(routing, /DASHBOARD_SLICE_REQUIRED/);
  assert.match(routing, /DASHBOARD_FULL_SCOPE_APPROVAL_REQUIRED/);
  assert.match(builder, /setApprovedDashboardSlices/);
  assert.match(builder, /authorizeWorkPackage/);
  assert.match(builder, /openRepairSlice/);
  assert.match(routing, /workflow transition evidence/i);
  assert.doesNotMatch(builder, /hydrateVerifiedWorkflowState|verifyHistoryReceipt/);
  assert.doesNotMatch(routing, /hydrateVerifiedWorkflowState|verifyHistoryReceipt/);
  assert.match(builder, /loadVerifiedWorkflow/);
  assert.match(routing, /loadVerifiedWorkflow/);
  assert.match(builder, /loadPinnedWorkflowAuthority/);
  assert.match(routing, /pinned\s+public key|public key.*pinned/is);
  assert.match(routing, /fresh nonce|nonce.*fresh/is);
  assert.match(routing, /conditional|CAS/);
  assert.match(`${builder}\n${routing}\n${workflow}`, /opaque[^\n]*single-use proof|single-use[^\n]*opaque proof/i);
  assert.match(`${builder}\n${workflow}`, /immutable[^\n]*(?:revision|candidate)/i);
  assert.match(`${builder}\n${workflow}`, /atomic[^\n]*current pointer|current\.json/i);
  assert.match(`${builder}\n${routing}`, /dashboardSlices[^\n]*dashboardSliceApproval|Dashboard slices[^\n]*slice approval/is);
  assert.match(builder, /trusted server initialization|server initialization.*trusted/is);
  assert.match(routing, /RDS|DynamoDB|KMS/);
  assert.doesNotMatch(`${builder}\n${routing}`, /private key|signing secret/i);
  assert.match(builder, /every (?:persisted )?(?:resume|load)|every resume/is);
  assert.match(routing, /WORKFLOW_STATE_PROVENANCE_UNTRUSTED/);
  assert.match(routing, /append-only (?:journal|history)/i);
  assert.match(routing, /serialized.*not trusted|not trust.*serialized/is);
  assert.match(builder, /currentGate.*frontend_code.*ready/is);
  assert.match(builder, /DASHBOARD_SLICE_SCOPE_CHANGE_REQUIRED/);
});

test("S3 Skill links the fixed queue and executor while transport remains an Adapter", () => {
  const content = `${read(paths.s3)}\n${read(paths.fileContract)}`;
  assert.match(content, /packages\/buyna-merchant-file-core/);
  assert.match(content, /createUploadQueue/);
  assert.match(content, /createUploadEffectExecutor/);
  assert.match(content, /S3.*Adapter|Adapter.*S3/is);
  assert.match(content, /confirm.*replace.*delete.*cleanup/is);
});

test("protected Dashboard requests always authenticate then resolve current-host merchant context", () => {
  const dashboard = read(paths.dashboard);
  const authIndex = dashboard.indexOf("buyna-auth-session-core");
  const contextIndex = dashboard.indexOf("buyna-merchant-context-core");
  const apiIndex = dashboard.indexOf("business Adapter");
  assert.ok(authIndex >= 0 && contextIndex > authIndex && apiIndex > contextIndex);
  assert.match(dashboard, /every protected request/i);
  assert.match(dashboard, /current server-observed host/i);
  assert.match(dashboard, /never cache|must not cache/i);
});

test("backend children inherit the approved work package and Adapter contract, never runtime identity", () => {
  for (const path of [paths.product, paths.booking]) {
    const content = read(path);
    assert.match(content, /configuration\.workPackage/);
    assert.match(content, /approved fixed-module selection/i);
    assert.match(content, /approved Adapter contract/i);
    assert.match(content, /request-local immutable merchant context/i);
    assert.match(content, /do not repeat onboarding|never repeat onboarding/i);
    assert.match(content, /fresh trusted auth/i);
    assert.match(content, /current server-observed host/i);
    assert.match(content, /never inherit.*runtime identity|runtime identity.*never inherit/is);
    assert.doesNotMatch(content, /cache(?:d)? (?:the )?(?:resolved )?(?:identity|merchant context)|startup-time (?:identity|merchant context)/i);
  }
});

test("frontend and storefront generate visible file and gallery UI per project", () => {
  for (const path of [paths.frontend, paths.storefront]) {
    const content = read(path);
    assert.match(content, /file.*gallery.*generated per project|gallery.*file.*generated per project/is);
    assert.match(content, /headless behavior/i);
    assert.doesNotMatch(content, /buyna-storefront-gallery-core/);
  }
});

test("onboarding registers context lookup inputs and operations verifies accepted modules plus gallery deferral", () => {
  const onboarding = read(paths.onboarding);
  assert.match(onboarding, /host.*membership.*subjectId.*projectId.*sellerId/is);
  assert.match(onboarding, /buyna-merchant-context-core/);

  const operations = read(paths.operations);
  for (const module of ["buyna-merchant-file-core", "buyna-auth-session-core", "buyna-merchant-context-core"]) {
    assert.match(operations, new RegExp(module));
  }
  assert.match(operations, /gallery.*deferred|deferred.*gallery/is);
});

test("shared contracts fix behavior without prescribing a visual skin", () => {
  const all = Object.values(paths).map(read).join("\n");
  assert.match(all, /generated per project/i);
  assertNoFixedVisualRequirements(all);
  for (const mutation of [
    "Use a shared login screen for every merchant.",
    "The standard Dashboard shell is required.",
    "Import the fixed gallery theme.",
    "All projects use one common file-card component.",
    "Use fixed colors, fonts, layout, spacing, and icons.",
  ]) {
    assert.throws(() => assertNoFixedVisualRequirements(`${all}\n${mutation}`));
  }
});
