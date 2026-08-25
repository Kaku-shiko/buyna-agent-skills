import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const { planWebsiteRoute, resolveRouteDependencyClosure } = await import(
  new URL("skills/buyna-website-builder/scripts/route-builder.mjs", root)
);
const {
  approveGate,
  authorizeWorkPackage,
  createWorkflow,
  recordDelivery,
  requestApproval,
  setApprovedDashboardSlices,
  startGate,
} = await import(new URL("packages/buyna-workflow-state-core/src/index.mjs", root));

const gates = [
  "customer_intake",
  "design_and_structure",
  "frontend_code",
  "dashboard_integration",
  "checkout_payment",
  "testing_upload_gate",
  "aws_release",
];

const productCapabilities = (overrides = {}) => ({
  siteType: "commerce",
  requiresDashboard: true,
  requiresCart: true,
  requiresCheckout: true,
  requiresPayment: false,
  requiresBooking: false,
  requiresCatalog: true,
  requiresInventory: true,
  requiresCoupons: false,
  ...overrides,
});

const staticCapabilities = {
  siteType: "content",
  requiresDashboard: false,
  requiresCart: false,
  requiresCheckout: false,
  requiresPayment: false,
  requiresBooking: false,
  requiresCatalog: false,
  requiresInventory: false,
  requiresCoupons: false,
};

const approved = (delivery) => ({
  status: "approved",
  delivery,
  approvedBy: "user",
  approvedAt: "2026-08-25T01:00:00.000Z",
});

const deliveryFor = (gate, capabilities, paymentArchitecture) => ({
  customer_intake: {
    record: "intake.json",
    capabilities,
    ...(paymentArchitecture ? { paymentArchitecture } : {}),
  },
  design_and_structure: {
    designRecord: "design.json",
    pageStructure: "pages.json",
    boardStatus: "delivered",
  },
  frontend_code: {
    deliveredFiles: ["app.tsx"],
    verification: ["PASS"],
    interfaceContract: "contract.json",
  },
  dashboard_integration: {
    completedSlices: capabilities.requiresDashboard ? ["orders"] : [],
    frontendFiles: ["dashboard.tsx"],
    backendFiles: ["server.mjs"],
    verification: ["PASS"],
  },
  checkout_payment: {
    pendingOrder: true,
    checkoutFlowVerified: true,
    verification: ["PASS"],
  },
  testing_upload_gate: { result: "PASS", verification: ["PASS"] },
  aws_release: {
    architectureType: "external_legacy",
    releaseVersion: "v1",
    newEc2Instances: 0,
    newDatabases: 0,
    newBuckets: 0,
    newPorts: 0,
    verifiedTarget: "existing-target",
    verifiedUrls: ["https://example.com"],
    health: "passed",
    rollback: "release-v0",
  },
}[gate]);

function stateAt(currentGate, capabilities, workPackageGates = []) {
  const state=workflowAtGate(currentGate, capabilities);
  if (workPackageGates.length) {
    return authorizeWorkPackage({
      state,
      gates: workPackageGates,
      scope: "approved lifecycle route test",
      authorizedBy: "user",
      now: "2026-08-26T00:00:00.000Z",
    }).state;
  }
  return state;
}

function assertManifestEvidence(route) {
  assert.deepEqual(route.manifestVerification, {
    profile: "website-builder",
    verified: true,
  });
}

function approveCurrentGate(state, gate, delivery) {
  state = startGate({ state, gate }).state;
  state = recordDelivery({ state, gate, delivery }).state;
  state = requestApproval({ state, gate }).state;
  return approveGate({ state, gate, approvedBy: "route-test" }).state;
}

function workflowAtGate(targetGate, capabilities) {
  const paymentArchitecture = capabilities.requiresPayment ? "fixed-cores" : undefined;
  let state = createWorkflow({ projectId: "route-test" });
  state = approveCurrentGate(state, "customer_intake", deliveryFor("customer_intake", capabilities, paymentArchitecture));
  if (targetGate === "design_and_structure") return state;
  state = approveCurrentGate(state, "design_and_structure", deliveryFor("design_and_structure", capabilities, paymentArchitecture));
  if (capabilities.requiresDashboard) state = setApprovedDashboardSlices({
    state, slices: ["orders"], approvedBy: "user",
  }).state;
  if (targetGate === "frontend_code") return state;
  state = approveCurrentGate(state, "frontend_code", deliveryFor("frontend_code", capabilities, paymentArchitecture));
  if (targetGate === "dashboard_integration") return state;
  state = approveCurrentGate(state, "dashboard_integration", deliveryFor("dashboard_integration", capabilities, paymentArchitecture));
  return state;
}

test("stock and SKU Dashboard selects catalog, inventory, and operation state exactly once", () => {
  const capabilities = productCapabilities();
  const workflowState = workflowAtGate("dashboard_integration", capabilities);
  const route = planWebsiteRoute({
    capabilities,
    workflowState,
    requestedSlice: "dashboard_integration",
  });

  assert.deepEqual(workflowState.configuration.capabilities, capabilities);

  assert.deepEqual(route.skills, [
    "buyai-product-merchant-backend",
    "buyai-dashboard-data-interaction",
  ]);
  assert.deepEqual(route.fixedModules, [
    "buyna-workflow-state-core",
    "buyna-merchant-catalog-core",
    "buyna-inventory-core",
    "buyna-merchant-dashboard-core",
    "buyna-auth-session-core",
    "buyna-merchant-context-core",
    "buyna-order-core",
  ]);
  assert.equal(new Set(route.skills).size, route.skills.length);
  assert.equal(new Set(route.fixedModules).size, route.fixedModules.length);
  assert.equal(route.continueWithoutConfirmation, false);
  assert.deepEqual(route.externalActions, { git: false, aws: false });
  assertManifestEvidence(route);
});

test("explicit mixed-site catalog capability selects product modules without a cart", () => {
  const capabilities = {
    ...productCapabilities(),
    siteType: "mixed",
    requiresCart: false,
    requiresCheckout: false,
    requiresInventory: false,
    requiresBooking: true,
  };
  const route = planWebsiteRoute({
    capabilities,
    workflowState: workflowAtGate("dashboard_integration", capabilities),
    requestedSlice: "dashboard_integration",
  });

  assert.ok(route.skills.includes("buyai-product-merchant-backend"));
  assert.ok(route.skills.includes("buyai-booking-service-backend"));
  assert.ok(route.fixedModules.includes("buyna-merchant-catalog-core"));
});

test("legacy mixed booking and payment evidence without cart does not infer product modules", () => {
  const legacy = {
    siteType: "mixed",
    requiresDashboard: true,
    requiresCart: false,
    requiresCheckout: true,
    requiresPayment: true,
    requiresBooking: true,
  };
  const workflowState = workflowAtGate("dashboard_integration", legacy);
  const route = planWebsiteRoute({
    capabilities: workflowState.configuration.capabilities,
    workflowState,
    requestedSlice: "dashboard_integration",
  });

  assert.equal(workflowState.configuration.capabilities.requiresCatalog, false);
  assert.equal(workflowState.configuration.capabilities.requiresInventory, false);
  assert.ok(route.skills.includes("buyai-booking-service-backend"));
  assert.ok(!route.skills.includes("buyai-product-merchant-backend"));
  assert.ok(!route.fixedModules.includes("buyna-merchant-catalog-core"));
  assert.ok(!route.fixedModules.includes("buyna-inventory-core"));
});

test("core-created mixed state persists explicit product flags without a migration detour", () => {
  const legacy = {
    siteType: "mixed",
    requiresDashboard: true,
    requiresCart: false,
    requiresCheckout: true,
    requiresPayment: true,
    requiresBooking: true,
  };
  const route = planWebsiteRoute({
    capabilities: legacy,
    workflowState: stateAt("dashboard_integration", legacy),
    requestedSlice: "dashboard_integration",
  });

  assert.equal(route.capabilityMigration, undefined);
  assert.equal(route.action, "execute");
  assert.equal(stateAt("dashboard_integration", legacy).configuration.capabilities.requiresCatalog, false);
  assert.ok(!route.skills.includes("buyai-product-merchant-backend"));
});

test("coupon capability selects the one coupon Skill and fixed coupon module", () => {
  const capabilities = productCapabilities({ requiresCoupons: true });
  const route = planWebsiteRoute({
    capabilities,
    workflowState: workflowAtGate("checkout_payment", capabilities),
    requestedSlice: "checkout_payment",
  });

  assert.equal(route.skills.filter((name) => name === "buyai-coupon-commerce").length, 1);
  assert.equal(route.fixedModules.filter((name) => name === "buyna-coupon-core").length, 1);
  assert.ok(route.fixedModules.includes("buyna-inventory-core"));
  assert.ok(route.fixedModules.includes("buyna-merchant-catalog-core"));
  assert.equal(route.action, "execute");
  assertManifestEvidence(route);
});

test("absence of coupons skips only coupon while checkout remains executable", () => {
  const capabilities = productCapabilities({ requiresCoupons: false });
  const route = planWebsiteRoute({
    capabilities,
    workflowState: workflowAtGate("checkout_payment", capabilities),
    requestedSlice: "checkout_payment",
  });

  assert.equal(route.action, "execute");
  assert.equal(route.continueWithoutConfirmation, false);
  assert.ok(route.fixedModules.includes("buyna-checkout-flow-core"));
  assert.ok(route.fixedModules.includes("buyna-merchant-catalog-core"));
  assert.ok(route.fixedModules.includes("buyna-inventory-core"));
  assert.ok(!route.fixedModules.includes("buyna-coupon-core"));
  assert.ok(!route.skills.includes("buyai-coupon-commerce"));
  assertManifestEvidence(route);
});

test("every interactive Dashboard frontend and repair route selects operation state", () => {
  const capabilities = productCapabilities();
  for (const requestedSlice of ["frontend_code", "dashboard_integration"]) {
    const route = planWebsiteRoute({
      capabilities,
      workflowState: stateAt(requestedSlice, capabilities, [requestedSlice]),
      requestedSlice,
      mode: "repair",
    });
    assert.ok(route.fixedModules.includes("buyna-merchant-dashboard-core"));
    assert.equal(route.continueWithoutConfirmation, true);
    assertManifestEvidence(route);
  }
});

test("persisted lifecycle capabilities remain authoritative", () => {
  const persisted = productCapabilities({ requiresCoupons: true });
  const requested = productCapabilities({ requiresCoupons: false });
  const route = planWebsiteRoute({
    capabilities: requested,
    workflowState: stateAt("dashboard_integration", persisted),
    requestedSlice: "dashboard_integration",
  });

  assert.equal(route.action, "blocked");
  assert.equal(route.reason, "CAPABILITY_SCOPE_CHANGE_REQUIRED");
  assert.deepEqual(route.skills, []);
  assertManifestEvidence(route);
});

test("static local work skips all commerce lifecycle modules and external actions", () => {
  const route = planWebsiteRoute({
    capabilities: staticCapabilities,
    workflowState: stateAt("frontend_code", staticCapabilities),
    requestedSlice: "local_preview",
  });

  assert.deepEqual(route.skills, ["buyna-frontend-builder"]);
  assert.deepEqual(route.fixedModules, ["buyna-workflow-state-core"]);
  assert.deepEqual(route.externalActions, { git: false, aws: false });
  assertManifestEvidence(route);
});

test("dependency closure preserves exactly one selected lifecycle dependency", () => {
  const capabilities = productCapabilities({ requiresCoupons: true });
  const route = planWebsiteRoute({
    capabilities,
    workflowState: stateAt("dashboard_integration", capabilities),
    requestedSlice: "dashboard_integration",
  });
  const closure = resolveRouteDependencyClosure(route);

  assert.equal(closure.fixedModules.filter((name) => name === "buyna-coupon-core").length, 1);
  assert.equal(closure.fixedModules.filter((name) => name === "buyna-inventory-core").length, 1);
  assert.equal(closure.fixedModules.filter((name) => name === "buyna-merchant-catalog-core").length, 1);
  assert.equal(closure.fixedModules.filter((name) => name === "buyna-merchant-dashboard-core").length, 1);
  assert.deepEqual(closure.skills, route.skills);
  assert.deepEqual(closure.fixedModules, route.fixedModules);
  assert.ok(!closure.skills.includes("buyai-checkout-address-ux"));
  assert.ok(!closure.fixedModules.includes("buyna-cart-core"));
  assert.equal(closure.fixedModules.filter((name) => name === "buyna-order-core").length, 1);
});

test("checkout dependency closure does not reinvoke already selected children", () => {
  const capabilities = productCapabilities({ requiresCoupons: true });
  const route = planWebsiteRoute({
    capabilities,
    workflowState: workflowAtGate("checkout_payment", capabilities),
    requestedSlice: "checkout_payment",
  });
  const closure = resolveRouteDependencyClosure(route);

  assert.deepEqual(closure.skills, route.skills);
  assert.deepEqual(closure.fixedModules, route.fixedModules);
  assert.equal(new Set(closure.skills).size, closure.skills.length);
  assert.equal(new Set(closure.fixedModules).size, closure.fixedModules.length);
});

test("coupon checkout guidance references only the exported fixed-core contract", async () => {
  const couponExports = await import(new URL("packages/buyna-coupon-core/src/index.mjs", root));
  const couponModule = couponExports.createCouponModule({
    projectId: "route-test",
    sellerId: "seller-route-test",
    store: { transaction: async () => undefined },
  });
  const guidance = read("skills/buyai-globepay-checkout/SKILL.md");

  assert.equal(typeof couponExports.createCouponModule, "function");
  assert.equal(typeof couponModule.quote, "function");
  assert.equal(typeof couponModule.reserve, "function");
  assert.equal("resolveCouponPaymentAmount" in couponExports, false);
  assert.doesNotMatch(guidance, /resolveCouponPaymentAmount/);
  assert.match(guidance, /createCouponModule/);
  assert.match(guidance, /quote/);
  assert.match(guidance, /reserve/);
  assert.match(guidance, /payableAmount/);
  assert.match(guidance, /immutable|locked/i);
});

test("canonical coupon Skill and generated-UI boundary are repository-visible", () => {
  const manifest = JSON.parse(read("repository-manifest.json"));
  assert.ok(manifest.skills.includes("buyai-coupon-commerce"));
  assert.ok(manifest.profiles["website-builder"].skills.includes("buyai-coupon-commerce"));
  assert.match(read("skills/buyai-coupon-commerce/SKILL.md"), /^description:\s*["']?Use when\b/im);
  assert.match(read("skills/buyai-coupon-commerce/SKILL.md"), /references\/coupon-adapter-contract\.md/);
  const builder = read("skills/buyna-website-builder/SKILL.md");
  assert.match(builder, /New build:[\s\S]*buyna-customer-intake/);
  assert.match(builder, /Repair or resume:[\s\S]*importVerifiedHistory/);
  assert.match(builder, /EXPLICIT_PRODUCT_CAPABILITY_MIGRATION_REQUIRED/);
  for (const path of [
    "skills/buyna-frontend-builder/SKILL.md",
    "skills/buyna-frontend-builder/references/merchant-dashboard-functional-core.md",
    "skills/buyai-dashboard-data-interaction/SKILL.md",
  ]) {
    const content = read(path);
    assert.match(content, /buyna-merchant-dashboard-core/);
    assert.match(content, /project-owned|project-specific/i);
  }
  for (const path of [
    "skills/buyai-product-merchant-backend/SKILL.md",
    "skills/buyai-dashboard-data-interaction/SKILL.md",
    "skills/buyai-coupon-commerce/SKILL.md",
    "skills/buyna-frontend-builder/SKILL.md",
    "skills/buyai-checkout-address-ux/SKILL.md",
  ]) {
    assert.match(read(path), /returned[\s\S]{0,180}(authoritative|do not|never)|do not[\s\S]{0,180}reinvoke/i);
  }
});

test("Builder default prompt establishes new-build or recovery state before capability routing", () => {
  const prompt = read("skills/buyna-website-builder/agents/openai.yaml");
  const newBuild = prompt.indexOf("New build");
  const repairResume = prompt.indexOf("Repair or resume");
  const persistedRoute = prompt.indexOf("persisted capabilities");

  assert.ok(newBuild >= 0);
  assert.match(prompt, /New build[\s\S]*createWorkflow[\s\S]*customer_intake/);
  assert.ok(repairResume > newBuild);
  assert.match(prompt, /Repair or resume[\s\S]*load[\s\S]*importVerifiedHistory/);
  assert.ok(persistedRoute > repairResume);
  assert.match(prompt, /persisted capabilities[\s\S]*route-builder\.mjs/);

  const newState = createWorkflow({ projectId: "prompt-new-build" });
  const newRoute = planWebsiteRoute({
    capabilities: staticCapabilities,
    workflowState: newState,
    requestedSlice: "frontend_code",
  });
  assert.equal(newRoute.targetGate, "customer_intake");
  assert.deepEqual(newRoute.skills, ["buyna-customer-intake"]);

  const resumedState = workflowAtGate("dashboard_integration", productCapabilities());
  const resumedRoute = planWebsiteRoute({
    capabilities: resumedState.configuration.capabilities,
    workflowState: resumedState,
    requestedSlice: "dashboard_integration",
    mode: "resume",
  });
  assert.equal(resumedRoute.targetGate, "dashboard_integration");
});

test("user installation prefers the current namespaced manifest over a stale legacy manifest", () => {
  const target = mkdtempSync(join(tmpdir(), "buyna-user-manifest-"));
  try {
    const codexRoot = join(target, ".codex");
    const routerRoot = join(codexRoot, "skills", "buyna-website-builder", "scripts");
    const workflowRoot = join(codexRoot, "packages", "buyna-workflow-state-core", "src");
    const manifestRoot = join(codexRoot, "buyna");
    mkdirSync(routerRoot, { recursive: true });
    mkdirSync(workflowRoot, { recursive: true });
    mkdirSync(manifestRoot, { recursive: true });
    copyFileSync(new URL("skills/buyna-website-builder/scripts/route-builder.mjs", root), join(routerRoot, "route-builder.mjs"));
    copyFileSync(new URL("packages/buyna-workflow-state-core/src/index.mjs", root), join(workflowRoot, "index.mjs"));
    copyFileSync(new URL("packages/buyna-workflow-state-core/src/workflow-provenance.mjs", root), join(workflowRoot, "workflow-provenance.mjs"));
    copyFileSync(new URL("repository-manifest.json", root), join(manifestRoot, "repository-manifest.json"));
    writeFileSync(join(codexRoot, "repository-manifest.json"), JSON.stringify({
      schemaVersion: 0,
      skills: [],
      packages: [],
      profiles: { "website-builder": { skills: [], packages: [] } },
    }));

    const run = spawnSync(process.execPath, [join(routerRoot, "route-builder.mjs")], {
      input: JSON.stringify({
        capabilities: staticCapabilities,
        workflowState: stateAt("frontend_code", staticCapabilities),
        requestedSlice: "local_preview",
      }),
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assertManifestEvidence(JSON.parse(run.stdout));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("project installation carries the authoritative manifest used by the installed router", () => {
  const target = mkdtempSync(join(tmpdir(), "buyna-route-install-"));
  try {
    const rootManifest = join(target, "repository-manifest.json");
    const sentinel = "project-owned-manifest";
    writeFileSync(rootManifest, sentinel);
    const installer = new URL("scripts/install.ps1", root);
    const install = spawnSync("powershell", [
      "-ExecutionPolicy", "Bypass",
      "-File", installer.pathname.slice(1),
      "-Scope", "Project",
      "-ProjectPath", target,
    ], { encoding: "utf8" });
    assert.equal(install.status, 0, install.stderr || install.stdout);
    assert.equal(readFileSync(rootManifest, "utf8"), sentinel);
    const installedManifest = join(target, ".agents", "buyna", "repository-manifest.json");
    assert.doesNotThrow(() => JSON.parse(readFileSync(installedManifest, "utf8")));

    const collision = spawnSync("powershell", [
      "-ExecutionPolicy", "Bypass",
      "-File", installer.pathname.slice(1),
      "-Scope", "Project",
      "-ProjectPath", target,
    ], { encoding: "utf8" });
    assert.notEqual(collision.status, 0);
    assert.match(`${collision.stderr}${collision.stdout}`, /namespaced manifest already exists/i);

    const forced = spawnSync("powershell", [
      "-ExecutionPolicy", "Bypass",
      "-File", installer.pathname.slice(1),
      "-Scope", "Project",
      "-ProjectPath", target,
      "-Force",
    ], { encoding: "utf8" });
    assert.equal(forced.status, 0, forced.stderr || forced.stdout);
    assert.equal(readFileSync(rootManifest, "utf8"), sentinel);

    const installedRouter = join(target, ".agents", "skills", "buyna-website-builder", "scripts", "route-builder.mjs");
    const capabilities = staticCapabilities;
    const run = spawnSync(process.execPath, [installedRouter], {
      input: JSON.stringify({
        capabilities,
        workflowState: stateAt("frontend_code", capabilities),
        requestedSlice: "local_preview",
      }),
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assertManifestEvidence(JSON.parse(run.stdout));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
